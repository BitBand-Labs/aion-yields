'use client'

import React from 'react'
import { Bell } from 'lucide-react'

interface HeaderProps {
  title: string
  subtitle?: string
}

export function Header({ title, subtitle }: HeaderProps) {
  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        left: 'var(--sidebar-width)',
        height: 'var(--header-height)',
        background: 'rgba(11, 16, 28, 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 30,
        transition: 'left var(--transition-slow)',
      }}
    >
      {/* Page title */}
      <div>
        <h1
          style={{
            fontSize: 18,
            fontWeight: 600,
            color: 'var(--color-text-primary)',
            letterSpacing: '-0.01em',
            margin: 0,
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p
            style={{
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              margin: 0,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {/* Right actions */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Network badge */}
        <div
          className="badge badge-primary"
          style={{ fontSize: 12, padding: '4px 12px' }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'var(--color-success)',
              display: 'inline-block',
            }}
          />
          Base
        </div>

        {/* Notification bell */}
        <button
          className="btn-ghost btn-icon"
          style={{
            width: 36,
            height: 36,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            cursor: 'pointer',
            position: 'relative',
            background: 'transparent',
            color: 'var(--color-text-secondary)',
          }}
        >
          <Bell size={18} />
          <span
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'var(--color-primary)',
              border: '2px solid var(--color-bg)',
            }}
          />
        </button>

        {/* Wallet connect (Reown AppKit Web Component) */}
        {/* @ts-expect-error -- Web Component from Reown AppKit */}
        <appkit-button size="sm" />
      </div>
    </header>
  )
}
