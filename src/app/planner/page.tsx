'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Recipe {
  id: string
  title: string
  servings: number
  ingredients: any[]
}

interface MealSlot {
  recipeId: string
  recipeTitle: string
  servings: number
}

interface Meals {
  [day: string]: {
    breakfast?: MealSlot
    lunch?: MealSlot
    dinner?: MealSlot
  }
}

const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export default function PlannerPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [meals, setMeals] = useState<Meals>({})
  const [familySize, setFamilySize] = useState(2)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [weekStart, setWeekStart] = useState<Date>(() => { const today = new Date(); today.setHours(0, 0, 0, 0); return today })
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPicker, setShowPicker] = useState<{ day: string, meal: typeof MEAL_TYPES[number] } | null>(null)
  const [generatingList, setGeneratingList] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)
        const { data: membershipRows } = await supabase
          .from('household_members')
          .select('household_id')
          .eq('user_id', user.id)
          .limit(1)
        const hid = membershipRows?.[0]?.household_id
        setHouseholdId(hid)
        loadData(user.id, hid)
      }
    })
  }, [])

  useEffect(() => {
    if (user && householdId) loadWeekPlan(householdId)
  }, [weekStart, user, householdId])

  async function loadData(userId: string, hid: string) {
    const [{ data: recipesData }, { data: profile }] = await Promise.all([
      supabase.from('recipes').select('id, title, servings, ingredients').eq('household_id', hid),
      supabase.from('profiles').select('family_size').eq('id', userId).single(),
    ])
    setRecipes(recipesData || [])
    const fs = profile?.family_size || 2
    setFamilySize(fs)
    await loadWeekPlan(hid)
    setLoading(false)
  }

  async function loadWeekPlan(hid: string) {
    const { data: rows } = await supabase
      .from('meal_plans')
      .select('*')
      .eq('household_id', hid)
      .eq('week_start', formatDate(weekStart))
      .limit(1)

    const data = rows?.[0]
    if (data) {
      setMeals(data.meals || {})
    } else {
      setMeals({})
    }
  }

  async function savePlan(updatedMeals: Meals) {
    if (!householdId) return
    setSaving(true)
    await supabase.from('meal_plans').upsert({
      household_id: householdId,
      week_start: formatDate(weekStart),
      meals: updatedMeals,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'household_id,week_start' })
    setSaving(false)
  }

  function assignRecipe(day: string, mealType: typeof MEAL_TYPES[number], recipe: Recipe) {
    const updated = {
      ...meals,
      [day]: {
        ...meals[day],
        [mealType]: { recipeId: recipe.id, recipeTitle: recipe.title, servings: familySize },
      },
    }
    setMeals(updated)
    savePlan(updated)
    setShowPicker(null)
  }

  function adjustServings(day: string, mealType: typeof MEAL_TYPES[number], delta: number) {
    const slot = meals[day]?.[mealType]
    if (!slot) return
    const newServings = Math.min(20, Math.max(1, slot.servings + delta))
    const updated = {
      ...meals,
      [day]: {
        ...meals[day],
        [mealType]: { ...slot, servings: newServings },
      },
    }
    setMeals(updated)
    savePlan(updated)
  }

  function removeRecipe(day: string, mealType: typeof MEAL_TYPES[number]) {
    const updated = { ...meals }
    if (updated[day]) {
      delete updated[day][mealType]
      if (Object.keys(updated[day]).length === 0) delete updated[day]
    }
    setMeals(updated)
    savePlan(updated)
  }

  async function handleGenerateGroceryList() {
    if (!user || !householdId) return
    setGeneratingList(true)

    // Collect all unique recipe IDs in the plan
    const plannedRecipeIds = new Set<string>()
    Object.values(meals).forEach(day => {
      Object.values(day).forEach((slot: any) => {
        if (slot?.recipeId) plannedRecipeIds.add(slot.recipeId)
      })
    })

    if (plannedRecipeIds.size === 0) {
      setGeneratingList(false)
      return
    }

    // Get full recipe details
    const { data: plannedRecipes } = await supabase
      .from('recipes')
      .select('*')
      .in('id', Array.from(plannedRecipeIds))

    // Get pantry
    const { data: pantryItems } = await supabase
      .from('pantry_items')
      .select('*')
      .eq('household_id', householdId)

    // Build per-meal recipe context using per-slot servings
    const recipeLines: string[] = []
    Object.entries(meals).forEach(([day, dayMeals]) => {
      Object.entries(dayMeals).forEach(([mealType, slot]: [string, any]) => {
        if (!slot?.recipeId) return
        const recipe = plannedRecipes?.find(r => r.id === slot.recipeId)
        if (!recipe) return
        const scale = slot.servings / (recipe.servings || 2)
        const scaledIngredients = recipe.ingredients.map((ing: any) => {
          const qty = parseFloat(ing.quantity)
          const scaledQty = isNaN(qty) ? ing.quantity : (qty * scale).toFixed(1)
          return `${scaledQty} ${ing.unit} ${ing.name}`
        }).join(', ')
        recipeLines.push(`${recipe.title} (${day} ${mealType}, ${slot.servings} servings): ${scaledIngredients}`)
      })
    })
    const recipeContext = recipeLines.join('\n')

    const pantryContext = pantryItems && pantryItems.length > 0
      ? `Current pantry:\n${pantryItems.map((item: any) =>
          `- ${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ' ' + item.unit : ''})` : ''}`
        ).join('\n')}`
      : 'Pantry is empty.'

    sessionStorage.setItem('groceryFromPlan', JSON.stringify({
      recipeContext,
      pantryContext,
      servings: familySize,
    }))

    setGeneratingList(false)
    router.push('/grocery?mode=plan')
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
        <h1 style={{
          fontSize: '20px',
          fontWeight: '700',
          color: '#1a1a1a',
          margin: 0,
        }}>Meal Planner</h1>
        <button
          onClick={handleGenerateGroceryList}
          disabled={generatingList || Object.keys(meals).length === 0}
          style={{
            padding: '8px 14px',
            fontSize: '14px',
            fontWeight: '600',
            color: '#fff',
            backgroundColor: '#2d6a4f',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            opacity: generatingList || Object.keys(meals).length === 0 ? 0.5 : 1,
          }}
        >
          List
        </button>
      </div>

      {/* Week navigation */}
      <div style={{
        padding: '12px 20px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
      }}>
        <button
          onClick={() => setWeekStart(addDays(weekStart, -7))}
          style={{
            padding: '6px 10px',
            fontSize: '16px',
            backgroundColor: '#f0f7f4',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            color: '#2d6a4f',
          }}
        >
          ‹
        </button>
        <span style={{ fontSize: '14px', fontWeight: '600', color: '#1a1a1a', whiteSpace: 'nowrap' }}>
          {weekStart.toLocaleDateString('en', { month: 'short', day: 'numeric' })} –{' '}
          {addDays(weekStart, 6).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
        </span>
        <button
          onClick={() => setWeekStart(addDays(weekStart, 7))}
          style={{
            padding: '6px 10px',
            fontSize: '16px',
            backgroundColor: '#f0f7f4',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            color: '#2d6a4f',
          }}
        >
          ›
        </button>
      </div>

      {/* Meal grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>Loading...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {Array.from({ length: 7 }, (_, i) => { const d = new Date(weekStart); d.setDate(d.getDate() + i); return d.toLocaleDateString('en', { weekday: 'long' }) }).map((day, dayIndex) => (
              <div key={day} style={{
                backgroundColor: '#fff',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                {/* Day header */}
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#f0f7f4',
                  borderBottom: '1px solid #e8f4ee',
                }}>
                  <p style={{
                    fontSize: '15px',
                    fontWeight: '700',
                    color: '#2d6a4f',
                    margin: 0,
                  }}>
                    {day}
                    <span style={{ fontSize: '12px', fontWeight: '400', color: '#666', marginLeft: '8px' }}>
                      {addDays(weekStart, dayIndex).toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                    </span>
                  </p>
                </div>

                {/* Meal slots */}
                {MEAL_TYPES.map((mealType, index) => {
                  const slot = meals[day]?.[mealType]
                  return (
                    <div key={mealType} style={{
                      padding: '12px 16px',
                      borderBottom: index < MEAL_TYPES.length - 1 ? '1px solid #f5f5f5' : 'none',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0, width: '70px' }}>{mealType.charAt(0).toUpperCase() + mealType.slice(1)}</span>
                      {slot ? (
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <p style={{
                              fontSize: '14px',
                              fontWeight: '500',
                              color: '#1a1a1a',
                              margin: 0,
                              flex: 1,
                              marginRight: '8px',
                            }}>{slot.recipeTitle}</p>
                            <button
                              onClick={() => removeRecipe(day, mealType)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                color: '#cc4444',
                                backgroundColor: '#fff5f5',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                flexShrink: 0,
                              }}
                            >✕</button>
                          </div>
                          {/* Per-meal servings stepper */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                            <button
                              onClick={() => adjustServings(day, mealType, -1)}
                              style={{
                                width: '22px',
                                height: '22px',
                                fontSize: '14px',
                                backgroundColor: '#f0f7f4',
                                border: 'none',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                color: '#2d6a4f',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >−</button>
                            <span style={{ fontSize: '13px', fontWeight: '600', color: '#1a1a1a', minWidth: '16px', textAlign: 'center' }}>
                              {slot.servings}
                            </span>
                            <button
                              onClick={() => adjustServings(day, mealType, 1)}
                              style={{
                                width: '22px',
                                height: '22px',
                                fontSize: '14px',
                                backgroundColor: '#f0f7f4',
                                border: 'none',
                                borderRadius: '50%',
                                cursor: 'pointer',
                                color: '#2d6a4f',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                              }}
                            >+</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => setShowPicker({ day, meal: mealType })}
                          style={{
                            flex: 1,
                            padding: '8px 12px',
                            fontSize: '13px',
                            color: '#999',
                            backgroundColor: 'transparent',
                            border: '1.5px dashed #e0e0e0',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            textAlign: 'left',
                          }}
                        >
                          + Add {mealType}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recipe Picker Modal */}
      {showPicker && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          zIndex: 50,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '24px 24px 0 0',
            padding: '24px 20px',
            width: '100%',
            maxWidth: '600px',
            maxHeight: '70vh',
            overflowY: 'auto',
          }}>
            <h2 style={{
              fontSize: '18px',
              fontWeight: '700',
              color: '#1a1a1a',
              margin: '0 0 4px 0',
            }}>
              {showPicker.meal.charAt(0).toUpperCase() + showPicker.meal.slice(1)}
            </h2>
            <p style={{
              fontSize: '14px',
              color: '#666',
              margin: '0 0 16px 0',
            }}>{showPicker.day}</p>

            {recipes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <p style={{ color: '#666', marginBottom: '16px' }}>No recipes yet. Import some first!</p>
                <button
                  onClick={() => { setShowPicker(null); router.push('/recipes') }}
                  style={{
                    padding: '12px 20px',
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#fff',
                    backgroundColor: '#2d6a4f',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Go to Recipe Book
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {recipes.map(recipe => (
                  <button
                    key={recipe.id}
                    onClick={() => assignRecipe(showPicker.day, showPicker.meal, recipe)}
                    style={{
                      padding: '14px 16px',
                      fontSize: '15px',
                      fontWeight: '500',
                      color: '#1a1a1a',
                      backgroundColor: '#fafaf8',
                      border: '1px solid #f0f0f0',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    {recipe.title}
                    <span style={{ fontSize: '12px', color: '#999', marginLeft: '8px' }}>
                      {recipe.ingredients.length} ingredients
                    </span>
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={() => setShowPicker(null)}
              style={{
                width: '100%',
                marginTop: '16px',
                padding: '14px',
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
      )}
    </div>
  )
}
