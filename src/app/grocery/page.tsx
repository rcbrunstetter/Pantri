'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface GroceryItem {
  id: string
  name: string
  quantity: string
  unit: string
  category: string
  checked: boolean
}

export default function GroceryPage() {
  const [items, setItems] = useState<GroceryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [newItem, setNewItem] = useState('')
  const [newQty, setNewQty] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [adding, setAdding] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)
        // Check if coming from meal planner
        const planData = sessionStorage.getItem('groceryFromPlan')
        if (planData) {
          sessionStorage.removeItem('groceryFromPlan')
          const { recipeContext, pantryContext, servings } = JSON.parse(planData)
          generateFromPlan(user.id, recipeContext, pantryContext, servings)
        } else {
          generateList(user.id)
        }
      }
    })
  }, [])

  async function generateList(userId: string) {
    setLoading(true)

    const [{ data: pantryItems }, { data: profile }] = await Promise.all([
      supabase.from('pantry_items').select('*').eq('user_id', userId),
      supabase.from('profiles').select('unit_system').eq('id', userId).single(),
    ])

    const unitSystem = profile?.unit_system || 'metric'
    const pantryContext = pantryItems && pantryItems.length > 0
      ? `Current pantry:\n${pantryItems.map(item =>
          `- ${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ' ' + item.unit : ''})` : ''}`
        ).join('\n')}`
      : 'Pantry is empty.'

    const response = await fetch('/api/grocery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pantryContext, unitSystem }),
    })

    const data = await response.json()
    if (data.items) {
      setItems(data.items.map((item: any, index: number) => ({
        ...item,
        id: index.toString(),
        checked: false,
      })))
    }
    setLoading(false)
  }

  async function generateFromPlan(userId: string, recipeContext: string, pantryContext: string, servings: number) {
    setLoading(true)

    const { data: profile } = await supabase
      .from('profiles')
      .select('unit_system')
      .eq('id', userId)
      .single()

    const unitSystem = profile?.unit_system || 'metric'

    const response = await fetch('/api/grocery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        pantryContext,
        unitSystem,
        recipeContext,
        mode: 'plan',
      }),
    })

    const data = await response.json()
    if (data.items) {
      setItems(data.items.map((item: any, index: number) => ({
        ...item,
        id: index.toString(),
        checked: false,
      })))
    }
    setLoading(false)
  }

  function toggleItem(id: string) {
    setItems(prev => prev.map(item =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ))
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(item => item.id !== id))
  }

  function handleAddItem() {
    if (!newItem.trim()) return
    const item: GroceryItem = {
      id: Date.now().toString(),
      name: newItem.trim(),
      quantity: newQty.trim(),
      unit: newUnit.trim(),
      category: 'other',
      checked: false,
    }
    setItems(prev => [...prev, item])
    setNewItem('')
    setNewQty('')
    setNewUnit('')
    setAdding(false)
  }

  async function handleDoneShopping() {
    if (!user) return
    const checkedItems = items.filter(i => i.checked)
    if (checkedItems.length === 0) return

    setCompleting(true)

    await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `I just bought these items, please add them to my pantry: ${checkedItems.map(i =>
          `${i.quantity ? i.quantity + ' ' : ''}${i.unit ? i.unit + ' ' : ''}${i.name}`).join(', ')}`,
        userId: user.id,
        history: [],
      }),
    })

    setCompleting(false)
    router.push('/')
  }

  const checkedCount = items.filter(i => i.checked).length

  // Sort: unchecked first, then checked
  const sortedItems = [...items].sort((a, b) => {
    if (a.checked === b.checked) return 0
    return a.checked ? 1 : -1
  })

  const grouped = sortedItems.reduce((acc, item) => {
    const cat = item.category || 'other'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {} as Record<string, GroceryItem[]>)

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
            borderRadius: '12px',
            cursor: 'pointer',
          }}
        >
          ← Back
        </button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{
            fontSize: '20px',
            fontWeight: '700',
            color: '#1a1a1a',
            margin: 0,
          }}>Grocery List</h1>
          {!loading && (
            <p style={{ fontSize: '13px', color: '#999', margin: '2px 0 0 0' }}>
              {checkedCount} of {items.length} checked
            </p>
          )}
        </div>
        <button
          onClick={() => generateList(user?.id)}
          disabled={loading}
          style={{
            padding: '8px 14px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#666',
            backgroundColor: 'transparent',
            border: '1px solid #e0e0e0',
            borderRadius: '12px',
            cursor: 'pointer',
            opacity: loading ? 0.5 : 1,
          }}
        >
          Refresh
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, padding: '20px', paddingBottom: '120px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <p style={{ fontSize: '32px', marginBottom: '12px' }}>🛒</p>
            <p style={{ fontSize: '16px', color: '#666' }}>Building your grocery list...</p>
          </div>
        ) : (
          <>
            {/* Add item */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '16px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              marginBottom: '24px',
            }}>
              {adding ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input
                    autoFocus
                    placeholder="Item name"
                    value={newItem}
                    onChange={e => setNewItem(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                    style={{
                      padding: '10px 14px',
                      fontSize: '15px',
                      border: '1px solid #e0e0e0',
                      borderRadius: '10px',
                      outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input
                      placeholder="Qty"
                      value={newQty}
                      onChange={e => setNewQty(e.target.value)}
                      style={{
                        padding: '10px 14px',
                        fontSize: '15px',
                        border: '1px solid #e0e0e0',
                        borderRadius: '10px',
                        outline: 'none',
                        fontFamily: 'inherit',
                        width: '80px',
                      }}
                    />
                    <input
                      placeholder="Unit (g, ml, pieces...)"
                      value={newUnit}
                      onChange={e => setNewUnit(e.target.value)}
                      style={{
                        padding: '10px 14px',
                        fontSize: '15px',
                        border: '1px solid #e0e0e0',
                        borderRadius: '10px',
                        outline: 'none',
                        fontFamily: 'inherit',
                        flex: 1,
                      }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={handleAddItem}
                      style={{
                        flex: 1,
                        padding: '10px',
                        fontSize: '15px',
                        fontWeight: '600',
                        color: '#fff',
                        backgroundColor: '#2d6a4f',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      Add
                    </button>
                    <button
                      onClick={() => { setAdding(false); setNewItem(''); setNewQty(''); setNewUnit('') }}
                      style={{
                        padding: '10px 16px',
                        fontSize: '15px',
                        fontWeight: '600',
                        color: '#666',
                        backgroundColor: '#f5f5f5',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(true)}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#2d6a4f',
                    backgroundColor: 'transparent',
                    border: '2px dashed #c8e6d8',
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  + Add item
                </button>
              )}
            </div>

            {/* Items grouped by category */}
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: '40px' }}>
                <p style={{ fontSize: '32px', marginBottom: '12px' }}>✅</p>
                <p style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a1a', marginBottom: '8px' }}>
                  You're all stocked up!
                </p>
                <p style={{ fontSize: '15px', color: '#666' }}>
                  Add items manually above or refresh for new suggestions.
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
                            gap: '14px',
                            padding: '16px',
                            borderBottom: index < categoryItems.length - 1 ? '1px solid #f5f5f5' : 'none',
                            backgroundColor: item.checked ? '#f9fdf9' : '#fff',
                          }}
                        >
                          {/* Checkbox */}
                          <div
                            onClick={() => toggleItem(item.id)}
                            style={{
                              width: '26px',
                              height: '26px',
                              borderRadius: '50%',
                              border: item.checked ? 'none' : '2px solid #d0d0d0',
                              backgroundColor: item.checked ? '#2d6a4f' : 'transparent',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              cursor: 'pointer',
                              transition: 'all 0.15s',
                            }}
                          >
                            {item.checked && (
                              <span style={{ color: '#fff', fontSize: '14px', fontWeight: '700' }}>✓</span>
                            )}
                          </div>

                          {/* Item info */}
                          <div
                            onClick={() => toggleItem(item.id)}
                            style={{ flex: 1, cursor: 'pointer' }}
                          >
                            <p style={{
                              fontSize: '16px',
                              fontWeight: '500',
                              color: item.checked ? '#999' : '#1a1a1a',
                              margin: 0,
                              textDecoration: item.checked ? 'line-through' : 'none',
                              transition: 'all 0.15s',
                            }}>
                              {item.name}
                            </p>
                            {(item.quantity || item.unit) && (
                              <p style={{
                                fontSize: '13px',
                                color: '#bbb',
                                margin: '2px 0 0 0',
                              }}>
                                {[item.quantity, item.unit].filter(Boolean).join(' ')}
                              </p>
                            )}
                          </div>

                          {/* Remove button */}
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
                              flexShrink: 0,
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
          </>
        )}
      </div>

      {/* Done Shopping Button */}
      {checkedCount > 0 && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '16px 20px',
          backgroundColor: '#fff',
          borderTop: '1px solid #f0f0f0',
        }}>
          <button
            onClick={handleDoneShopping}
            disabled={completing}
            style={{
              width: '100%',
              padding: '16px',
              fontSize: '16px',
              fontWeight: '700',
              color: '#fff',
              backgroundColor: '#2d6a4f',
              border: 'none',
              borderRadius: '14px',
              cursor: 'pointer',
              opacity: completing ? 0.7 : 1,
            }}
          >
            {completing ? 'Updating pantry...' : `✓ Done Shopping (${checkedCount} item${checkedCount > 1 ? 's' : ''})`}
          </button>
        </div>
      )}
    </div>
  )
}
