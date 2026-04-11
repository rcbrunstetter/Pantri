import { SupabaseClient } from '@supabase/supabase-js'

export async function getHouseholdId(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })
    .limit(1)
  return data?.[0]?.household_id || null
}
