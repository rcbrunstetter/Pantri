import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/get-user-from-request'

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserFromRequest(req)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing env vars:', { hasUrl: !!supabaseUrl, hasKey: !!serviceRoleKey })
      return NextResponse.json({ error: 'Missing environment variables' }, { status: 500 })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    const { data: membership, error: memberError } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .single()

    if (memberError && memberError.code !== 'PGRST116') {
      console.error('Error checking membership:', memberError)
      return NextResponse.json({ error: 'DB error checking membership', detail: memberError.message }, { status: 500 })
    }

    if (membership) {
      return NextResponse.json({ householdId: membership.household_id })
    }

    const { data: household, error: householdError } = await supabase
      .from('households')
      .insert({ name: 'My Household' })
      .select()
      .single()

    if (householdError || !household) {
      console.error('Error creating household:', householdError)
      return NextResponse.json({ error: 'Failed to create household', detail: householdError?.message }, { status: 500 })
    }

    const { error: memberInsertError } = await supabase
      .from('household_members')
      .insert({
        household_id: household.id,
        user_id: userId,
        role: 'owner',
      })

    if (memberInsertError) {
      console.error('Error inserting member:', memberInsertError)
      return NextResponse.json({ error: 'Failed to add member', detail: memberInsertError.message }, { status: 500 })
    }

    return NextResponse.json({ householdId: household.id })

  } catch (e: any) {
    console.error('ensure-household crash:', e)
    return NextResponse.json({ error: 'Unexpected error', detail: e.message }, { status: 500 })
  }
}
