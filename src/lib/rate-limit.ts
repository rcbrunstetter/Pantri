import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const LIMITS: Record<string, number> = {
  chat: 30,
  receipt: 15,
  suggestions: 10,
}

export async function checkRateLimit(userId: string, endpoint: string): Promise<{ allowed: boolean; remaining: number }> {
  const limit = LIMITS[endpoint] || 20
  const windowStart = new Date()
  windowStart.setHours(0, 0, 0, 0)

  const { count } = await supabase
    .from('api_usage')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .gte('created_at', windowStart.toISOString())

  const used = count || 0
  const allowed = used < limit

  if (allowed) {
    await supabase.from('api_usage').insert({ user_id: userId, endpoint })
  }

  return { allowed, remaining: Math.max(0, limit - used - 1) }
}
