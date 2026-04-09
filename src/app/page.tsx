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
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        router.push('/login')
      } else {
        setUser(user)
        loadMessages(user.id)
      }
    })
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadMessages(userId: string) {
    const { data } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(50)

    if (data && data.length > 0) {
      setMessages(data.map(m => ({
        id: m.id,
        role: m.role,
        content: m.content,
      })))
    } else {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: "Hi! I'm Pantri. Tell me what's in your kitchen, what you just bought, or what you cooked — and I'll keep track of everything for you. You can also upload a receipt photo and I'll read it automatically.",
      }])
    }
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

      await supabase.from('chat_messages').insert([
        { user_id: user.id, role: 'user', content: userMessage.content },
        { user_id: user.id, role: 'assistant', content: data.reply },
      ])

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

    const unsupported = ['image/heic', 'image/heif']
    if (
      unsupported.includes(file.type.toLowerCase()) ||
      file.name.toLowerCase().endsWith('.heic') ||
      file.name.toLowerCase().endsWith('.heif')
    ) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: "iPhone photos are in HEIC format which I can't read yet. Go to iPhone Settings → Camera → Formats → select \"Most Compatible\". Or take a screenshot of the receipt instead!",
      }])
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploading(true)

    const uploadingMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: '📷 Receipt uploaded — reading it now...',
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

        await supabase.from('chat_messages').insert([
          { user_id: user.id, role: 'user', content: uploadingMessage.content },
          { user_id: user.id, role: 'assistant', content: replyContent },
        ])
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '24px' }}>🧺</span>
          <span style={{
            fontSize: '24px',
            fontWeight: '800',
            color: '#2d6a4f',
            letterSpacing: '-0.5px',
          }}>Pantri</span>
        </div>

        {/* Menu button */}
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

        {/* Dropdown menu */}
        {menuOpen && (
          <>
            <div
              onClick={() => setMenuOpen(false)}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 40,
              }}
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
                { label: '📖 Recipe Book', action: () => { router.push('/recipes'); setMenuOpen(false) } },
                { label: '⚙️ Settings', action: () => { router.push('/settings'); setMenuOpen(false) } },
                { label: '🚪 Log out', action: () => { handleLogout(); setMenuOpen(false) } },
              ].map((item, index, arr) => (
                <button
                  key={item.label}
                  onClick={item.action}
                  style={{
                    width: '100%',
                    padding: '14px 18px',
                    fontSize: '15px',
                    fontWeight: '500',
                    color: item.label.includes('Log out') ? '#cc4444' : '#1a1a1a',
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
        padding: '16px 16px',
        paddingBottom: '140px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      }}>
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
              fontSize: '20px',
              flexShrink: 0,
              opacity: uploading || loading ? 0.5 : 1,
            }}
          >
            📷
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
              fontSize: '18px',
              color: '#fff',
              backgroundColor: '#2d6a4f',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              opacity: loading || !input.trim() ? 0.5 : 1,
              flexShrink: 0,
            }}
          >
            ↑
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
            { icon: '🥦', label: 'My Pantry', action: () => router.push('/pantry') },
            { icon: '📅', label: 'Planner', action: () => router.push('/planner') },
            { icon: '🛒', label: 'Grocery', action: () => router.push('/grocery') },
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
              <span style={{ fontSize: '22px' }}>{item.icon}</span>
              <span style={{ fontSize: '11px', color: '#666', fontWeight: '500' }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
