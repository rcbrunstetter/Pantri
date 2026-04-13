import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })

  const { data: invite } = await supabase
    .from('household_invites')
    .select('household_id, used_at, expires_at, households(name)')
    .eq('token', token)
    .single()

  if (!invite) return NextResponse.json({ error: 'Invalid invite' }, { status: 404 })
  if (invite.used_at) return NextResponse.json({ error: 'Invite already used' }, { status: 410 })
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Invite expired' }, { status: 410 })

  const household = invite.households as any
  return NextResponse.json({ householdId: invite.household_id, householdName: household?.name || 'a household' })
}

export async function POST(req: NextRequest) {
  const { token, userId } = await req.json()
  if (!token || !userId) return NextResponse.json({ error: 'Missing token or userId' }, { status: 400 })

  const { data: invite } = await supabase
    .from('household_invites')
    .select('household_id, used_at, expires_at')
    .eq('token', token)
    .single()

  if (!invite) return NextResponse.json({ error: 'Invalid invite' }, { status: 404 })
  if (invite.used_at) return NextResponse.json({ error: 'Invite already used' }, { status: 410 })
  if (new Date(invite.expires_at) < new Date()) return NextResponse.json({ error: 'Invite expired' }, { status: 410 })

  // Remove user from their current household
  await supabase.from('household_members').delete().eq('user_id', userId)

  // Add user to new household
  const { error: insertError } = await supabase.from('household_members').insert({
    household_id: invite.household_id,
    user_id: userId,
    role: 'member',
  })

  if (insertError) return NextResponse.json({ error: 'Failed to join household' }, { status: 500 })

  // Mark invite as used
  await supabase.from('household_invites').update({
    used_by: userId,
    used_at: new Date().toISOString(),
  }).eq('token', token)

  return NextResponse.json({ success: true })
}
