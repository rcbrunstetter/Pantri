import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  const { userId } = await req.json()

  if (!userId) {
    return NextResponse.json({ error: 'Missing userId' }, { status: 400 })
  }

  const { data: membership } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .single()

  if (membership) {
    return NextResponse.json({ householdId: membership.household_id })
  }

  const { data: household } = await supabase
    .from('households')
    .insert({ name: 'My Household' })
    .select()
    .single()

  if (!household) {
    return NextResponse.json({ error: 'Failed to create household' }, { status: 500 })
  }

  await supabase.from('household_members').insert({
    household_id: household.id,
    user_id: userId,
    role: 'owner',
  })

  return NextResponse.json({ householdId: household.id })
}
