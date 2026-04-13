import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const { event, userId, householdId, properties } = await req.json()
    if (!event) return NextResponse.json({ ok: false })

    await supabase.from('analytics_events').insert({
      event,
      user_id: userId || null,
      household_id: householdId || null,
      properties: properties || {},
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false })
  }
}
