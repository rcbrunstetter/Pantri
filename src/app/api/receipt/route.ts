import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import convert from 'heic-convert'
import { getHouseholdId } from '@/lib/get-household-id'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const formData = await req.formData()
  const file = formData.get('file') as File
  const userId = formData.get('userId') as string

  if (!file || !userId) {
    return NextResponse.json({ error: 'Missing file or userId' }, { status: 400 })
  }

  const { checkRateLimit } = await import('@/lib/rate-limit')
  const { allowed } = await checkRateLimit(userId, 'receipt')
  if (!allowed) {
    return NextResponse.json({ error: 'Daily receipt scan limit reached. Come back tomorrow!' }, { status: 429 })
  }

  const householdId = await getHouseholdId(supabase, userId)
  if (!householdId) return NextResponse.json({ error: 'No household found', userId }, { status: 400 })

  const { data: groceryItems } = await supabase
    .from('grocery_items')
    .select('name, quantity, unit')
    .eq('household_id', householdId)
    .eq('checked', false)

  const groceryContext = groceryItems && groceryItems.length > 0
    ? `\n\nThe user's current grocery list (use this to help identify ambiguous items on the receipt):\n${groceryItems.map(i => `- ${i.name}${i.quantity ? ` (${i.quantity}${i.unit ? ' ' + i.unit : ''})` : ''}`).join('\n')}`
    : ''

  const { data: translationMemory } = await supabase
    .from('translation_memory')
    .select('original, translated')
    .eq('household_id', householdId)

  const translationContext = translationMemory && translationMemory.length > 0
    ? `\n\nThis household's translation corrections (ALWAYS use these exact translations when you see these items):\n${translationMemory.map(t => `- "${t.original}" → "${t.translated}"`).join('\n')}`
    : ''

  const fileBuffer = await file.arrayBuffer()
  const storageFileName = `${userId}/${Date.now()}.jpg`

  const isHeic = (
    file.type === 'image/heic' ||
    file.type === 'image/heif' ||
    /\.heic$/i.test(file.name) ||
    /\.heif$/i.test(file.name)
  )

  let inputBuffer: Buffer
  if (isHeic) {
    inputBuffer = Buffer.from(await convert({
      buffer: Buffer.from(fileBuffer),
      format: 'JPEG',
      quality: 0.9,
    }))
  } else {
    inputBuffer = Buffer.from(fileBuffer)
  }

  // Convert any image format (including HEIC) to JPEG using sharp
  let convertedBuffer: Buffer
  try {
    convertedBuffer = await sharp(inputBuffer)
      .rotate() // auto-rotate based on EXIF
      .jpeg({ quality: 90 })
      .toBuffer()
    console.log('Image converted to JPEG:', { originalSize: fileBuffer.byteLength, convertedSize: convertedBuffer.byteLength })
  } catch (e) {
    console.error('Image conversion failed:', e)
    return NextResponse.json({ error: 'Could not process image' }, { status: 400 })
  }

  // Upload converted image to Supabase Storage
  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(storageFileName, convertedBuffer, { contentType: 'image/jpeg' })

  if (uploadError) {
    console.error('Upload error:', uploadError)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }

  const base64 = convertedBuffer.toString('base64')

  console.log('Sending image to Claude:', { size: convertedBuffer.byteLength })

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: base64 },
            },
            {
              type: 'text',
              text: `Look at this receipt image carefully.

First, read every line of text you can see on the receipt exactly as written.

Then identify only the food and grocery items purchased.

Explicitly ignore:
- Taxes, subtotals, payment method info
- But DO extract the receipt total amount paid
- Store address, cashier info, receipt numbers
- Shopping bags, carriers, packaging (e.g. "vrečka", "bag", "sack")
- Printer cartridges, ink, office supplies
- Cleaning products, household non-food items
- Any item that is clearly not something you eat or drink

When an item name contains a size measurement, extract it:
- "OMAKA PIKANT 200ML" → name: "Spicy Sauce", quantity: "200", unit: "ml"
- "SIR JAVOR 250" → name: "Maple Cheese", quantity: "250", unit: "g"
- "NORI ALGE 15G" → name: "Nori Seaweed", quantity: "15", unit: "g"
Strip the size from the name and put it in the quantity/unit fields.

For each food item:
- Translate the item name to English regardless of what language the receipt is in
- Use common English grocery names (e.g. "Sir Javor" → "Maple Cheese", "Nori Alge Za Suši" → "Nori Seaweed Snack")
- Clean up abbreviations and make the name clear and readable
- If a line starts with a number like "2 x" or "2x" or has a quantity column showing "2", that means 2 of that item were purchased — capture that as the quantity
- Read the quantity from the Količina/Quantity column if present
- Extract package size from the item name itself if embedded (e.g. "OMAKA PIKANT 200ML" → unit: "ml", quantity: "200"; "SIR JAVOR 250" → unit: "g", quantity: "250")
- Common size indicators: ML/ml = milliliters, G/g = grams, KG/kg = kilograms, L/l = liters, GAL = gallon, CT/KOS = count, LB = pound, OZ = ounce
- If the item name contains a size, strip it from the name and put it in quantity/unit fields
- Estimate a standard package size only if no size information exists anywhere

Return ONLY valid JSON in this exact format with no other text:
{
  "store": "store name",
  "total": 42.50,
  "raw_lines": ["list every line of text you see on the receipt"],
  "items": [
    {"name": "Whole Milk", "quantity": "2", "unit": "gallon", "category": "dairy"}
  ]
}

- Extract the total amount paid from the receipt and put it in the "total" field as a number. If you cannot find a total, set it to null.

${groceryContext}
${translationContext}

Categories: produce, dairy, meat, bakery, frozen, pantry, beverages, snacks, household, other.
If you cannot clearly read the receipt, return {"store": null, "raw_lines": [], "items": []}
Do not guess or invent items that are not visible on the receipt.`,
            },
          ],
        },
      ],
    })

    const rawText = response.content[0].type === 'text' ? response.content[0].text : ''
    console.log('Claude receipt response:', rawText)

    const clean = rawText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    console.log('Parsed items:', parsed.items)

    if (parsed.items && parsed.items.length > 0) {
      console.log('Attempting to save', parsed.items.length, 'items to household:', householdId)
      const { upsertPantryItem } = await import('@/lib/pantry-utils')
      for (const item of parsed.items) {
        try {
          await upsertPantryItem(supabase, {
            household_id: householdId,
            name: item.name,
            quantity: item.quantity || null,
            unit: item.unit || null,
            category: item.category || null,
          })
          console.log('Saved item:', item.name)
        } catch (e) {
          console.error('Failed to save item:', item.name, e)
        }
      }

      await supabase.from('receipts').insert({
        user_id: userId,
        image_url: storageFileName,
        parsed_data: parsed,
      })

      const totalAmount = parsed.total || null
      if (totalAmount && totalAmount > 0) {
        await supabase.from('spending_records').insert({
          household_id: householdId,
          amount: totalAmount,
          store: parsed.store || null,
          source: 'receipt',
        })
      }
    }

    return NextResponse.json({
      success: true,
      items: parsed.items,
      store: parsed.store || null,
      debug: parsed.raw_lines,
    })

  } catch (e) {
    console.error('Receipt parsing error:', e)
    return NextResponse.json({ error: 'Failed to parse receipt' }, { status: 500 })
  }
}
