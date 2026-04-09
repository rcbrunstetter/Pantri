'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Ingredient {
  name: string
  quantity: string
  unit: string
}

interface Recipe {
  id: string
  title: string
  description: string | null
  ingredients: Ingredient[]
  instructions: string
  servings: number
  source_url: string | null
  created_at: string
}

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importUrl, setImportUrl] = useState('')
  const [selectedRecipe, setSelectedRecipe] = useState<Recipe | null>(null)
  const [error, setError] = useState('')
  const [user, setUser] = useState<any>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)
        loadRecipes(user.id)
      }
    })
  }, [])

  async function loadRecipes(userId: string) {
    const { data } = await supabase
      .from('recipes')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    setRecipes(data || [])
    setLoading(false)
  }

  async function handleImportUrl() {
    if (!importUrl.trim() || !user) return
    setImporting(true)
    setError('')

    const formData = new FormData()
    formData.append('userId', user.id)
    formData.append('url', importUrl.trim())

    const response = await fetch('/api/recipe-import', {
      method: 'POST',
      body: formData,
    })

    const data = await response.json()

    if (data.error) {
      setError(data.error)
    } else {
      setRecipes(prev => [data.recipe, ...prev])
      setImportUrl('')
      setShowImport(false)
    }

    setImporting(false)
  }

  async function handleImportImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setImporting(true)
    setError('')

    const formData = new FormData()
    formData.append('userId', user.id)
    formData.append('file', file)

    const response = await fetch('/api/recipe-import', {
      method: 'POST',
      body: formData,
    })

    const data = await response.json()

    if (data.error) {
      setError(data.error)
    } else {
      setRecipes(prev => [data.recipe, ...prev])
      setShowImport(false)
    }

    setImporting(false)
    e.target.value = ''
  }

  async function deleteRecipe(id: string) {
    await supabase.from('recipes').delete().eq('id', id)
    setRecipes(prev => prev.filter(r => r.id !== id))
    if (selectedRecipe?.id === id) setSelectedRecipe(null)
  }

  if (selectedRecipe) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: '#fafaf8',
      }}>
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
            onClick={() => setSelectedRecipe(null)}
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
            fontSize: '18px',
            fontWeight: '700',
            color: '#1a1a1a',
            margin: 0,
            flex: 1,
            textAlign: 'center',
            padding: '0 12px',
          }}>{selectedRecipe.title}</h1>
          <button
            onClick={() => deleteRecipe(selectedRecipe.id)}
            style={{
              padding: '8px 12px',
              fontSize: '13px',
              color: '#cc4444',
              backgroundColor: '#fff5f5',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Delete
          </button>
        </div>

        <div style={{ padding: '20px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
          {selectedRecipe.description && (
            <p style={{
              fontSize: '15px',
              color: '#666',
              marginBottom: '24px',
              lineHeight: '1.5',
            }}>{selectedRecipe.description}</p>
          )}

          <div style={{
            backgroundColor: '#fff',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            marginBottom: '16px',
          }}>
            <h2 style={{
              fontSize: '16px',
              fontWeight: '700',
              color: '#1a1a1a',
              margin: '0 0 16px 0',
            }}>
              Ingredients
              <span style={{ fontSize: '13px', fontWeight: '400', color: '#999', marginLeft: '8px' }}>
                for {selectedRecipe.servings} servings
              </span>
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {selectedRecipe.ingredients.map((ing, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  paddingBottom: '10px',
                  borderBottom: i < selectedRecipe.ingredients.length - 1 ? '1px solid #f5f5f5' : 'none',
                }}>
                  <span style={{ fontSize: '15px', color: '#1a1a1a' }}>{ing.name}</span>
                  <span style={{ fontSize: '14px', color: '#999' }}>
                    {[ing.quantity, ing.unit].filter(Boolean).join(' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{
            backgroundColor: '#fff',
            borderRadius: '16px',
            padding: '20px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <h2 style={{
              fontSize: '16px',
              fontWeight: '700',
              color: '#1a1a1a',
              margin: '0 0 16px 0',
            }}>Instructions</h2>
            <p style={{
              fontSize: '15px',
              color: '#333',
              lineHeight: '1.7',
              margin: 0,
              whiteSpace: 'pre-line',
            }}>{selectedRecipe.instructions}</p>
          </div>

          {selectedRecipe.source_url && (
            <a
              href={selectedRecipe.source_url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'block',
                textAlign: 'center',
                marginTop: '16px',
                fontSize: '14px',
                color: '#2d6a4f',
                textDecoration: 'none',
              }}
            >
              View original recipe →
            </a>
          )}
        </div>
      </div>
    )
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
        }}>Recipe Book</h1>
        <button
          onClick={() => setShowImport(true)}
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
          + Import
        </button>
      </div>

      {/* Import Modal */}
      {showImport && (
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
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: '#1a1a1a',
              margin: '0 0 6px 0',
            }}>Import Recipe</h2>
            <p style={{
              fontSize: '14px',
              color: '#666',
              margin: '0 0 20px 0',
            }}>Paste a URL or upload a screenshot</p>

            {error && (
              <p style={{
                color: '#cc4444',
                fontSize: '14px',
                marginBottom: '12px',
                padding: '10px 14px',
                backgroundColor: '#fff5f5',
                borderRadius: '8px',
              }}>{error}</p>
            )}

            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <input
                placeholder="https://..."
                value={importUrl}
                onChange={e => setImportUrl(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleImportUrl()}
                style={{
                  flex: 1,
                  padding: '12px 16px',
                  fontSize: '15px',
                  border: '1px solid #e0e0e0',
                  borderRadius: '12px',
                  outline: 'none',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={handleImportUrl}
                disabled={importing || !importUrl.trim()}
                style={{
                  padding: '12px 16px',
                  fontSize: '15px',
                  fontWeight: '600',
                  color: '#fff',
                  backgroundColor: '#2d6a4f',
                  border: 'none',
                  borderRadius: '12px',
                  cursor: 'pointer',
                  opacity: importing || !importUrl.trim() ? 0.5 : 1,
                  whiteSpace: 'nowrap',
                }}
              >
                {importing ? 'Reading...' : 'Import'}
              </button>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '12px',
            }}>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#f0f0f0' }} />
              <span style={{ fontSize: '13px', color: '#999' }}>or</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: '#f0f0f0' }} />
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={handleImportImage}
              style={{ display: 'none' }}
              id="recipe-image-input"
            />
            <label
              htmlFor="recipe-image-input"
              style={{
                display: 'block',
                width: '100%',
                padding: '14px',
                fontSize: '15px',
                fontWeight: '600',
                color: '#2d6a4f',
                backgroundColor: '#f0f7f4',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                textAlign: 'center',
                marginBottom: '12px',
                boxSizing: 'border-box',
              }}
            >
              📷 Upload Screenshot
            </label>

            <button
              onClick={() => { setShowImport(false); setImportUrl(''); setError('') }}
              style={{
                width: '100%',
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

      {/* Content */}
      <div style={{ padding: '20px', flex: 1 }}>
        {loading ? (
          <p style={{ color: '#999', textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : recipes.length === 0 ? (
          <div style={{ textAlign: 'center', marginTop: '60px' }}>
            <p style={{ fontSize: '48px', marginBottom: '16px' }}>📖</p>
            <p style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a1a', marginBottom: '8px' }}>
              No recipes yet
            </p>
            <p style={{ fontSize: '15px', color: '#666', marginBottom: '24px' }}>
              Import a recipe from a URL or screenshot
            </p>
            <button
              onClick={() => setShowImport(true)}
              style={{
                padding: '14px 24px',
                fontSize: '15px',
                fontWeight: '600',
                color: '#fff',
                backgroundColor: '#2d6a4f',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
              }}
            >
              + Import your first recipe
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {recipes.map(recipe => (
              <div
                key={recipe.id}
                onClick={() => setSelectedRecipe(recipe)}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: '16px',
                  padding: '16px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <div>
                  <p style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1a1a1a',
                    margin: 0,
                  }}>{recipe.title}</p>
                  {recipe.description && (
                    <p style={{
                      fontSize: '13px',
                      color: '#999',
                      margin: '4px 0 0 0',
                    }}>{recipe.description}</p>
                  )}
                  <p style={{
                    fontSize: '12px',
                    color: '#bbb',
                    margin: '4px 0 0 0',
                  }}>
                    {recipe.ingredients.length} ingredients · {recipe.servings} servings
                  </p>
                </div>
                <span style={{ color: '#ccc', fontSize: '20px' }}>›</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
