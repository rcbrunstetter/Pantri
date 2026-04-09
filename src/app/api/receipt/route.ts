import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

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

  const fileBuffer = await file.arrayBuffer()
  const fileName = `${userId}/${Date.now()}.jpg`

  // Convert any image format (including HEIC) to JPEG using sharp
  let convertedBuffer: Buffer
  try {
    convertedBuffer = await sharp(Buffer.from(fileBuffer))
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
    .upload(fileName, convertedBuffer, { contentType: 'image/jpeg' })

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
- Taxes, totals, subtotals, payment info
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
  "raw_lines": ["list every line of text you see on the receipt"],
  "items": [
    {"name": "Whole Milk", "quantity": "2", "unit": "gallon", "category": "dairy"}
  ]
}

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
      const { upsertPantryItem } = await import('@/lib/pantry-utils')
      for (const item of parsed.items) {
        await upsertPantryItem(supabase, {
          user_id: userId,
          name: item.name,
          quantity: item.quantity || null,
          unit: item.unit || null,
          category: item.category || null,
        })
      }

      await supabase.from('receipts').insert({
        user_id: userId,
        image_url: fileName,
        parsed_data: parsed,
      })
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
