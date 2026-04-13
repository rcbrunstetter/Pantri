'use client'

import { useState, useEffect } from 'react'

const FOOD_EMOJIS = ['🥦', '🍋', '🧄', '🫐', '🥕', '🍅', '🧅', '🥑', '🫚', '🥚', '🧀', '🍞']

const LOADING_TEXTS = [
  'Checking your pantry',
  'Stocking the shelves',
  'Warming up the kitchen',
  'Gathering ingredients',
  'Setting the table',
  'Preheating the oven',
]

const particles = FOOD_EMOJIS.map((emoji, i) => ({
  emoji,
  left: `${8 + (i * 7.5) % 85}%`,
  top: `${10 + (i * 11.3) % 75}%`,
  delay: `${(i * 0.37) % 2}s`,
  duration: `${3 + (i * 0.41) % 2}s`,
}))

export default function LoadingScreen() {
  const [textIndex, setTextIndex] = useState(0)
  const [dots, setDots] = useState('')

  useEffect(() => {
    const dotsTimer = setInterval(() => {
      setDots(prev => prev.length >= 3 ? '' : prev + '.')
    }, 400)
    const textTimer = setInterval(() => {
      setTextIndex(prev => (prev + 1) % LOADING_TEXTS.length)
    }, 2000)
    return () => {
      clearInterval(dotsTimer)
      clearInterval(textTimer)
    }
  }, [])

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: '#fafaf8',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes floatIn {
          0% { opacity: 0; transform: translateY(20px) scale(0.7); }
          30% { opacity: 0.18; transform: translateY(0px) scale(1); }
          70% { opacity: 0.18; transform: translateY(-8px) scale(1); }
          100% { opacity: 0; transform: translateY(-20px) scale(0.7); }
        }
        @keyframes loadingBar {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(400%); }
        }
      `}</style>

      {/* Floating food particles */}
      {particles.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: p.left,
            top: p.top,
            fontSize: '28px',
            filter: 'grayscale(60%) sepia(30%) hue-rotate(100deg)',
            animation: `floatIn ${p.duration} ${p.delay} infinite ease-in-out`,
            pointerEvents: 'none',
            userSelect: 'none',
          }}
        >
          {p.emoji}
        </div>
      ))}

      {/* Logo */}
      <span style={{
        fontSize: '48px',
        fontWeight: '800',
        color: '#2d6a4f',
        letterSpacing: '-2px',
        fontFamily: 'Georgia, "Times New Roman", serif',
        marginBottom: '32px',
      }}>Pantri</span>

      {/* Loading bar */}
      <div style={{
        width: '48px',
        height: '3px',
        backgroundColor: '#e8f5ee',
        borderRadius: '2px',
        overflow: 'hidden',
        marginBottom: '20px',
      }}>
        <div style={{
          width: '20px',
          height: '100%',
          backgroundColor: '#2d6a4f',
          borderRadius: '2px',
          animation: 'loadingBar 1.2s ease-in-out infinite',
        }} />
      </div>

      {/* Cycling text */}
      <p style={{
        fontSize: '14px',
        color: '#999',
        margin: 0,
        fontWeight: '500',
        letterSpacing: '0.01em',
        minWidth: '220px',
        textAlign: 'center',
      }}>
        {LOADING_TEXTS[textIndex]}{dots}
      </p>
    </div>
  )
}
