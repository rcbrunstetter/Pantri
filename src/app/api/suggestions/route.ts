import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getHouseholdId } from '@/lib/get-household-id'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 })

  const householdId = await getHouseholdId(supabase, userId)
  if (!householdId) return NextResponse.json({ error: 'No household found' }, { status: 400 })

  const [{ data: pantryItems }, { data: memories }] = await Promise.all([
    supabase.from('pantry_items').select('name, quantity, unit, category, created_at').eq('household_id', householdId),
    supabase.from('household_memory').select('memory').eq('household_id', householdId),
  ])

  const now = new Date()
  const dayOfWeek = now.toLocaleDateString('en', { weekday: 'long' })

  const pantryWithAge = pantryItems?.map(item => {
    const addedAt = item.created_at ? new Date(item.created_at) : null
    const daysInPantry = addedAt ? Math.floor((now.getTime() - addedAt.getTime()) / (1000 * 60 * 60 * 24)) : null
    return `- ${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ' ' + item.unit : ''})` : ''}${daysInPantry !== null ? ` — in pantry ${daysInPantry} day${daysInPantry === 1 ? '' : 's'}` : ''}`
  }).join('\n') || 'Pantry is empty.'

  const memoryContext = memories?.map(m => m.memory).join('\n') || 'No memories yet.'

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 300,
    messages: [{
      role: 'user',
      content: `Generate 4 smart, personalized suggestion prompts for a kitchen app user. These appear as tappable buttons on the home screen.

Today is ${dayOfWeek}.

Current pantry:
${pantryWithAge}

Household habits and memories:
${memoryContext}

Rules:
- Make suggestions specific and actionable based on what's actually in the pantry and their habits
- If any item has been in the pantry 4+ days, suggest using it
- If it's a day they usually shop, suggest generating a grocery list
- Keep each suggestion under 60 characters
- No emojis
- Suggestions should feel personal, not generic

Return ONLY a JSON array of 4 suggestion strings. Example format:
["Your chicken is 5 days old — need ideas?", "Generate this week's grocery list", "What can I make with pasta tonight?", "Plan meals for the week"]`
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const clean = raw.replace(/```json|```/g, '').trim()
  const suggestions: string[] = JSON.parse(clean)

  return NextResponse.json({ suggestions })
}
