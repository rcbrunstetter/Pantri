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
}

interface Meals {
  [day: string]: {
    breakfast?: MealSlot
    lunch?: MealSlot
    dinner?: MealSlot
  }
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MEAL_TYPES = ['breakfast', 'lunch', 'dinner'] as const

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export default function PlannerPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [meals, setMeals] = useState<Meals>({})
  const [servings, setServings] = useState(2)
  const [familySize, setFamilySize] = useState(2)
  const [weekStart, setWeekStart] = useState<Date>(getMonday(new Date()))
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showPicker, setShowPicker] = useState<{ day: string, meal: typeof MEAL_TYPES[number] } | null>(null)
  const [generatingList, setGeneratingList] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)
        loadData(user.id)
      }
    })
  }, [])

  useEffect(() => {
    if (user) loadWeekPlan(user.id)
  }, [weekStart, user])

  async function loadData(userId: string) {
    const [{ data: recipesData }, { data: profile }] = await Promise.all([
      supabase.from('recipes').select('id, title, servings, ingredients').eq('user_id', userId),
      supabase.from('profiles').select('family_size').eq('id', userId).single(),
    ])
    setRecipes(recipesData || [])
    const fs = profile?.family_size || 2
    setFamilySize(fs)
    setServings(fs)
    await loadWeekPlan(userId)
    setLoading(false)
  }

  async function loadWeekPlan(userId: string) {
    const { data } = await supabase
      .from('meal_plans')
      .select('*')
      .eq('user_id', userId)
      .eq('week_start', formatDate(weekStart))
      .single()

    if (data) {
      setMeals(data.meals || {})
      setServings(data.servings || familySize)
    } else {
      setMeals({})
    }
  }

  async function savePlan(updatedMeals: Meals) {
    if (!user) return
    setSaving(true)
    await supabase.from('meal_plans').upsert({
      user_id: user.id,
      week_start: formatDate(weekStart),
      meals: updatedMeals,
      servings,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,week_start' })
    setSaving(false)
  }

  function assignRecipe(day: string, mealType: typeof MEAL_TYPES[number], recipe: Recipe) {
    const updated = {
      ...meals,
      [day]: {
        ...meals[day],
        [mealType]: { recipeId: recipe.id, recipeTitle: recipe.title },
      },
    }
    setMeals(updated)
    savePlan(updated)
    setShowPicker(null)
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
    if (!user) return
    setGeneratingList(true)

    // Collect all recipes in the plan
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
      .eq('user_id', user.id)

    // Build context for grocery API
    const recipeContext = plannedRecipes?.map(r => {
      const scale = servings / (r.servings || 2)
      const scaledIngredients = r.ingredients.map((ing: any) => {
        const qty = parseFloat(ing.quantity)
        const scaledQty = isNaN(qty) ? ing.quantity : (qty * scale).toFixed(1)
        return `${scaledQty} ${ing.unit} ${ing.name}`
      }).join(', ')
      return `${r.title}: ${scaledIngredients}`
    }).join('\n')

    const pantryContext = pantryItems && pantryItems.length > 0
      ? `Current pantry:\n${pantryItems.map((item: any) =>
          `- ${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ' ' + item.unit : ''})` : ''}`
        ).join('\n')}`
      : 'Pantry is empty.'

    // Store in sessionStorage and navigate to grocery page with plan mode
    sessionStorage.setItem('groceryFromPlan', JSON.stringify({
      recipeContext,
      pantryContext,
      servings,
    }))

    setGeneratingList(false)
    router.push('/grocery?mode=plan')
  }

  const mealEmoji = { breakfast: '🌅', lunch: '☀️', dinner: '🌙' }

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
          🛒 List
        </button>
      </div>

      {/* Week navigation + servings */}
      <div style={{
        padding: '12px 20px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #f0f0f0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}>
        {/* Week nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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

        {/* Servings */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '13px', color: '#666' }}>👥</span>
          <button
            onClick={() => setServings(prev => Math.max(1, prev - 1))}
            style={{
              width: '28px',
              height: '28px',
              fontSize: '18px',
              backgroundColor: '#f0f7f4',
              border: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              color: '#2d6a4f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >−</button>
          <span style={{ fontSize: '15px', fontWeight: '700', color: '#1a1a1a', minWidth: '20px', textAlign: 'center' }}>
            {servings}
          </span>
          <button
            onClick={() => setServings(prev => Math.min(20, prev + 1))}
            style={{
              width: '28px',
              height: '28px',
              fontSize: '18px',
              backgroundColor: '#f0f7f4',
              border: 'none',
              borderRadius: '50%',
              cursor: 'pointer',
              color: '#2d6a4f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >+</button>
        </div>
      </div>

      {/* Meal grid */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {loading ? (
          <p style={{ textAlign: 'center', color: '#999', marginTop: '40px' }}>Loading...</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {DAYS.map((day, dayIndex) => (
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
                      <span style={{ fontSize: '16px', flexShrink: 0 }}>{mealEmoji[mealType]}</span>
                      {slot ? (
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <p style={{
                            fontSize: '14px',
                            fontWeight: '500',
                            color: '#1a1a1a',
                            margin: 0,
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
              {mealEmoji[showPicker.meal]} {showPicker.meal.charAt(0).toUpperCase() + showPicker.meal.slice(1)}
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
