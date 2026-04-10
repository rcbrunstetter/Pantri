'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export default function HomePage() {
  const SESSION_MESSAGES_KEY = 'pantri-session-messages'

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [welcomeMessage, setWelcomeMessage] = useState('')
  const [welcomeLoading, setWelcomeLoading] = useState(true)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkAuth = async () => {
      // Small delay to allow Supabase to finish writing session to storage
      await new Promise(resolve => setTimeout(resolve, 100))

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
      } else {
        setUser(session.user)
        const saved = sessionStorage.getItem(SESSION_MESSAGES_KEY)
        if (saved) {
          setMessages(JSON.parse(saved))
          setWelcomeLoading(false)
          setWelcomeMessage('')
        } else {
          loadWelcome(session.user.id)
        }
        ensureHousehold(session.user.id)
        const prefill = sessionStorage.getItem('pantri-prefill')
        if (prefill) {
          sessionStorage.removeItem('pantri-prefill')
          setInput(prefill)
        }
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadWelcome(userId: string) {
    setWelcomeLoading(true)
    await ensureHousehold(userId)

    // Check if we have cached suggestions from today
    const cacheKey = 'pantri-suggestions'
    const cached = localStorage.getItem(cacheKey)
    if (cached) {
      const { suggestions: cachedSuggestions, date } = JSON.parse(cached)
      const today = new Date().toDateString()
      if (date === today && cachedSuggestions.length > 0) {
        setSuggestions(cachedSuggestions)
        setWelcomeMessage('Welcome back! Here is what is on your mind today.')
        setWelcomeLoading(false)
        return
      }
    }

    // Generate fresh suggestions and welcome
    const [welcomeRes, suggestionsRes] = await Promise.all([
      fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'Generate a warm, friendly 1-2 sentence welcome message for someone opening their kitchen app. Be warm and encouraging. No pantry counts, no meal suggestions, no lists, no emojis. Just a friendly greeting.',
          userId,
          history: [],
        }),
      }),
      fetch('/api/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      }),
    ])

    const welcomeData = await welcomeRes.json()
    const suggestionsData = await suggestionsRes.json()

    const newSuggestions = suggestionsData.suggestions || [
      'What can I make tonight?',
      'Generate my grocery list',
      'What am I running low on?',
      'Plan my meals this week',
    ]

    setWelcomeMessage(welcomeData.reply || 'Welcome back! What are we cooking today?')
    setSuggestions(newSuggestions)

    // Cache suggestions for today
    localStorage.setItem(cacheKey, JSON.stringify({
      suggestions: newSuggestions,
      date: new Date().toDateString(),
    }))

    setWelcomeLoading(false)
  }

  async function handleSend() {
    if (!input.trim() || loading || !user) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage.content,
          userId: user.id,
          history: messages.slice(-10),
        }),
      })

      const data = await response.json()

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.reply,
      }

      setMessages(prev => [...prev, assistantMessage])
      const updated = [...messages, userMessage, assistantMessage]
      sessionStorage.setItem(SESSION_MESSAGES_KEY, JSON.stringify(updated))

    } catch (err) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Something went wrong. Please try again.',
      }])
    } finally {
      setLoading(false)
    }
  }

  async function handleReceiptUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !user) return

    setUploading(true)

    const uploadingMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: 'Receipt uploaded — reading it now...',
    }
    setMessages(prev => [...prev, uploadingMessage])

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('userId', user.id)

      const response = await fetch('/api/receipt', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Server error')
      }

      const data = await response.json()

      if (data.success && data.items && data.items.length > 0) {
        const itemList = data.items.map((i: any) => {
          const qty = i.quantity && i.unit
            ? ` (${i.quantity}${i.unit})`
            : i.quantity ? ` (${i.quantity})` : ''
          return `${i.name}${qty}`
        }).join(', ')

        const store = data.store ? ` from ${data.store}` : ''
        const replyMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Got it! I found ${data.items.length} items${store} on your receipt and added them to your pantry: ${itemList}.`,
        }
        setMessages(prev => [...prev, replyMessage])
        sessionStorage.setItem(SESSION_MESSAGES_KEY, JSON.stringify([...messages, uploadingMessage, replyMessage]))
      } else {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "I couldn't read that receipt clearly. Try a photo with better lighting, or type out what you bought!",
        }])
      }
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `Something went wrong: ${err?.message || 'Unknown error'}`,
      }])
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function formatMessage(text: string): string {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/(\d+\.)\s/g, '<br/><strong>$1</strong> ')
      .replace(/^[-•]\s(.+)/gm, '<br/>• $1')
      .replace(/\s-\s([^-])/g, '<br/>• $1')
      .replace(/\n\n/g, '<br/><br/>')
      .replace(/\n/g, '<br/>')
      .replace(/^<br\/>/, '')
  }

  async function ensureHousehold(userId: string) {
    await fetch('/api/ensure-household', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId }),
    })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#fafaf8',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #f0f0f0',
        position: 'relative',
      }}>
        {/* Logo */}
        <span style={{
          fontSize: '28px',
          fontWeight: '800',
          color: '#2d6a4f',
          letterSpacing: '-1px',
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}>Pantri</span>

        {/* Hamburger menu */}
        <button
          onClick={() => setMenuOpen(prev => !prev)}
          style={{
            width: '38px',
            height: '38px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '5px',
            backgroundColor: menuOpen ? '#f0f7f4' : 'transparent',
            border: '1px solid #e0e0e0',
            borderRadius: '10px',
            cursor: 'pointer',
            padding: '0',
          }}
        >
          {[0,1,2].map(i => (
            <div key={i} style={{
              width: '16px',
              height: '2px',
              backgroundColor: '#2d6a4f',
              borderRadius: '2px',
            }} />
          ))}
        </button>

        {/* Dropdown */}
        {menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{ position: 'fixed', inset: 0, zIndex: 40 }}
            />
            <div style={{
              position: 'absolute',
              top: '54px',
              right: '20px',
              backgroundColor: '#fff',
              borderRadius: '14px',
              boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
              zIndex: 50,
              overflow: 'hidden',
              minWidth: '180px',
              border: '1px solid #f0f0f0',
            }}>
              {[
                { label: 'Recipe Book', action: () => { router.push('/recipes'); setMenuOpen(false) } },
                { label: 'Finances', action: () => { router.push('/finances'); setMenuOpen(false) } },
                { label: 'Settings', action: () => { router.push('/settings'); setMenuOpen(false) } },
                { label: 'Log out', action: () => { handleLogout(); setMenuOpen(false) }, danger: true },
              ].map((item, index, arr) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    fontSize: '15px',
                    fontWeight: '500',
                    color: item.danger ? '#cc4444' : '#1a1a1a',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: index < arr.length - 1 ? '1px solid #f5f5f5' : 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '16px',
        paddingBottom: '140px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
        {/* Welcome card */}
        {messages.length === 0 && (
          <div style={{
            backgroundColor: '#fff',
            borderRadius: '18px',
            padding: '16px 18px',
            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            alignSelf: 'flex-start',
            maxWidth: '82%',
          }}>
            {welcomeLoading ? (
              <p style={{ color: '#999', fontSize: '15px', margin: 0 }}>Good to see you...</p>
            ) : (
              <span style={{ fontSize: '15px', lineHeight: '1.5', color: '#1a1a1a' }}
                dangerouslySetInnerHTML={{ __html: formatMessage(welcomeMessage) }}
              />
            )}
          </div>
        )}

        {/* Suggestion chips */}
        {!welcomeLoading && messages.length === 0 && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '10px',
            padding: '8px 0',
            width: '100%',
          }}>
            {suggestions.map(suggestion => (
              <button
                key={suggestion}
                onClick={() => {
                  setInput(suggestion)
                  setTimeout(() => handleSend(), 50)
                }}
                style={{
                  padding: '12px 24px',
                  fontSize: '15px',
                  fontWeight: '500',
                  color: '#2d6a4f',
                  backgroundColor: '#fff',
                  border: '1.5px solid #d4eddf',
                  borderRadius: '14px',
                  cursor: 'pointer',
                  width: '80%',
                  textAlign: 'center',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                }}
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}

        {/* Conversation messages (sent during this session) */}
        {messages.map(message => (
          <div
            key={message.id}
            style={{
              display: 'flex',
              justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start',
            }}
          >
            <div style={{
              maxWidth: '82%',
              padding: '11px 15px',
              borderRadius: message.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
              backgroundColor: message.role === 'user' ? '#2d6a4f' : '#fff',
              color: message.role === 'user' ? '#fff' : '#1a1a1a',
              fontSize: '15px',
              lineHeight: '1.5',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            }}>
              <span dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }} />
            </div>
          </div>
        ))}

        {(loading || uploading) && (
          <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
            <div style={{
              padding: '11px 15px',
              borderRadius: '18px 18px 18px 4px',
              backgroundColor: '#fff',
              color: '#999',
              fontSize: '15px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            }}>
              {uploading ? 'Reading receipt...' : 'Thinking...'}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Bottom bar */}
      <div style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        borderTop: '1px solid #f0f0f0',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {/* Input row */}
        <div style={{
          padding: '10px 12px 8px',
          display: 'flex',
          gap: '8px',
          alignItems: 'flex-end',
        }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,image/*"
            onChange={handleReceiptUpload}
            style={{ display: 'none' }}
          />

          {/* Camera button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || loading}
            style={{
              width: '42px',
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#f0f7f4',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              flexShrink: 0,
              opacity: uploading || loading ? 0.5 : 1,
            }}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2d6a4f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>

          {/* Text input */}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Ask Pantri anything..."
            rows={1}
            style={{
              flex: 1,
              padding: '10px 14px',
              fontSize: '15px',
              border: '1px solid #e0e0e0',
              borderRadius: '12px',
              outline: 'none',
              resize: 'none',
              fontFamily: 'inherit',
              backgroundColor: '#fafaf8',
            }}
          />

          {/* Send button */}
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              width: '42px',
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#2d6a4f',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              opacity: loading || !input.trim() ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="19" x2="12" y2="5"/>
              <polyline points="5 12 12 5 19 12"/>
            </svg>
          </button>
        </div>

        {/* Bottom nav */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '4px 0 10px',
          borderTop: '1px solid #f5f5f5',
        }}>
          {[
            { label: 'My Pantry', action: () => router.push('/pantry'), icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            )},
            { label: 'Planner', action: () => router.push('/planner'), icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            )},
            { label: 'Grocery', action: () => router.push('/grocery'), icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="21" r="1"/>
                <circle cx="20" cy="21" r="1"/>
                <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/>
              </svg>
            )},
          ].map(item => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '3px',
                padding: '6px 20px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {item.icon}
              <span style={{ fontSize: '11px', color: '#666', fontWeight: '500' }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
