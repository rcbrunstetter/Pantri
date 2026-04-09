import { SupabaseClient } from '@supabase/supabase-js'

export async function getHouseholdId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .single()
  return data?.household_id || null
}
