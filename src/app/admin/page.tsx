'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const ADMIN_USER_ID = 'a88ed39d-c211-404c-a01f-ed7dea38e7d7'

interface Stats {
  totalUsers: number
  activeToday: number
  activeThisWeek: number
  activeThisMonth: number
  totalReceipts: number
  totalChats: number
  totalPantryItems: number
  totalHouseholds: number
  featureAdoption: { feature: string; users: number }[]
  dailyActive: { date: string; users: number; events: number }[]
  topEvents: { event: string; count: number }[]
  retention: { day: string; returned: number; total: number }[]
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [unauthorized, setUnauthorized] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session || session.user.id !== ADMIN_USER_ID) {
        setUnauthorized(true)
        setLoading(false)
        return
      }
      loadStats()
    })
  }, [])

  async function loadStats() {
    const { data: { session } } = await supabase.auth.getSession()
    const token = session?.access_token

    const response = await fetch('/api/admin/stats', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    const data = await response.json()
    setStats(data)
    setLoading(false)
  }

  if (unauthorized) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafaf8' }}>
        <p style={{ fontSize: '16px', color: '#999' }}>Access denied.</p>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#fafaf8', padding: '24px 20px' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#2d6a4f', fontFamily: 'Georgia, serif', margin: 0 }}>Pantri Admin</h1>
          <button onClick={() => router.push('/')} style={{ padding: '8px 14px', fontSize: '14px', fontWeight: '600', color: '#2d6a4f', backgroundColor: '#f0f7f4', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>← App</button>
        </div>

        {loading ? (
          <p style={{ color: '#999', textAlign: 'center', marginTop: '60px' }}>Loading stats...</p>
        ) : stats ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

            {/* Key metrics */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
              {[
                { label: 'Total Users', value: stats.totalUsers },
                { label: 'Active Today', value: stats.activeToday },
                { label: 'Active This Week', value: stats.activeThisWeek },
                { label: 'Active This Month', value: stats.activeThisMonth },
                { label: 'Total Households', value: stats.totalHouseholds },
                { label: 'Pantry Items', value: stats.totalPantryItems },
                { label: 'Receipts Scanned', value: stats.totalReceipts },
                { label: 'Chat Messages', value: stats.totalChats },
              ].map(metric => (
                <div key={metric.label} style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 6px 0' }}>{metric.label}</p>
                  <p style={{ fontSize: '32px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>{metric.value}</p>
                </div>
              ))}
            </div>

            {/* Daily active users */}
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 16px 0' }}>Daily Activity (Last 14 Days)</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {stats.dailyActive.map(day => (
                  <div key={day.date} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ fontSize: '13px', color: '#999', width: '80px', flexShrink: 0 }}>{day.date}</span>
                    <div style={{ flex: 1, backgroundColor: '#f0f0f0', borderRadius: '4px', height: '8px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        backgroundColor: '#2d6a4f',
                        borderRadius: '4px',
                        width: `${Math.min((day.users / (stats.totalUsers || 1)) * 100 * 3, 100)}%`,
                      }} />
                    </div>
                    <span style={{ fontSize: '13px', color: '#1a1a1a', fontWeight: '600', width: '40px', textAlign: 'right' }}>{day.users}</span>
                    <span style={{ fontSize: '12px', color: '#999', width: '60px', textAlign: 'right' }}>{day.events} events</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top events */}
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 16px 0' }}>Feature Usage</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {stats.topEvents.map(e => (
                  <div key={e.event} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                    <span style={{ fontSize: '14px', color: '#1a1a1a' }}>{e.event.replace(/_/g, ' ')}</span>
                    <span style={{ fontSize: '14px', fontWeight: '700', color: '#2d6a4f' }}>{e.count}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        ) : (
          <p style={{ color: '#999', textAlign: 'center' }}>No data yet.</p>
        )}
      </div>
    </div>
  )
}
