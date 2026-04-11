import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        storageKey: 'pantri-auth',
        storage: {
          getItem: (key: string) => {
            if (typeof window === 'undefined') return null
            // Try localStorage first, fall back to cookie
            const local = window.localStorage.getItem(key)
            if (local) return local
            const match = document.cookie.match(new RegExp('(^| )' + key + '=([^;]+)'))
            return match ? decodeURIComponent(match[2]) : null
          },
          setItem: (key: string, value: string) => {
            if (typeof window === 'undefined') return
            window.localStorage.setItem(key, value)
            // Also store in cookie with 30 day expiry for PWA persistence
            const expires = new Date()
            expires.setDate(expires.getDate() + 30)
            document.cookie = `${key}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`
          },
          removeItem: (key: string) => {
            if (typeof window === 'undefined') return
            window.localStorage.removeItem(key)
            document.cookie = `${key}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
          },
        },
      },
    }
  )
}
