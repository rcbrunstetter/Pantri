import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getHouseholdId } from '@/lib/get-household-id'
import { getUserFromRequest } from '@/lib/get-user-from-request'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await req.formData()
  const url = formData.get('url') as string | null
  const file = formData.get('file') as File | null

  if (!url && !file) {
    return NextResponse.json({ error: 'Must provide a URL or image' }, { status: 400 })
  }

  const householdId = await getHouseholdId(supabase, userId)
  if (!householdId) return NextResponse.json({ error: 'No household found' }, { status: 400 })

  let messageContent: any[] = []

  if (url) {
    // Fetch the page content
    try {
      const pageRes = await fetch(url)
      const html = await pageRes.text()
      // Strip HTML tags for cleaner text
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 8000) // Limit to avoid token overflow

      messageContent = [
        {
          type: 'text',
          text: `Extract the recipe from this webpage content:\n\n${text}`,
        },
      ]
    } catch (e) {
      return NextResponse.json({ error: 'Could not fetch URL' }, { status: 400 })
    }
  } else if (file) {
    // Handle image/screenshot
    const fileBuffer = await file.arrayBuffer()

    let mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' = 'image/jpeg'
    if (file.type === 'image/png') mediaType = 'image/png'
    else if (file.type === 'image/webp') mediaType = 'image/webp'

    const { default: sharp } = await import('sharp')
    let convertedBuffer: Buffer
    try {
      convertedBuffer = await sharp(Buffer.from(fileBuffer))
        .rotate()
        .jpeg({ quality: 90 })
        .toBuffer()
    } catch (e) {
      return NextResponse.json({ error: 'Could not process image' }, { status: 400 })
    }

    const base64 = convertedBuffer.toString('base64')

    messageContent = [
      {
        type: 'image',
        source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
      },
      {
        type: 'text',
        text: 'Extract the recipe from this image.',
      },
    ]
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: [
          ...messageContent,
          {
            type: 'text',
            text: `Extract the complete recipe and return ONLY valid JSON in this exact format, nothing else:
{
  "title": "Recipe Name",
  "description": "Brief one-line description",
  "servings": 4,
  "ingredients": [
    {"name": "flour", "quantity": "200", "unit": "g"}
  ],
  "instructions": "Step by step instructions as a single string with each step on a new line starting with a number."
}

Rules:
- Translate everything to English
- Use metric units (grams, ml, liters)
- If you cannot find a recipe, return {"error": "No recipe found"}
- Instructions should be clean numbered steps`,
          },
        ],
      },
    ],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const clean = rawText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    if (parsed.error) {
      return NextResponse.json({ error: parsed.error }, { status: 400 })
    }

    // Save to database
    const { data: recipe, error: dbError } = await supabase
      .from('recipes')
      .insert({
        household_id: householdId,
        title: parsed.title,
        description: parsed.description || null,
        ingredients: parsed.ingredients,
        instructions: parsed.instructions,
        servings: parsed.servings || 2,
        source_url: url || null,
      })
      .select()
      .single()

    if (dbError) {
      console.error('DB error:', dbError)
      return NextResponse.json({ error: 'Failed to save recipe' }, { status: 500 })
    }

    return NextResponse.json({ success: true, recipe })

  } catch (e) {
    console.error('Recipe parse error:', e)
    return NextResponse.json({ error: 'Failed to extract recipe' }, { status: 500 })
  }
}
