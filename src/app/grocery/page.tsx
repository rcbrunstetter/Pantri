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
  source: string
}

export default function GroceryPage() {
  const [items, setItems] = useState<GroceryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [newItem, setNewItem] = useState('')
  const [newQty, setNewQty] = useState('')
  const [newUnit, setNewUnit] = useState('')
  const [adding, setAdding] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)
      const { data: membership } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .limit(1)
      const hid = membership?.[0]?.household_id
      setHouseholdId(hid)

      const planData = sessionStorage.getItem('groceryFromPlan')
      if (planData) {
        sessionStorage.removeItem('groceryFromPlan')
        const { recipeContext, pantryContext, servings } = JSON.parse(planData)
        await loadItems(hid)
        generateFromPlan(user.id, hid, recipeContext, pantryContext, servings)
      } else {
        await loadItems(hid)
      }
    })
  }, [])

  async function loadItems(hid: string) {
    setLoading(true)
    const { data } = await supabase
      .from('grocery_items')
      .select('*')
      .eq('household_id', hid)
      .order('created_at', { ascending: true })
    setItems(data || [])
    setLoading(false)
  }

  async function generateSuggestedList() {
    if (!householdId || !user) return
    setGenerating(true)

    const [{ data: pantryItems }, { data: profileRows }] = await Promise.all([
      supabase.from('pantry_items').select('*').eq('household_id', householdId),
      supabase.from('profiles').select('unit_system').eq('id', user.id).limit(1),
    ])

    const unitSystem = profileRows?.[0]?.unit_system || 'metric'
    const pantryContext = pantryItems && pantryItems.length > 0
      ? `Current pantry:\n${pantryItems.map((item: any) =>
          `- ${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ' ' + item.unit : ''})` : ''}`
        ).join('\n')}`
      : 'Pantry is empty.'

    const response = await fetch('/api/grocery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.id, pantryContext, unitSystem }),
    })

    const data = await response.json()
    if (data.items && data.items.length > 0) {
      const { data: inserted } = await supabase
        .from('grocery_items')
        .insert(data.items.map((item: any) => ({
          household_id: householdId,
          name: item.name,
          quantity: item.quantity || null,
          unit: item.unit || null,
          category: item.category || 'other',
          source: 'suggested',
        })))
        .select()
      if (inserted) setItems(prev => [...prev, ...inserted])
    }
    setGenerating(false)
  }

  async function generateFromPlan(userId: string, hid: string, recipeContext: string, pantryContext: string, servings: number) {
    setGenerating(true)
    const { data: profileRows } = await supabase.from('profiles').select('unit_system').eq('id', userId).limit(1)
    const unitSystem = profileRows?.[0]?.unit_system || 'metric'

    const response = await fetch('/api/grocery', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, pantryContext, unitSystem, recipeContext, mode: 'plan' }),
    })

    const data = await response.json()
    if (data.items && data.items.length > 0) {
      const { data: inserted } = await supabase
        .from('grocery_items')
        .insert(data.items.map((item: any) => ({
          household_id: hid,
          name: item.name,
          quantity: item.quantity || null,
          unit: item.unit || null,
          category: item.category || 'other',
          source: 'planner',
        })))
        .select()
      if (inserted) setItems(prev => [...prev, ...inserted])
    }
    setGenerating(false)
  }

  async function toggleItem(id: string, checked: boolean) {
    await supabase.from('grocery_items').update({ checked: !checked }).eq('id', id)
    setItems(prev => prev.map(item => item.id === id ? { ...item, checked: !checked } : item))
  }

  async function removeItem(id: string) {
    await supabase.from('grocery_items').delete().eq('id', id)
    setItems(prev => prev.filter(item => item.id !== id))
  }

  async function handleAddItem() {
    if (!newItem.trim() || !householdId) return
    const { data: rows } = await supabase
      .from('grocery_items')
      .insert({
        household_id: householdId,
        name: newItem.trim(),
        quantity: newQty.trim() || null,
        unit: newUnit.trim() || null,
        category: 'other',
        source: 'manual',
      })
      .select()
      .limit(1)
    const data = rows?.[0]
    if (data) setItems(prev => [...prev, data])
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
    await supabase.from('grocery_items').delete().in('id', checkedItems.map(i => i.id))
    setItems(prev => prev.filter(i => !i.checked))
    setCompleting(false)
    router.push('/')
  }

  const checkedCount = items.filter(i => i.checked).length

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
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', backgroundColor: '#fafaf8' }}>
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
        <button onClick={() => router.push('/')} style={{
          padding: '8px 14px', fontSize: '14px', fontWeight: '600',
          color: '#2d6a4f', backgroundColor: '#f0f7f4', border: 'none', borderRadius: '12px', cursor: 'pointer',
        }}>← Back</button>
        <div style={{ textAlign: 'center' }}>
          <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>Grocery List</h1>
          {!loading && items.length > 0 && (
            <p style={{ fontSize: '13px', color: '#999', margin: '2px 0 0 0' }}>{checkedCount} of {items.length} checked</p>
          )}
        </div>
        <div style={{ width: '60px' }} />
      </div>

      <div style={{ flex: 1, padding: '20px', paddingBottom: '120px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#999', marginTop: '60px' }}>Loading...</p>
        ) : (
          <>
            {/* Add item */}
            <div style={{ backgroundColor: '#fff', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '16px' }}>
              {adding ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <input autoFocus placeholder="Item name" value={newItem} onChange={e => setNewItem(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddItem()}
                    style={{ padding: '10px 14px', fontSize: '15px', border: '1px solid #e0e0e0', borderRadius: '10px', outline: 'none', fontFamily: 'inherit' }} />
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input placeholder="Qty" value={newQty} onChange={e => setNewQty(e.target.value)}
                      style={{ padding: '10px 14px', fontSize: '15px', border: '1px solid #e0e0e0', borderRadius: '10px', outline: 'none', fontFamily: 'inherit', width: '80px' }} />
                    <input placeholder="Unit (g, ml, pieces...)" value={newUnit} onChange={e => setNewUnit(e.target.value)}
                      style={{ padding: '10px 14px', fontSize: '15px', border: '1px solid #e0e0e0', borderRadius: '10px', outline: 'none', fontFamily: 'inherit', flex: 1 }} />
                  </div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button onClick={handleAddItem} style={{ flex: 1, padding: '10px', fontSize: '15px', fontWeight: '600', color: '#fff', backgroundColor: '#2d6a4f', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>Add</button>
                    <button onClick={() => { setAdding(false); setNewItem(''); setNewQty(''); setNewUnit('') }}
                      style={{ padding: '10px 16px', fontSize: '15px', fontWeight: '600', color: '#666', backgroundColor: '#f5f5f5', border: 'none', borderRadius: '10px', cursor: 'pointer' }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setAdding(true)} style={{
                  width: '100%', padding: '12px', fontSize: '15px', fontWeight: '600',
                  color: '#2d6a4f', backgroundColor: 'transparent', border: '2px dashed #c8e6d8', borderRadius: '10px', cursor: 'pointer',
                }}>+ Add item</button>
              )}
            </div>

            {/* Suggest a list button */}
            <button
              onClick={generateSuggestedList}
              disabled={generating}
              style={{
                width: '100%', padding: '14px', fontSize: '15px', fontWeight: '600',
                color: '#2d6a4f', backgroundColor: '#f0f7f4', border: '1.5px solid #d4eddf',
                borderRadius: '14px', cursor: 'pointer', marginBottom: '24px',
                opacity: generating ? 0.7 : 1,
              }}
            >
              {generating ? 'Generating suggestions...' : 'Suggest items to buy'}
            </button>

            {/* Items */}
            {items.length === 0 ? (
              <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <p style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a1a', marginBottom: '8px' }}>Your list is empty</p>
                <p style={{ fontSize: '15px', color: '#666' }}>Add items manually, ask Pantri in chat, or tap Suggest items to buy.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                {Object.entries(grouped).map(([category, categoryItems]) => (
                  <div key={category}>
                    <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 10px 4px' }}>{category}</h2>
                    <div style={{ backgroundColor: '#fff', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                      {categoryItems.map((item, index) => (
                        <div key={item.id} style={{
                          display: 'flex', alignItems: 'center', gap: '14px', padding: '16px',
                          borderBottom: index < categoryItems.length - 1 ? '1px solid #f5f5f5' : 'none',
                          backgroundColor: item.checked ? '#f9fdf9' : '#fff',
                        }}>
                          <div onClick={() => toggleItem(item.id, item.checked)} style={{
                            width: '26px', height: '26px', borderRadius: '50%',
                            border: item.checked ? 'none' : '2px solid #d0d0d0',
                            backgroundColor: item.checked ? '#2d6a4f' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0, cursor: 'pointer',
                          }}>
                            {item.checked && <span style={{ color: '#fff', fontSize: '14px', fontWeight: '700' }}>✓</span>}
                          </div>
                          <div onClick={() => toggleItem(item.id, item.checked)} style={{ flex: 1, cursor: 'pointer' }}>
                            <p style={{ fontSize: '16px', fontWeight: '500', color: item.checked ? '#999' : '#1a1a1a', margin: 0, textDecoration: item.checked ? 'line-through' : 'none' }}>{item.name}</p>
                            {(item.quantity || item.unit) && (
                              <p style={{ fontSize: '13px', color: '#bbb', margin: '2px 0 0 0' }}>{[item.quantity, item.unit].filter(Boolean).join(' ')}</p>
                            )}
                          </div>
                          <button onClick={() => removeItem(item.id)} style={{
                            padding: '6px 10px', fontSize: '13px', color: '#cc4444',
                            backgroundColor: '#fff5f5', border: 'none', borderRadius: '8px', cursor: 'pointer', flexShrink: 0,
                          }}>Remove</button>
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

      {checkedCount > 0 && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px 20px', backgroundColor: '#fff', borderTop: '1px solid #f0f0f0' }}>
          <button onClick={handleDoneShopping} disabled={completing} style={{
            width: '100%', padding: '16px', fontSize: '16px', fontWeight: '700',
            color: '#fff', backgroundColor: '#2d6a4f', border: 'none', borderRadius: '14px', cursor: 'pointer', opacity: completing ? 0.7 : 1,
          }}>
            {completing ? 'Updating pantry...' : `Done Shopping — ${checkedCount} item${checkedCount > 1 ? 's' : ''} checked off`}
          </button>
        </div>
      )}
    </div>
  )
}
