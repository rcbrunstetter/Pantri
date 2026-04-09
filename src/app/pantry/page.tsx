'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface PantryItem {
  id: string
  name: string
  quantity: string | null
  unit: string | null
  category: string | null
  updated_at: string
}

export default function PantryPage() {
  const [items, setItems] = useState<PantryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)
        loadPantry(user.id)
      }
    })
  }, [])

  async function loadPantry(userId: string) {
    const { data } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('user_id', userId)
      .order('category', { ascending: true })

    setItems(data || [])
    setLoading(false)
  }

  async function removeItem(id: string) {
    await supabase.from('pantry_items').delete().eq('id', id)
    setItems(prev => prev.filter(item => item.id !== id))
  }

  // Group items by category
  const grouped = items.reduce((acc, item) => {
    const category = item.category || 'Other'
    if (!acc[category]) acc[category] = []
    acc[category].push(item)
    return acc
  }, {} as Record<string, PantryItem[]>)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      minHeight: '100vh',
      backgroundColor: '#fafaf8',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <button
          onClick={() => router.push('/')}
          style={{
            padding: '8px 14px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#2d6a4f',
            backgroundColor: '#f0f7f4',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          ← Chat
        </button>
        <h1 style={{
          fontSize: '20px',
          fontWeight: '700',
          color: '#1a1a1a',
          margin: 0,
        }}>My Pantry</h1>
        <div style={{ width: '80px' }} />
      </div>

      {/* Content */}
      <div style={{ padding: '20px', flex: 1 }}>
        {loading ? (
          <p style={{ color: '#999', textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <p style={{ fontSize: '48px', marginBottom: '16px' }}>🛒</p>
            <p style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a1a', marginBottom: '8px' }}>
              Your pantry is empty
            </p>
            <p style={{ fontSize: '15px', color: '#666' }}>
              Go to chat and tell Pantri what you have!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {Object.entries(grouped).map(([category, categoryItems]) => (
              <div key={category}>
                <h2 style={{
                  fontSize: '13px',
                  fontWeight: '700',
                  color: '#999',
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  marginBottom: '10px',
                  margin: '0 0 10px 4px',
                }}>
                  {category}
                </h2>
                <div style={{
                  backgroundColor: '#fff',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  {categoryItems.map((item, index) => (
                    <div
                      key={item.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
                        borderBottom: index < categoryItems.length - 1 ? '1px solid #f5f5f5' : 'none',
                      }}
                    >
                      <div>
                        <p style={{
                          fontSize: '16px',
                          fontWeight: '500',
                          color: '#1a1a1a',
                          margin: 0,
                        }}>
                          {item.name}
                        </p>
                        {(item.quantity || item.unit) && (
                          <p style={{
                            fontSize: '13px',
                            color: '#999',
                            margin: '2px 0 0 0',
                          }}>
                            {[item.quantity, item.unit].filter(Boolean).join(' ')}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeItem(item.id)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '13px',
                          color: '#cc4444',
                          backgroundColor: '#fff5f5',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
