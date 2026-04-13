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

  const [{ data: pantryItems }, { data: memories }, { data: recentSpending }] = await Promise.all([
    supabase.from('pantry_items').select('name, quantity, unit, category, created_at').eq('household_id', householdId),
    supabase.from('household_memory').select('memory, category').eq('household_id', householdId),
    supabase.from('spending_records').select('amount, store, spent_at').eq('household_id', householdId).order('spent_at', { ascending: false }).limit(10),
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
      content: `Generate 4 smart, highly personalized suggestion prompts for a kitchen app. These are tappable buttons on the home screen. Make them feel like they were written by someone who knows this family well.

Today is ${dayOfWeek}.

Current pantry (with days since added):
${pantryWithAge}

Household habits and memories:
${memoryContext}

Recent spending:
${recentSpending?.map((s: any) => `- $${s.amount} at ${s.store || 'unknown store'} on ${new Date(s.spent_at).toLocaleDateString('en', { weekday: 'long' })}`).join('\n') || 'No spending recorded yet.'}

Rules:
- Be VERY specific — use actual item names from their pantry, actual days they shop, actual stores they visit
- If any perishable item (meat, dairy, produce, fish) has been in pantry 3+ days, prioritize suggesting to use it
- If today is a day they typically shop based on spending patterns, suggest generating a grocery list
- Reference their saved recipes by name when suggesting meals
- Never generate generic suggestions like "What can I make tonight?" — always be specific
- Keep each suggestion under 65 characters
- No emojis

Return ONLY a JSON array of 4 suggestion strings.`
    }],
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '[]'
  const clean = raw.replace(/```json|```/g, '').trim()
  const suggestions: string[] = JSON.parse(clean)

  return NextResponse.json({ suggestions })
}
