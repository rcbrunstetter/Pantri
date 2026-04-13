'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface SpendingRecord {
  id: string
  amount: number
  store: string | null
  notes: string | null
  source: string
  spent_at: string
}

export default function FinancesPage() {
  const [records, setRecords] = useState<SpendingRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [user, setUser] = useState<any>(null)
  const [adding, setAdding] = useState(false)
  const [amount, setAmount] = useState('')
  const [store, setStore] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [weeklyBudgetGoal, setWeeklyBudgetGoal] = useState(0)
  const [monthlyBudgetGoal, setMonthlyBudgetGoal] = useState(0)
  const [editingBudget, setEditingBudget] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')
  const [budgetType, setBudgetType] = useState<'weekly' | 'monthly'>('weekly')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        setUser(session.user)
        loadData(session.user.id)
      }
    })
  }, [])

  async function loadData(userId: string) {
    const { data: membershipRows } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .limit(1)

    const membership = membershipRows?.[0]

    if (!membership) {
      setLoading(false)
      return
    }

    setHouseholdId(membership.household_id)

    const { data: profileRows } = await supabase
      .from('household_profiles')
      .select('weekly_budget')
      .eq('household_id', membership.household_id)
      .limit(1)

    const profile = profileRows?.[0]

    if (profile?.weekly_budget) {
      setWeeklyBudgetGoal(profile.weekly_budget)
      setMonthlyBudgetGoal(profile.weekly_budget * 4)
    }

    const { data } = await supabase
      .from('spending_records')
      .select('*')
      .eq('household_id', membership.household_id)
      .order('spent_at', { ascending: false })
      .limit(100)

    setRecords(data || [])
    setLoading(false)
  }

  async function handleAddRecord() {
    if (!amount || !householdId) return
    setSaving(true)

    const { data: insertedRows } = await supabase
      .from('spending_records')
      .insert({
        household_id: householdId,
        amount: parseFloat(amount),
        store: store.trim() || null,
        notes: notes.trim() || null,
        source: 'manual',
        spent_at: new Date().toISOString(),
      })
      .select()
      .limit(1)

    const data = insertedRows?.[0]
    if (data) {
      setRecords(prev => [data, ...prev])
    }

    setAmount('')
    setStore('')
    setNotes('')
    setAdding(false)
    setSaving(false)
  }

  async function handleDelete(id: string) {
    await supabase.from('spending_records').delete().eq('id', id)
    setRecords(prev => prev.filter(r => r.id !== id))
  }

  async function saveBudget() {
    if (!householdId) return
    const value = parseFloat(budgetInput)
    if (isNaN(value)) return

    const weeklyValue = budgetType === 'weekly' ? value : value / 4
    const monthlyValue = budgetType === 'monthly' ? value : value * 4

    await supabase.from('household_profiles').upsert({
      household_id: householdId,
      weekly_budget: weeklyValue,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'household_id' })

    setWeeklyBudgetGoal(weeklyValue)
    setMonthlyBudgetGoal(monthlyValue)
    setEditingBudget(false)
    setBudgetInput('')
  }

  const now = new Date()
  const startOfWeek = new Date(now)
  startOfWeek.setDate(now.getDate() - now.getDay())
  startOfWeek.setHours(0, 0, 0, 0)

  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)

  const weeklyTotal = records
    .filter(r => new Date(r.spent_at) >= startOfWeek)
    .reduce((sum, r) => sum + r.amount, 0)

  const monthlyTotal = records
    .filter(r => new Date(r.spent_at) >= startOfMonth)
    .reduce((sum, r) => sum + r.amount, 0)

  const weeklyPercent = weeklyBudgetGoal > 0 ? Math.min((weeklyTotal / weeklyBudgetGoal) * 100, 100) : 0
  const monthlyPercent = monthlyBudgetGoal > 0 ? Math.min((monthlyTotal / monthlyBudgetGoal) * 100, 100) : 0

  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' })
  }

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
          ← Back
        </button>
        <h1 style={{ fontSize: '20px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>Finances</h1>
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: '8px 14px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#fff',
            backgroundColor: '#2d6a4f',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          + Add
        </button>
      </div>

      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loading ? (
          <p style={{ color: '#999', textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : (
          <>
            {/* Weekly summary */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                <div>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px 0' }}>This Week</p>
                  <p style={{ fontSize: '32px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>${weeklyTotal.toFixed(2)}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: '13px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 4px 0' }}>This Month</p>
                  <p style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>${monthlyTotal.toFixed(2)}</p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {weeklyBudgetGoal > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', color: '#999' }}>Weekly budget</span>
                      <span style={{ fontSize: '13px', color: '#999' }}>${weeklyBudgetGoal.toFixed(0)}</span>
                    </div>
                    <div style={{ backgroundColor: '#f0f0f0', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${weeklyPercent}%`,
                        backgroundColor: weeklyPercent > 90 ? '#cc4444' : weeklyPercent > 70 ? '#f0a500' : '#2d6a4f',
                        borderRadius: '6px',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                )}
                {monthlyBudgetGoal > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', color: '#999' }}>Monthly budget</span>
                      <span style={{ fontSize: '13px', color: '#999' }}>${monthlyBudgetGoal.toFixed(0)}</span>
                    </div>
                    <div style={{ backgroundColor: '#f0f0f0', borderRadius: '6px', height: '8px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${monthlyPercent}%`,
                        backgroundColor: monthlyPercent > 90 ? '#cc4444' : monthlyPercent > 70 ? '#f0a500' : '#2d6a4f',
                        borderRadius: '6px',
                        transition: 'width 0.3s',
                      }} />
                    </div>
                  </div>
                )}
                <button
                  onClick={() => setEditingBudget(true)}
                  style={{
                    padding: '10px',
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#2d6a4f',
                    backgroundColor: 'transparent',
                    border: '1.5px dashed #c8e6d8',
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  {weeklyBudgetGoal > 0 ? 'Edit budget goals' : 'Set budget goals'}
                </button>
              </div>
            </div>

            {/* Ask Pantri button */}
            <button
              onClick={() => {
                sessionStorage.setItem('pantri-session-messages', JSON.stringify([]))
                sessionStorage.setItem('pantri-prefill', 'Based on my spending history and habits, how can I save money on groceries?')
                router.push('/')
              }}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '15px',
                fontWeight: '600',
                color: '#2d6a4f',
                backgroundColor: '#f0f7f4',
                border: '1.5px solid #d4eddf',
                borderRadius: '14px',
                cursor: 'pointer',
              }}
            >
              Ask Pantri how to save money
            </button>

            {/* Add record modal */}
            {adding && (
              <div
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setAdding(false)
                    setAmount('')
                    setStore('')
                    setNotes('')
                  }
                }}
                style={{
                  position: 'fixed',
                  inset: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  zIndex: 50,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <div style={{
                  backgroundColor: '#fff',
                  borderRadius: '24px 24px 0 0',
                  padding: '24px 20px',
                  width: '100%',
                  maxWidth: '600px',
                }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 20px 0' }}>Add Spending</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px', fontWeight: '600', color: '#1a1a1a' }}>$</span>
                      <input
                        autoFocus
                        type="number"
                        placeholder="0.00"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '12px 14px',
                          fontSize: '20px',
                          fontWeight: '600',
                          border: '1px solid #e0e0e0',
                          borderRadius: '12px',
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                    </div>
                    <input
                      type="text"
                      placeholder="Store (optional)"
                      value={store}
                      onChange={e => setStore(e.target.value)}
                      style={{
                        padding: '12px 14px',
                        fontSize: '15px',
                        border: '1px solid #e0e0e0',
                        borderRadius: '12px',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    <input
                      type="text"
                      placeholder="Notes (optional)"
                      value={notes}
                      onChange={e => setNotes(e.target.value)}
                      style={{
                        padding: '12px 14px',
                        fontSize: '15px',
                        border: '1px solid #e0e0e0',
                        borderRadius: '12px',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                      <button
                        onClick={handleAddRecord}
                        disabled={!amount || saving}
                        style={{
                          flex: 1,
                          padding: '14px',
                          fontSize: '15px',
                          fontWeight: '600',
                          color: '#fff',
                          backgroundColor: '#2d6a4f',
                          border: 'none',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          opacity: !amount || saving ? 0.6 : 1,
                        }}
                      >
                        {saving ? 'Saving...' : 'Save'}
                      </button>
                      <button
                        onClick={() => { setAdding(false); setAmount(''); setStore(''); setNotes('') }}
                        style={{
                          padding: '14px 20px',
                          fontSize: '15px',
                          fontWeight: '600',
                          color: '#666',
                          backgroundColor: '#f5f5f5',
                          border: 'none',
                          borderRadius: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Budget goal modal */}
            {editingBudget && (
              <div
                onClick={(e) => { if (e.target === e.currentTarget) setEditingBudget(false) }}
                style={{
                  position: 'fixed',
                  inset: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  zIndex: 50,
                  display: 'flex',
                  alignItems: 'flex-end',
                  justifyContent: 'center',
                }}
              >
                <div style={{
                  backgroundColor: '#fff',
                  borderRadius: '24px 24px 0 0',
                  padding: '24px 20px',
                  width: '100%',
                  maxWidth: '600px',
                }}>
                  <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 20px 0' }}>Set Budget Goal</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {(['weekly', 'monthly'] as const).map(type => (
                        <button
                          key={type}
                          onClick={() => setBudgetType(type)}
                          style={{
                            flex: 1,
                            padding: '10px',
                            fontSize: '14px',
                            fontWeight: '600',
                            borderRadius: '10px',
                            border: budgetType === type ? '2px solid #2d6a4f' : '2px solid #f0f0f0',
                            backgroundColor: budgetType === type ? '#f0f7f4' : '#fff',
                            color: budgetType === type ? '#2d6a4f' : '#666',
                            cursor: 'pointer',
                          }}
                        >
                          {type.charAt(0).toUpperCase() + type.slice(1)}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px', fontWeight: '600', color: '#1a1a1a' }}>$</span>
                      <input
                        autoFocus
                        type="number"
                        placeholder={budgetType === 'weekly' ? 'e.g. 150' : 'e.g. 600'}
                        value={budgetInput}
                        onChange={e => setBudgetInput(e.target.value)}
                        style={{
                          flex: 1,
                          padding: '12px 14px',
                          fontSize: '20px',
                          fontWeight: '600',
                          border: '1px solid #e0e0e0',
                          borderRadius: '12px',
                          outline: 'none',
                          fontFamily: 'inherit',
                        }}
                      />
                      <span style={{ fontSize: '14px', color: '#999' }}>/ {budgetType}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                      <button
                        onClick={saveBudget}
                        disabled={!budgetInput}
                        style={{
                          flex: 1,
                          padding: '14px',
                          fontSize: '15px',
                          fontWeight: '600',
                          color: '#fff',
                          backgroundColor: '#2d6a4f',
                          border: 'none',
                          borderRadius: '12px',
                          cursor: 'pointer',
                          opacity: !budgetInput ? 0.6 : 1,
                        }}
                      >
                        Save
                      </button>
                      <button
                        onClick={() => { setEditingBudget(false); setBudgetInput('') }}
                        style={{
                          padding: '14px 20px',
                          fontSize: '15px',
                          fontWeight: '600',
                          color: '#666',
                          backgroundColor: '#f5f5f5',
                          border: 'none',
                          borderRadius: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Records list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <h2 style={{ fontSize: '13px', fontWeight: '700', color: '#999', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '4px 0 0 4px' }}>Recent</h2>
              {records.length === 0 ? (
                <div style={{
                  backgroundColor: '#fff',
                  borderRadius: '16px',
                  padding: '32px 20px',
                  textAlign: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  <p style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a', margin: '0 0 8px 0' }}>No spending recorded yet</p>
                  <p style={{ fontSize: '14px', color: '#999', margin: 0 }}>Add entries manually or scan receipts to track spending automatically.</p>
                </div>
              ) : (
                <div style={{
                  backgroundColor: '#fff',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                }}>
                  {records.map((record, index) => (
                    <div
                      key={record.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 16px',
                        borderBottom: index < records.length - 1 ? '1px solid #f5f5f5' : 'none',
                      }}
                    >
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ fontSize: '16px', fontWeight: '600', color: '#1a1a1a', margin: 0 }}>
                            ${record.amount.toFixed(2)}
                          </p>
                          {record.source === 'receipt' && (
                            <span style={{
                              fontSize: '11px',
                              fontWeight: '600',
                              color: '#2d6a4f',
                              backgroundColor: '#f0f7f4',
                              padding: '2px 8px',
                              borderRadius: '10px',
                            }}>receipt</span>
                          )}
                        </div>
                        <p style={{ fontSize: '13px', color: '#999', margin: '2px 0 0 0' }}>
                          {[record.store, record.notes].filter(Boolean).join(' — ') || 'No details'}
                          {' · '}{formatDate(record.spent_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleDelete(record.id)}
                        style={{
                          padding: '6px 10px',
                          fontSize: '13px',
                          color: '#cc4444',
                          backgroundColor: '#fff5f5',
                          border: 'none',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          flexShrink: 0,
                          marginLeft: '12px',
                        }}
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
