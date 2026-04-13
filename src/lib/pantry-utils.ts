import { SupabaseClient } from '@supabase/supabase-js'

interface PantryItemInput {
  household_id: string
  name: string
  quantity: string | null
  unit: string | null
  category: string | null
}

export async function upsertPantryItem(supabase: SupabaseClient, item: PantryItemInput) {
  // Check if item already exists (case-insensitive)
  const { data: results } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('household_id', item.household_id)
    .ilike('name', item.name)
    .limit(1)

  const existing = results?.[0]

  if (existing) {
    // Item exists — add quantities if both are numeric
    const existingQty = parseFloat(existing.quantity || '0')
    const newQty = parseFloat(item.quantity || '0')

    if (!isNaN(existingQty) && !isNaN(newQty) && newQty > 0) {
      const combined = (existingQty + newQty).toString()
      await supabase
        .from('pantry_items')
        .update({
          quantity: combined,
          unit: item.unit || existing.unit,
          category: item.category || existing.category,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
    }
  } else {
    // Item doesn't exist — insert it
    await supabase.from('pantry_items').insert(item)
  }
}
