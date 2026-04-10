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
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [user, setUser] = useState<any>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [suggestions] = useState([
    'What can I make tonight?',
    'Generate my grocery list',
    'What am I running low on?',
    'Plan my meals this week',
  ])
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
        loadWelcome(session.user.id)
        ensureHousehold(session.user.id)
      }
    }
    checkAuth()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadWelcome(userId: string) {
    setWelcomeLoading(true)

    const supabaseServer = createClient()
    const { data: membership } = await supabaseServer
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .single()

    const householdId = membership?.household_id

    let pantryCount = 0
    let pantryContext = 'The pantry is empty.'

    if (householdId) {
      const { data: pantryItems } = await supabaseServer
        .from('pantry_items')
        .select('name, quantity, unit')
        .eq('household_id', householdId)

      pantryCount = pantryItems?.length || 0

      if (pantryItems && pantryItems.length > 0) {
        pantryContext = `Current pantry (${pantryCount} items):\n${pantryItems.map(item =>
          `- ${item.name}${item.quantity ? ` (${item.quantity}${item.unit ? ' ' + item.unit : ''})` : ''}`
        ).join('\n')}`
      }
    }

    await ensureHousehold(userId)

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Generate a short friendly welcome message for the user opening their kitchen app. Include: 1) A warm one-line greeting, 2) A note about how many items are in their pantry (${pantryCount} items), 3) One specific meal idea based on what they have. Keep it to 3 short sentences maximum. No lists, no bullet points, no emojis.`,
        userId,
        history: [],
      }),
    })

    const data = await response.json()
    setWelcomeMessage(data.reply || `You have ${pantryCount} items in your pantry. What would you like to do today?`)
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

      const data = await response.json()

      if (data.success && data.items && data.items.length > 0) {
        const itemList = data.items.map((i: any) => {
          const qty = i.quantity && i.unit
            ? ` (${i.quantity}${i.unit})`
            : i.quantity ? ` (${i.quantity})` : ''
          return `${i.name}${qty}`
        }).join(', ')

        const store = data.store ? ` from ${data.store}` : ''
        const replyContent = `Got it! I found ${data.items.length} items${store} on your receipt and added them to your pantry: ${itemList}.`

        const replyMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: replyContent,
        }

        setMessages(prev => [...prev, replyMessage])
      } else {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: "I couldn't read that receipt clearly. Try a photo with better lighting, or type out what you bought!",
        }])
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Something went wrong uploading the receipt. Please try again.',
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
    const { data: membership } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .single()

    if (!membership) {
      const { data: household } = await supabase
        .from('households')
        .insert({ name: 'My Household' })
        .select()
        .single()

      if (household) {
        await supabase.from('household_members').insert({
          household_id: household.id,
          user_id: userId,
          role: 'owner',
        })
      }
    }
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

        {/* Suggestion chips */}
        {!welcomeLoading && (
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignSelf: 'flex-start',
          }}>
            {suggestions.map(suggestion => (
              <button
                key={suggestion}
                onClick={() => {
                  setInput(suggestion)
                  setTimeout(() => handleSend(), 50)
                }}
                style={{
                  padding: '8px 14px',
                  fontSize: '14px',
                  fontWeight: '500',
                  color: '#2d6a4f',
                  backgroundColor: '#f0f7f4',
                  border: '1px solid #d4eddf',
                  borderRadius: '20px',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
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
            accept="image/*"
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
