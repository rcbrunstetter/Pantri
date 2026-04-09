'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric')
  const [familySize, setFamilySize] = useState(2)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [householdName, setHouseholdName] = useState('')
  const [members, setMembers] = useState<any[]>([])
  const [inviteLink, setInviteLink] = useState('')
  const [generatingInvite, setGeneratingInvite] = useState(false)
  const [copied, setCopied] = useState(false)
  const [householdId, setHouseholdId] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)
        loadProfile(user.id)
        loadHousehold(user.id)
      }
    })
  }, [])

  async function loadProfile(userId: string) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()

    if (data) {
      setUnitSystem(data.unit_system || 'metric')
      setFamilySize(data.family_size || 2)
    } else {
      await supabase.from('profiles').insert({ id: userId, unit_system: 'metric', family_size: 2 })
    }
    setLoading(false)
  }

  async function loadHousehold(userId: string) {
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id, role, households(name)')
      .eq('user_id', userId)
      .single()

    if (membership) {
      const household = membership.households as any
      setHouseholdName(household?.name || 'My Household')
      setHouseholdId(membership.household_id)

      const { data: allMembers } = await supabase
        .from('household_members')
        .select('user_id, role, profiles(id)')
        .eq('household_id', membership.household_id)

      setMembers(allMembers || [])
    }
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)

    await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        unit_system: unitSystem,
        family_size: familySize,
        updated_at: new Date().toISOString(),
      })

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function handleGenerateInvite() {
    if (!householdId) return
    setGeneratingInvite(true)

    const { data: invite } = await supabase
      .from('household_invites')
      .insert({
        household_id: householdId,
        created_by: user.id,
      })
      .select()
      .single()

    if (invite) {
      const link = `${window.location.origin}/join?token=${invite.token}`
      setInviteLink(link)
    }
    setGeneratingInvite(false)
  }

  async function handleCopyInvite() {
    await navigator.clipboard.writeText(inviteLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
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
        }}>Settings</h1>
        <div style={{ width: '80px' }} />
      </div>

      {/* Content */}
      <div style={{ padding: '24px 20px', maxWidth: '500px', width: '100%', margin: '0 auto' }}>
        {loading ? (
          <p style={{ color: '#999', textAlign: 'center', marginTop: '40px' }}>Loading...</p>
        ) : (
          <>
            {/* Unit System */}
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
                margin: '0 0 6px 0',
              }}>Unit System</h2>
              <p style={{
                fontSize: '14px',
                color: '#666',
                margin: '0 0 16px 0',
              }}>
                Choose how quantities are displayed and used in recipes.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {(['metric', 'imperial'] as const).map(system => (
                  <button
                    key={system}
                    onClick={() => setUnitSystem(system)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '14px 16px',
                      borderRadius: '12px',
                      border: unitSystem === system ? '2px solid #2d6a4f' : '2px solid #f0f0f0',
                      backgroundColor: unitSystem === system ? '#f0f7f4' : '#fff',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <div style={{
                      width: '20px',
                      height: '20px',
                      borderRadius: '50%',
                      border: unitSystem === system ? '6px solid #2d6a4f' : '2px solid #ccc',
                      flexShrink: 0,
                    }} />
                    <div>
                      <p style={{
                        fontSize: '15px',
                        fontWeight: '600',
                        color: '#1a1a1a',
                        margin: 0,
                      }}>
                        {system === 'metric' ? '🌍 Metric' : '🇺🇸 Imperial'}
                      </p>
                      <p style={{
                        fontSize: '13px',
                        color: '#666',
                        margin: '2px 0 0 0',
                      }}>
                        {system === 'metric'
                          ? 'Grams, milliliters, kilograms, liters'
                          : 'Ounces, cups, pounds, gallons'}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Family Size */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              marginBottom: '24px',
            }}>
              <h2 style={{
                fontSize: '16px',
                fontWeight: '700',
                color: '#1a1a1a',
                margin: '0 0 6px 0',
              }}>Family Size</h2>
              <p style={{
                fontSize: '14px',
                color: '#666',
                margin: '0 0 20px 0',
              }}>
                Recipes and grocery lists will be scaled to this number by default.
              </p>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '24px',
              }}>
                <button
                  onClick={() => setFamilySize(prev => Math.max(1, prev - 1))}
                  style={{
                    width: '44px',
                    height: '44px',
                    fontSize: '24px',
                    fontWeight: '300',
                    color: '#2d6a4f',
                    backgroundColor: '#f0f7f4',
                    border: 'none',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  −
                </button>
                <div style={{ textAlign: 'center' }}>
                  <p style={{
                    fontSize: '48px',
                    fontWeight: '700',
                    color: '#1a1a1a',
                    margin: 0,
                    lineHeight: 1,
                  }}>
                    {familySize}
                  </p>
                  <p style={{
                    fontSize: '14px',
                    color: '#999',
                    margin: '4px 0 0 0',
                  }}>
                    {familySize === 1 ? 'person' : 'people'}
                  </p>
                </div>
                <button
                  onClick={() => setFamilySize(prev => Math.min(20, prev + 1))}
                  style={{
                    width: '44px',
                    height: '44px',
                    fontSize: '24px',
                    fontWeight: '300',
                    color: '#2d6a4f',
                    backgroundColor: '#f0f7f4',
                    border: 'none',
                    borderRadius: '50%',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  +
                </button>
              </div>
            </div>

            {/* Household */}
            <div style={{
              backgroundColor: '#fff',
              borderRadius: '16px',
              padding: '20px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              marginBottom: '24px',
            }}>
              <h2 style={{
                fontSize: '16px',
                fontWeight: '700',
                color: '#1a1a1a',
                margin: '0 0 6px 0',
              }}>Household</h2>
              <p style={{
                fontSize: '14px',
                color: '#666',
                margin: '0 0 16px 0',
              }}>
                {householdName} · {members.length} {members.length === 1 ? 'member' : 'members'}
              </p>

              {!inviteLink ? (
                <button
                  onClick={handleGenerateInvite}
                  disabled={generatingInvite}
                  style={{
                    width: '100%',
                    padding: '12px',
                    fontSize: '15px',
                    fontWeight: '600',
                    color: '#2d6a4f',
                    backgroundColor: '#f0f7f4',
                    border: 'none',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    opacity: generatingInvite ? 0.7 : 1,
                  }}
                >
                  {generatingInvite ? 'Generating...' : '+ Invite Someone'}
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <p style={{ fontSize: '13px', color: '#666', margin: 0 }}>
                    Share this link — it expires in 7 days and can only be used once.
                  </p>
                  <div style={{
                    padding: '12px 14px',
                    backgroundColor: '#f5f5f5',
                    borderRadius: '10px',
                    fontSize: '13px',
                    color: '#444',
                    wordBreak: 'break-all',
                  }}>
                    {inviteLink}
                  </div>
                  <button
                    onClick={handleCopyInvite}
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '15px',
                      fontWeight: '600',
                      color: '#fff',
                      backgroundColor: copied ? '#40916c' : '#2d6a4f',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                      transition: 'background-color 0.2s',
                    }}
                  >
                    {copied ? '✓ Copied!' : 'Copy Invite Link'}
                  </button>
                  <button
                    onClick={() => setInviteLink('')}
                    style={{
                      width: '100%',
                      padding: '12px',
                      fontSize: '15px',
                      fontWeight: '600',
                      color: '#666',
                      backgroundColor: '#f5f5f5',
                      border: 'none',
                      borderRadius: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Generate New Link
                  </button>
                </div>
              )}
            </div>

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
              {saved ? '✓ Saved!' : saving ? 'Saving...' : 'Save Settings'}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
