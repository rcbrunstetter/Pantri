import { SupabaseClient } from '@supabase/supabase-js'

interface PantryItemInput {
  household_id: string
  name: string
  quantity: string | null
  unit: string | null
  category: string | null
}

export async function upsertPantryItem(supabase: SupabaseClient, item: PantryItemInput) {
  const { data: results, error: selectError } = await supabase
    .from('pantry_items')
    .select('*')
    .eq('household_id', item.household_id)
    .ilike('name', item.name)
    .limit(1)

  if (selectError) {
    console.error('Error checking existing pantry item:', selectError)
    return
  }

  const existing = results?.[0]

  if (existing) {
    const existingQty = parseFloat(existing.quantity || '0')
    const newQty = parseFloat(item.quantity || '0')

    if (!isNaN(existingQty) && !isNaN(newQty) && newQty > 0) {
      const combined = (existingQty + newQty).toString()
      const { error: updateError } = await supabase
        .from('pantry_items')
        .update({
          quantity: combined,
          unit: item.unit || existing.unit,
          category: item.category || existing.category,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)

      if (updateError) {
        console.error('Error updating pantry item:', updateError)
      }
    }
  } else {
    const { error: insertError } = await supabase
      .from('pantry_items')
      .insert(item)

    if (insertError) {
      console.error('Error inserting pantry item:', insertError, 'Item:', item)
    }
  }
}
