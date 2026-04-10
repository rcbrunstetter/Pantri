import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getHouseholdId } from '@/lib/get-household-id'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { message, userId, history } = await req.json()

  const householdId = await getHouseholdId(supabase, userId)
  if (!householdId) return NextResponse.json({ error: 'No household found' }, { status: 400 })

  const [{ data: pantryItems }, { data: profile }, { data: foodProfile }, { data: recipes }] = await Promise.all([
    supabase.from('pantry_items').select('*').eq('household_id', householdId),
    supabase.from('profiles').select('unit_system, family_size').eq('id', userId).single(),
    supabase.from('household_profiles').select('*').eq('household_id', householdId).single(),
    supabase.from('recipes').select('title, ingredients').eq('household_id', householdId),
  ])

  const unitSystem = profile?.unit_system || 'metric'
  const familySize = profile?.family_size || 2
  const isMetric = unitSystem === 'metric'

  function convertToPreferred(quantity: string | null, unit: string | null, metric: boolean): { quantity: string, unit: string } {
    if (!quantity || !unit) return { quantity: quantity || '', unit: unit || '' }
    const qty = parseFloat(quantity)
    if (isNaN(qty)) return { quantity, unit }
    const u = unit.toLowerCase()
    if (metric) {
      if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return { quantity: (qty * 453.6).toFixed(0), unit: 'g' }
      if (u === 'oz' || u === 'ounce' || u === 'ounces') return { quantity: (qty * 28.35).toFixed(0), unit: 'g' }
      if (u === 'gallon' || u === 'gallons' || u === 'gal') return { quantity: (qty * 3785).toFixed(0), unit: 'ml' }
      if (u === 'cup' || u === 'cups') return { quantity: (qty * 240).toFixed(0), unit: 'ml' }
      if (u === 'tbsp' || u === 'tablespoon' || u === 'tablespoons') return { quantity: (qty * 15).toFixed(0), unit: 'ml' }
      if (u === 'tsp' || u === 'teaspoon' || u === 'teaspoons') return { quantity: (qty * 5).toFixed(0), unit: 'ml' }
    } else {
      if (u === 'g' || u === 'gram' || u === 'grams') return { quantity: (qty / 453.6).toFixed(2), unit: 'lbs' }
      if (u === 'kg' || u === 'kilogram' || u === 'kilograms') return { quantity: (qty * 2.205).toFixed(2), unit: 'lbs' }
      if (u === 'ml' || u === 'milliliter' || u === 'milliliters') return { quantity: (qty / 240).toFixed(2), unit: 'cups' }
      if (u === 'l' || u === 'liter' || u === 'liters') return { quantity: (qty * 4.227).toFixed(2), unit: 'cups' }
    }
    return { quantity, unit }
  }

  const unitGuide = isMetric
    ? 'ALWAYS use metric units exclusively: grams (g), kilograms (kg), milliliters (ml), liters (L). Convert ALL quantities to metric — never mix metric and imperial.'
    : 'ALWAYS use imperial units exclusively: ounces (oz), pounds (lbs), cups, gallons, tablespoons (tbsp), teaspoons (tsp). Convert ALL quantities to imperial — never mix metric and imperial.'

  const pantryContext = pantryItems && pantryItems.length > 0
    ? `The user currently has these items in their pantry (all quantities in their preferred units):\n${pantryItems.map(item => {
        const converted = convertToPreferred(item.quantity, item.unit, isMetric)
        return `- ${item.name}${converted.quantity ? ` (${converted.quantity}${converted.unit ? ' ' + converted.unit : ''})` : ''}${item.category ? ` [${item.category}]` : ''}`
      }).join('\n')}`
    : `The user's pantry is currently empty.`

  const systemPrompt = `You are Pantri, a friendly and smart kitchen assistant. You help families track what's in their pantry, suggest meals, save recipes, and generate grocery lists.

${pantryContext}

${foodProfile ? `
Household food profile:
- Dietary restrictions: ${foodProfile.dietary_restrictions?.length ? foodProfile.dietary_restrictions.join(', ') : 'None'}
- Allergies (NEVER suggest these): ${foodProfile.allergies || 'None'}
- Disliked ingredients (avoid these): ${foodProfile.disliked_ingredients || 'None'}
- Preferred cuisines: ${foodProfile.cuisine_preferences?.length ? foodProfile.cuisine_preferences.join(', ') : 'No preference'}
- Weekly grocery budget: ${foodProfile.weekly_budget ? '$' + foodProfile.weekly_budget : 'Not set'}
` : ''}

${recipes && recipes.length > 0 ? `
Saved recipes in their recipe book:
${recipes.map((r: any) => `- ${r.title}`).join('\n')}
When suggesting meals, prioritize recipes they already have saved. You can reference them by name.
` : ''}

User's family size: ${familySize} people
Unit preference: ${unitSystem.toUpperCase()}
${unitGuide}

Your job:
0. Always store item names in English in the pantry, regardless of what language the user writes in.
1. When the user tells you about food they bought, have at home, or used up — update their pantry using a pantry_update block.
2. When the user shares a recipe they are making — subtract the exact ingredient amounts used from the pantry. Convert units to the user's preferred system first.
3. When the user asks to save a recipe to their recipe book — extract the full recipe and include a recipe_save block.
4. Suggest meals based on what they have.
5. Generate grocery lists when asked.
6. Be conversational, warm, and brief.
7. Never use emojis in your responses.

When you need to update the pantry:
<pantry_update>
{
  "add": [{"name": "milk", "quantity": "1", "unit": "liter", "category": "dairy"}],
  "remove": [],
  "adjust": [{"name": "pasta", "quantity": "200", "unit": "g"}]
}
</pantry_update>

When the user asks to save a recipe to their recipe book:
<recipe_save>
{
  "title": "Recipe Name",
  "description": "Brief one-line description",
  "servings": ${familySize},
  "ingredients": [
    {"name": "flour", "quantity": "200", "unit": "g"}
  ],
  "instructions": "1. Step one\n2. Step two\n3. Step three"
}
</recipe_save>

Rules for pantry updates:
- Use "add" for new items
- Use "remove" for fully used items (item name as string)
- Use "adjust" for partially used items with NEW remaining quantity
- Always use the user's preferred unit system
- If depleted, use "remove" not "adjust"

Only include blocks when there are actual changes. Always confirm in friendly plain language.`

  const messages = [
    ...history.map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user' as const, content: message },
  ]

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    system: systemPrompt,
    messages,
  })

  const rawReply = response.content[0].type === 'text' ? response.content[0].text : ''

  // Handle pantry updates
  const pantryUpdateMatch = rawReply.match(/<pantry_update>([\s\S]*?)<\/pantry_update>/)
  if (pantryUpdateMatch) {
    try {
      const updates = JSON.parse(pantryUpdateMatch[1])

      if (updates.add && updates.add.length > 0) {
        const { upsertPantryItem } = await import('@/lib/pantry-utils')
        for (const item of updates.add) {
          await upsertPantryItem(supabase, {
            household_id: householdId,
            name: item.name,
            quantity: item.quantity || null,
            unit: item.unit || null,
            category: item.category || null,
          })
        }
      }

      if (updates.remove && updates.remove.length > 0) {
        for (const itemName of updates.remove) {
          await supabase
            .from('pantry_items')
            .delete()
            .eq('household_id', householdId)
            .ilike('name', itemName)
        }
      }

      if (updates.adjust && updates.adjust.length > 0) {
        for (const item of updates.adjust) {
          const { data: existing } = await supabase
            .from('pantry_items')
            .select('id')
            .eq('household_id', householdId)
            .ilike('name', item.name)
            .single()

          if (existing) {
            await supabase
              .from('pantry_items')
              .update({
                quantity: item.quantity,
                unit: item.unit,
                updated_at: new Date().toISOString(),
              })
              .eq('id', existing.id)
          }
        }
      }
    } catch (e) {
      console.error('Failed to parse pantry update:', e)
    }
  }

  // Handle recipe saves
  const recipeSaveMatch = rawReply.match(/<recipe_save>([\s\S]*?)<\/recipe_save>/)
  if (recipeSaveMatch) {
    try {
      // Extract instructions separately before JSON parsing
      const rawJson = recipeSaveMatch[1].trim()

      // Pull out the instructions value before parsing
      const instructionsMatch = rawJson.match(/"instructions":\s*"([\s\S]*?)"\s*\n?\s*\}/)
      let instructions = ''
      let jsonToParse = rawJson

      if (instructionsMatch) {
        instructions = instructionsMatch[1]
        // Replace the instructions field with a placeholder
        jsonToParse = rawJson.replace(
          /"instructions":\s*"[\s\S]*?"\s*(\n?\s*\})/,
          '"instructions": "__INSTRUCTIONS__"$1'
        )
      }

      // Now safely parse the JSON
      const recipe = JSON.parse(jsonToParse)

      // Restore instructions
      if (instructions) {
        recipe.instructions = instructions.replace(/\\n/g, '\n')
      }
      await supabase.from('recipes').insert({
        household_id: householdId,
        title: recipe.title,
        description: recipe.description || null,
        ingredients: recipe.ingredients,
        instructions: recipe.instructions,
        servings: recipe.servings || familySize,
      })
    } catch (e) {
      console.error('Failed to save recipe:', e)
    }
  }

  const cleanReply = rawReply
    .replace(/<pantry_update>[\s\S]*?<\/pantry_update>/g, '')
    .replace(/<recipe_save>[\s\S]*?<\/recipe_save>/g, '')
    .trim()

  // Quietly extract memories from this conversation
  try {
    const { data: existingMemories } = await supabase
      .from('household_memory')
      .select('memory')
      .eq('household_id', householdId)

    const memoryContext = existingMemories?.map(m => m.memory).join('\n') || 'No memories yet.'

    const memoryResponse = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 500,
      messages: [{
        role: 'user',
        content: `Based on this kitchen conversation, extract any useful long-term memories about this household's habits, preferences, or patterns. Only extract clear, specific facts — not guesses.

Current memories already stored:
${memoryContext}

Recent conversation:
User: ${message}
Assistant: ${cleanReply}

Return ONLY a JSON array of new memory strings to store, or an empty array if nothing new is worth remembering. Each memory should be a single clear sentence. Do not duplicate existing memories. Examples of good memories: "Buys chicken weekly", "Family dislikes cilantro", "Usually cooks dinner for 4", "Shops at Mercator on Saturdays".

Return format: ["memory 1", "memory 2"] or []`
      }],
    })

    const memoryRaw = memoryResponse.content[0].type === 'text' ? memoryResponse.content[0].text : '[]'
    const memoryClean = memoryRaw.replace(/```json|```/g, '').trim()
    const newMemories: string[] = JSON.parse(memoryClean)

    if (newMemories.length > 0) {
      await supabase.from('household_memory').insert(
        newMemories.map(memory => ({
          household_id: householdId,
          memory,
          category: 'general',
        }))
      )
    }
  } catch (e) {
    // Memory extraction is non-critical, fail silently
    console.error('Memory extraction failed:', e)
  }

  return NextResponse.json({ reply: cleanReply })
}
