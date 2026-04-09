'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({ email, password })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setError('Check your email to confirm your account.')
      setLoading(false)
    }
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
      }}>
        <h1 style={{
          fontSize: '32px',
          fontWeight: '700',
          color: '#1a1a1a',
          marginBottom: '8px',
          textAlign: 'center',
        }}>Pantri</h1>
        <p style={{
          fontSize: '16px',
          color: '#666',
          textAlign: 'center',
          marginBottom: '40px',
        }}>Your kitchen, organised.</p>

        <form style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            style={{
              padding: '14px 16px',
              fontSize: '16px',
              border: '1px solid #e0e0e0',
              borderRadius: '12px',
              outline: 'none',
              backgroundColor: '#fff',
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            style={{
              padding: '14px 16px',
              fontSize: '16px',
              border: '1px solid #e0e0e0',
              borderRadius: '12px',
              outline: 'none',
              backgroundColor: '#fff',
            }}
          />

          {error && (
            <p style={{ color: '#e53e3e', fontSize: '14px', textAlign: 'center' }}>{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              padding: '14px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#fff',
              backgroundColor: '#2d6a4f',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Loading...' : 'Log in'}
          </button>

          <button
            onClick={handleSignup}
            disabled={loading}
            style={{
              padding: '14px',
              fontSize: '16px',
              fontWeight: '600',
              color: '#2d6a4f',
              backgroundColor: 'transparent',
              border: '1px solid #2d6a4f',
              borderRadius: '12px',
              cursor: 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            Create account
          </button>
        </form>
      </div>
    </div>
  )
}
