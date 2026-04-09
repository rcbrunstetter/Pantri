import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

export async function POST(req: NextRequest) {
  const { pantryContext, unitSystem, recipeContext, mode } = await req.json()

  const isMetric = unitSystem === 'metric'
  const unitGuide = isMetric
    ? 'Use metric units: grams (g), kilograms (kg), milliliters (ml), liters (L).'
    : 'Use imperial units: ounces (oz), pounds (lbs), cups, gallons.'

  let prompt = ''

  if (mode === 'plan' && recipeContext) {
    prompt = `You are a smart grocery assistant. The user has planned meals for the week. Generate a grocery list of exactly what they need to buy, accounting for what they already have.

${pantryContext}

This week's meal plan requires these ingredients (already scaled to servings):
${recipeContext}

Rules:
- Only include items the user needs to BUY — subtract what they already have in their pantry
- If they have enough of an ingredient, don't include it
- If they have some but not enough, include only the difference needed
- Combine duplicate ingredients across recipes
- ${unitGuide}
- Be precise with quantities

Return ONLY valid JSON in this exact format, no other text:
{
  "items": [
    {"name": "Chicken Breast", "quantity": "500", "unit": "g", "category": "meat"}
  ]
}

Categories: produce, dairy, meat, bakery, frozen, pantry, beverages, snacks, household, other.`
  } else {
    prompt = `You are a smart grocery assistant. Based on the user's current pantry, generate a practical grocery list of things they should buy.

${pantryContext}

Rules:
- Suggest items that are missing or likely running low
- Focus on staples needed for balanced everyday cooking
- Suggest realistic quantities for a family
- ${unitGuide}
- Do not suggest items the user already has plenty of

Return ONLY valid JSON in this exact format, no other text:
{
  "items": [
    {"name": "Chicken Breast", "quantity": "500", "unit": "g", "category": "meat"}
  ]
}

Categories: produce, dairy, meat, bakery, frozen, pantry, beverages, snacks, household, other.`
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = response.content[0].type === 'text' ? response.content[0].text : ''

  try {
    const clean = rawText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return NextResponse.json({ items: parsed.items })
  } catch (e) {
    console.error('Grocery list parse error:', e)
    return NextResponse.json({ items: [] })
  }
}
