'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const DIETARY_OPTIONS = [
  'Vegetarian',
  'Vegan',
  'Gluten-free',
  'Dairy-free',
  'Halal',
  'Kosher',
]

const CUISINE_OPTIONS = [
  'Italian',
  'Asian',
  'Mediterranean',
  'Mexican',
  'American',
  'Middle Eastern',
]

export default function FoodProfilePage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [dietaryRestrictions, setDietaryRestrictions] = useState<string[]>([])
  const [allergies, setAllergies] = useState('')
  const [dislikedIngredients, setDislikedIngredients] = useState('')
  const [cuisinePreferences, setCuisinePreferences] = useState<string[]>([])
  const [weeklyBudget, setWeeklyBudget] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        loadProfile(session.user.id)
      }
    })
  }, [])

  async function loadProfile(userId: string) {
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .single()

    if (!membership) {
      setLoading(false)
      return
    }

    setHouseholdId(membership.household_id)

    const { data } = await supabase
      .from('household_profiles')
      .select('*')
      .eq('household_id', membership.household_id)
      .single()

    if (data) {
      setDietaryRestrictions(data.dietary_restrictions || [])
      setAllergies(data.allergies || '')
      setDislikedIngredients(data.disliked_ingredients || '')
      setCuisinePreferences(data.cuisine_preferences || [])
      setWeeklyBudget(data.weekly_budget ? data.weekly_budget.toString() : '')
    }

    setLoading(false)
  }

  function toggleItem(list: string[], setList: (v: string[]) => void, item: string) {
    if (list.includes(item)) {
      setList(list.filter(i => i !== item))
    } else {
      setList([...list, item])
    }
  }

  async function handleSave() {
    if (!householdId) return
    setSaving(true)

    await supabase
      .from('household_profiles')
      .upsert({
        household_id: householdId,
        dietary_restrictions: dietaryRestrictions,
        allergies,
        disliked_ingredients: dislikedIngredients,
        cuisine_preferences: cuisinePreferences,
        weekly_budget: weeklyBudget ? parseFloat(weeklyBudget) : null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'household_id' })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
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
          onClick={() => router.push('/settings')}
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
        <h1 style={{
          fontSize: '20px',
          fontWeight: '700',
          color: '#1a1a1a',
          margin: 0,
        }}>Food Profile</h1>
        <div style={{ width: '60px' }} />
      </div>

      <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {loading ? (
          <p style={{ color: '#999', textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : (
          <>
            {/* Dietary Restrictions */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 6px 0' }}>
                Dietary Restrictions
              </h2>
              <p style={{ fontSize: '14px', color: '#666', margin: '0 0 16px 0' }}>
                Pantri will avoid suggesting meals that don't fit.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {DIETARY_OPTIONS.map(option => (
                  <button
                    key={option}
                    onClick={() => toggleItem(dietaryRestrictions, setDietaryRestrictions, option)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      fontWeight: '500',
                      borderRadius: '20px',
                      border: dietaryRestrictions.includes(option) ? '2px solid #2d6a4f' : '2px solid #e0e0e0',
                      backgroundColor: dietaryRestrictions.includes(option) ? '#f0f7f4' : '#fff',
                      color: dietaryRestrictions.includes(option) ? '#2d6a4f' : '#666',
                      cursor: 'pointer',
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Allergies */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 6px 0' }}>
                Allergies
              </h2>
              <p style={{ fontSize: '14px', color: '#666', margin: '0 0 16px 0' }}>
                Pantri will never suggest anything containing these.
              </p>
              <input
                type="text"
                placeholder="e.g. peanuts, shellfish, tree nuts"
                value={allergies}
                onChange={e => setAllergies(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: '15px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '12px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Disliked Ingredients */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 6px 0' }}>
                Disliked Ingredients
              </h2>
              <p style={{ fontSize: '14px', color: '#666', margin: '0 0 16px 0' }}>
                Pantri will try to avoid these in suggestions.
              </p>
              <input
                type="text"
                placeholder="e.g. cilantro, blue cheese, anchovies"
                value={dislikedIngredients}
                onChange={e => setDislikedIngredients(e.target.value)}
                style={{
                  width: '100%',
                  padding: '12px 14px',
                  fontSize: '15px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '12px',
                  outline: 'none',
                  fontFamily: 'inherit',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Cuisine Preferences */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 6px 0' }}>
                Cuisine Preferences
              </h2>
              <p style={{ fontSize: '14px', color: '#666', margin: '0 0 16px 0' }}>
                Pantri will skew meal suggestions toward these styles.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                {CUISINE_OPTIONS.map(option => (
                  <button
                    key={option}
                    onClick={() => toggleItem(cuisinePreferences, setCuisinePreferences, option)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '14px',
                      fontWeight: '500',
                      borderRadius: '20px',
                      border: cuisinePreferences.includes(option) ? '2px solid #2d6a4f' : '2px solid #e0e0e0',
                      backgroundColor: cuisinePreferences.includes(option) ? '#f0f7f4' : '#fff',
                      color: cuisinePreferences.includes(option) ? '#2d6a4f' : '#666',
                      cursor: 'pointer',
                    }}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* Weekly Budget */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: '#1a1a1a', margin: '0 0 6px 0' }}>
                Weekly Grocery Budget
              </h2>
              <p style={{ fontSize: '14px', color: '#666', margin: '0 0 16px 0' }}>
                Pantri will keep grocery suggestions within this range.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px', fontWeight: '600', color: '#1a1a1a' }}>$</span>
                <input
                  type="number"
                  placeholder="e.g. 150"
                  value={weeklyBudget}
                  onChange={e => setWeeklyBudget(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    fontSize: '15px',
                    border: '1px solid #e0e0e0',
                    borderRadius: '12px',
                    outline: 'none',
                    fontFamily: 'inherit',
                  }}
                />
                <span style={{ fontSize: '14px', color: '#999' }}>/ week</span>
              </div>
            </div>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '16px',
                fontWeight: '600',
                color: '#fff',
                backgroundColor: saved ? '#40916c' : '#2d6a4f',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                opacity: saving ? 0.7 : 1,
                transition: 'background-color 0.2s',
              }}
            >
              {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Food Profile'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
