import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/get-user-from-request'

const ADMIN_USER_ID = 'a88ed39d-c211-404c-a01f-ed7dea38e7d7'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  const userId = await getUserFromRequest(req)
  if (!userId || userId !== ADMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0)
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - 7)
  const monthStart = new Date(now); monthStart.setDate(now.getDate() - 30)

  const [
    { count: totalUsers },
    { count: totalHouseholds },
    { count: totalPantryItems },
    { count: totalReceipts },
    { count: totalChats },
    { data: activeToday },
    { data: activeWeek },
    { data: activeMonth },
    { data: topEvents },
    { data: dailyRaw },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('households').select('*', { count: 'exact', head: true }),
    supabase.from('pantry_items').select('*', { count: 'exact', head: true }),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'receipt_scanned'),
    supabase.from('analytics_events').select('*', { count: 'exact', head: true }).eq('event', 'chat_message'),
    supabase.from('analytics_events').select('user_id').gte('created_at', todayStart.toISOString()),
    supabase.from('analytics_events').select('user_id').gte('created_at', weekStart.toISOString()),
    supabase.from('analytics_events').select('user_id').gte('created_at', monthStart.toISOString()),
    supabase.from('analytics_events').select('event').gte('created_at', monthStart.toISOString()),
    supabase.from('analytics_events').select('user_id, created_at').gte('created_at', new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString()),
  ])

  // Process active users
  const uniqueToday = new Set(activeToday?.map(r => r.user_id)).size
  const uniqueWeek = new Set(activeWeek?.map(r => r.user_id)).size
  const uniqueMonth = new Set(activeMonth?.map(r => r.user_id)).size

  // Process top events
  const eventCounts: Record<string, number> = {}
  topEvents?.forEach(r => {
    eventCounts[r.event] = (eventCounts[r.event] || 0) + 1
  })
  const sortedEvents = Object.entries(eventCounts)
    .map(([event, count]) => ({ event, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  // Process daily active
  const dailyMap: Record<string, Set<string>> = {}
  const dailyEventCount: Record<string, number> = {}
  dailyRaw?.forEach(r => {
    const date = new Date(r.created_at).toLocaleDateString('en', { month: 'short', day: 'numeric' })
    if (!dailyMap[date]) dailyMap[date] = new Set()
    if (r.user_id) dailyMap[date].add(r.user_id)
    dailyEventCount[date] = (dailyEventCount[date] || 0) + 1
  })
  const dailyActive = Object.entries(dailyMap)
    .map(([date, users]) => ({ date, users: users.size, events: dailyEventCount[date] || 0 }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 14)

  return NextResponse.json({
    totalUsers: totalUsers || 0,
    totalHouseholds: totalHouseholds || 0,
    totalPantryItems: totalPantryItems || 0,
    totalReceipts: totalReceipts || 0,
    totalChats: totalChats || 0,
    activeToday: uniqueToday,
    activeThisWeek: uniqueWeek,
    activeThisMonth: uniqueMonth,
    topEvents: sortedEvents,
    dailyActive,
    featureAdoption: [],
    retention: [],
  })
}
