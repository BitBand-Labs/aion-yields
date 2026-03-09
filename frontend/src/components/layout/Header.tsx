'use client'

import React from 'react'
import { Bell, Sun, Moon } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 var(--space-2)',
        height: 'var(--header-height)',
        background: 'var(--color-bg)',
        border: theme === 'light' ? '1px solid rgba(14, 167, 203, 0.2)' : '1px solid var(--color-border)',
        borderRadius: '24px',
        zIndex: 30,
      }}
    >
      {/* Left section: Empty or Spacer */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Network indicator */}
        <div
          style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            padding: '4px 10px', 
            borderRadius: 6, 
            background: 'var(--color-bg-elevated)', 
            border: '1px solid var(--color-border)',
            fontSize: 11, 
            fontWeight: 600,
            color: 'var(--color-text-secondary)'
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#10b981',
              display: 'inline-block',
              boxShadow: '0 0 12px #10b981'
            }}
          />
        </div>

        {/* Action icons spacer */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '0 4px' }}>
          {/* Notification bell */}
          <button
            style={{
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              border: '1px solid transparent',
              cursor: 'pointer',
              background: 'transparent',
              color: 'var(--color-text-tertiary)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--color-bg-elevated)'
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.color = 'var(--color-text-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent'
              e.currentTarget.style.borderColor = 'transparent'
              e.currentTarget.style.color = 'var(--color-text-tertiary)'
            }}
          >
            <Bell size={14} />
          </button>

          {/* Theme toggle */}
          {mounted && (
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              style={{
                width: 32,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                border: '1px solid transparent',
                cursor: 'pointer',
                background: 'transparent',
                color: 'var(--color-text-tertiary)',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--color-bg-elevated)'
                e.currentTarget.style.borderColor = 'var(--color-border)'
                e.currentTarget.style.color = 'var(--color-text-primary)'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent'
                e.currentTarget.style.borderColor = 'transparent'
                e.currentTarget.style.color = 'var(--color-text-tertiary)'
              }}
            >
              {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          )}
        </div>

        {/* Network + Wallet connect */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, transform: 'scale(0.9)', transformOrigin: 'right' }}>
          <appkit-network-button />
          <appkit-button size="sm" />
        </div>
      </div>
    </header>
  )
}
