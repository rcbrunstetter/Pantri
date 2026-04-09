'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function JoinPage() {
  const [status, setStatus] = useState<'loading' | 'ready' | 'joining' | 'error'>('loading')
  const [householdName, setHouseholdName] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [token, setToken] = useState('')
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const t = params.get('token')
    if (!t) {
      setErrorMessage('Invalid invite link.')
      setStatus('error')
      return
    }
    setToken(t)
    loadInvite(t)
  }, [])

  async function loadInvite(t: string) {
    const { data: invite } = await supabase
      .from('household_invites')
      .select('household_id, used_at, expires_at, households(name)')
      .eq('token', t)
      .single()

    if (!invite) {
      setErrorMessage('This invite link is invalid or has expired.')
      setStatus('error')
      return
    }

    if (invite.used_at) {
      setErrorMessage('This invite link has already been used.')
      setStatus('error')
      return
    }

    if (new Date(invite.expires_at) < new Date()) {
      setErrorMessage('This invite link has expired.')
      setStatus('error')
      return
    }

    const household = invite.households as any
    setHouseholdName(household?.name || 'a household')
    setStatus('ready')
  }

  async function handleJoin() {
    setStatus('joining')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      router.push('/login')
      return
    }

    const userId = session.user.id

    // Get the invite details
    const { data: invite } = await supabase
      .from('household_invites')
      .select('household_id')
      .eq('token', token)
      .single()

    if (!invite) {
      setErrorMessage('Invite not found.')
      setStatus('error')
      return
    }

    // Remove user from their current household
    await supabase
      .from('household_members')
      .delete()
      .eq('user_id', userId)

    // Add user to new household
    await supabase
      .from('household_members')
      .insert({
        household_id: invite.household_id,
        user_id: userId,
        role: 'member',
      })

    // Mark invite as used
    await supabase
      .from('household_invites')
      .update({ used_by: userId, used_at: new Date().toISOString() })
      .eq('token', token)

    router.push('/')
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#fafaf8',
      padding: '24px',
    }}>
      <div style={{
        width: '100%',
        maxWidth: '400px',
        textAlign: 'center',
      }}>
        <span style={{
          fontSize: '28px',
          fontWeight: '800',
          color: '#2d6a4f',
          letterSpacing: '-1px',
          fontFamily: 'Georgia, "Times New Roman", serif',
          display: 'block',
          marginBottom: '32px',
        }}>Pantri</span>

        {status === 'loading' && (
          <p style={{ color: '#999', fontSize: '16px' }}>Loading invite...</p>
        )}

        {status === 'error' && (
          <>
            <p style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a1a', marginBottom: '8px' }}>
              Invalid Invite
            </p>
            <p style={{ fontSize: '15px', color: '#666', marginBottom: '24px' }}>{errorMessage}</p>
            <button
              onClick={() => router.push('/')}
              style={{
                padding: '14px 24px',
                fontSize: '16px',
                fontWeight: '600',
                color: '#fff',
                backgroundColor: '#2d6a4f',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
              }}
            >
              Go to Pantri
            </button>
          </>
        )}

        {(status === 'ready' || status === 'joining') && (
          <>
            <p style={{ fontSize: '18px', fontWeight: '600', color: '#1a1a1a', marginBottom: '8px' }}>
              You have been invited
            </p>
            <p style={{ fontSize: '15px', color: '#666', marginBottom: '32px' }}>
              Join <strong>{householdName}</strong> on Pantri to share a pantry, recipes, and meal plans.
            </p>
            <button
              onClick={handleJoin}
              disabled={status === 'joining'}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '16px',
                fontWeight: '600',
                color: '#fff',
                backgroundColor: '#2d6a4f',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                opacity: status === 'joining' ? 0.7 : 1,
                marginBottom: '12px',
              }}
            >
              {status === 'joining' ? 'Joining...' : `Join ${householdName}`}
            </button>
            <button
              onClick={() => router.push('/')}
              style={{
                width: '100%',
                padding: '14px',
                fontSize: '16px',
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
          </>
        )}
      </div>
    </div>
  )
}
