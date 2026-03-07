'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  TrendingUp,
  Wallet,
  Bot,
  Cpu,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/markets', label: 'Markets', icon: TrendingUp },
  { href: '/borrow', label: 'Borrowing', icon: Wallet },
  { href: '/ai-yield', label: 'AI Yield', icon: Cpu },
  { href: '/agents', label: 'AI Marketplace', icon: Bot },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/settings', label: 'Settings', icon: Settings },
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
        background: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: '24px',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 40,
        transition: 'width var(--transition-slow), left var(--transition-slow)',
        overflow: 'hidden',
      }}
    >
      {/* Search / Status Area (Premium) */}
      <Link
        href="/"
        style={{
          height: 'var(--header-height)',
          display: 'flex',
          alignItems: 'center',
          padding: '0 var(--space-2)',
          gap: '12px',
          flexShrink: 0,
          textDecoration: 'none',
          color: 'inherit'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: collapsed ? '100%' : 'auto' }}>
          <img 
            src="/assets/logo/AIONYIELD-logo-nobg.png" 
            alt="AION Yield" 
            style={{ 
              height: 42, 
              width: 'auto',
              filter: collapsed ? 'brightness(1.2)' : 'none',
              transition: 'height var(--transition-slow)'
            }} 
          />
        </div>
        {!collapsed && (
          <span style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-0.02em', display: 'none' }}>
            AION <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 400 }}>Yield</span>
          </span>
        )}
      </Link>

      {/* Navigation */}
      <nav
        style={{
          flex: 1,
          padding: 'var(--space-2) var(--space-1)',
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
        }}
      >
        {navItems.map((item, i) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Link
                href={item.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: 13,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive
                    ? 'var(--color-text-primary)'
                    : 'var(--color-text-secondary)',
                  background: isActive
                    ? 'var(--color-bg-elevated)'
                    : 'transparent',
                  border: isActive 
                    ? '1px solid var(--color-border)' 
                    : '1px solid transparent',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'var(--color-bg-elevated)'
                    e.currentTarget.style.borderColor = 'var(--color-border)'
                    e.currentTarget.style.color = 'var(--color-text-primary)'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.borderColor = 'transparent'
                    e.currentTarget.style.color = 'var(--color-text-secondary)'
                  }
                }}
              >
                <Icon
                  size={16}
                  strokeWidth={isActive ? 2.5 : 2}
                  style={{
                    flexShrink: 0,
                    color: isActive ? 'var(--color-primary)' : 'inherit',
                  }}
                />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            </motion.div>
          )
        })}
      </nav>

      {/* Footer / Toggle */}
      <div
        style={{
          padding: 'var(--space-2)',
        }}
      >
        <button
          onClick={onToggle}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: collapsed ? 'center' : 'flex-start',
            gap: '12px',
            padding: '8px 12px',
            borderRadius: '8px',
            border: '1px solid transparent',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            color: 'var(--color-text-tertiary)',
            background: 'transparent',
            transition: 'all 0.2s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-bg-elevated)'
            e.currentTarget.style.borderColor = 'var(--color-border)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.borderColor = 'transparent'
          }}
        >
          {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          {!collapsed && <span>Collapse Sidebar</span>}
        </button>
      </div>
    </aside>
  )
}
