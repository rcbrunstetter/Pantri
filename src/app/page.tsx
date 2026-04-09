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
        content: "Hi! I'm Pantri. Tell me what's in your kitchen, what you just bought, or what you cooked — and I'll keep track of everything for you. You can also upload a receipt and I'll read it automatically.",
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
        content: "iPhone photos are in HEIC format which I can't read yet. To fix this: go to your iPhone Settings → Camera → Formats → select \"Most Compatible\". Or take a screenshot of the receipt instead!",
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
        const errorMsg = "I couldn't read that receipt clearly. Try a photo with better lighting, or type out what you bought!"
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: errorMsg,
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
        padding: '16px 20px',
        backgroundColor: '#fff',
        borderBottom: '1px solid #f0f0f0',
      }}>
        <h1 style={{
          fontSize: '22px',
          fontWeight: '700',
          color: '#1a1a1a',
          margin: 0,
        }}>Pantri</h1>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => router.push('/pantry')}
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
            My Pantry
          </button>
          <button
            onClick={() => router.push('/planner')}
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
            Planner
          </button>
          <button
            onClick={() => router.push('/settings')}
            style={{
              padding: '8px 12px',
              fontSize: '16px',
              backgroundColor: 'transparent',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            ⚙️
          </button>
          <button
            onClick={handleLogout}
            style={{
              padding: '8px 14px',
              fontSize: '14px',
              fontWeight: '600',
              color: '#666',
              backgroundColor: 'transparent',
              border: '1px solid #e0e0e0',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Log out
          </button>
        </div>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '20px',
        paddingBottom: '160px',
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
              maxWidth: '80%',
              padding: '12px 16px',
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
              padding: '12px 16px',
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

      {/* Bottom bar — input + nav */}
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
          padding: '12px 16px 8px',
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
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Tell Pantri what you bought, cooked, or have..."
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
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            style={{
              padding: '10px 18px',
              fontSize: '15px',
              fontWeight: '600',
              color: '#fff',
              backgroundColor: '#2d6a4f',
              border: 'none',
              borderRadius: '12px',
              cursor: 'pointer',
              opacity: loading || !input.trim() ? 0.5 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            Send
          </button>
        </div>

        {/* Bottom nav */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          padding: '4px 0 12px',
          borderTop: '1px solid #f5f5f5',
        }}>
          {[
            { icon: '📷', label: 'Receipt', action: () => fileInputRef.current?.click() },
            { icon: '🍽️', label: 'Meal Ideas', action: () => {
              setInput("What meals can I make with what I have in my pantry right now? Give me 3 suggestions with a brief description of each.")
            }},
            { icon: '🛒', label: 'Grocery', action: () => router.push('/grocery') },
            { icon: '📖', label: 'Recipes', action: () => router.push('/recipes') },
          ].map(item => (
            <button
              key={item.label}
              onClick={item.action}
              disabled={uploading || loading}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                padding: '6px 12px',
                backgroundColor: 'transparent',
                border: 'none',
                cursor: 'pointer',
                opacity: uploading || loading ? 0.5 : 1,
              }}
            >
              <span style={{ fontSize: '22px' }}>{item.icon}</span>
              <span style={{ fontSize: '11px', color: '#999', fontWeight: '500' }}>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
