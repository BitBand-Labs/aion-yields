'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Bot,
  BarChart3,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/markets', label: 'Markets', icon: TrendingUp },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/agents', label: 'AI Agents', icon: Bot },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname()

  return (
    <aside
      className="sidebar"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        bottom: 0,
        width: collapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
        background: 'var(--color-surface)',
        borderRight: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
        transition: 'width var(--transition-slow)',
        overflow: 'hidden',
      }}
    >
      {/* Logo */}
      <div
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          padding: collapsed ? '0 16px' : '0 24px',
          borderBottom: '1px solid var(--color-border)',
          gap: '12px',
          flexShrink: 0,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 14,
            letterSpacing: '0.05em',
            color: '#fff',
            flexShrink: 0,
          }}
        >
          AI
        </div>
        {!collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span
              style={{
                fontSize: 16,
                fontWeight: 700,
                color: 'var(--color-text-primary)',
                letterSpacing: '-0.01em',
              }}
            >
              AION
            </span>
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                letterSpacing: '0.04em',
                textTransform: 'uppercase',
              }}
            >
              Yield Protocol
            </span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav
        style={{
          flex: 1,
          padding: '12px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: '2px',
        }}
      >
        {navItems.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: collapsed ? '12px 16px' : '10px 16px',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: isActive ? 500 : 400,
                color: isActive
                  ? 'var(--color-text-primary)'
                  : 'var(--color-text-secondary)',
                background: isActive
                  ? 'var(--color-primary-muted)'
                  : 'transparent',
                transition: 'all var(--transition-fast)',
                position: 'relative',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'var(--color-surface-raised)'
                  e.currentTarget.style.color = 'var(--color-text-primary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.background = 'transparent'
                  e.currentTarget.style.color = 'var(--color-text-secondary)'
                }
              }}
            >
              {isActive && (
                <div
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: 3,
                    height: 20,
                    borderRadius: '0 4px 4px 0',
                    background: 'var(--color-primary)',
                  }}
                />
              )}
              <Icon
                size={20}
                style={{
                  flexShrink: 0,
                  color: isActive ? 'var(--color-primary-light)' : 'inherit',
                }}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse Toggle */}
      <div
        style={{
          padding: '12px 8px',
          borderTop: '1px solid var(--color-border)',
        }}
      >
        <button
          onClick={onToggle}
          className="btn-ghost"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '12px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            border: 'none',
            cursor: 'pointer',
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
            background: 'transparent',
            fontFamily: 'var(--font-sans)',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-surface-raised)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
          }}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          {!collapsed && <span>Collapse</span>}
        </button>
      </div>
    </aside>
  )
}
