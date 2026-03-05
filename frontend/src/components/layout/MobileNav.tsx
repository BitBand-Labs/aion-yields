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
} from 'lucide-react'

const navItems = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/markets', label: 'Markets', icon: TrendingUp },
  { href: '/portfolio', label: 'Portfolio', icon: Wallet },
  { href: '/agents', label: 'AI', icon: Bot },
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
]

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: 72,
        background: 'rgba(19, 26, 42, 0.95)',
        backdropFilter: 'blur(12px)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '0 8px',
        paddingBottom: 'env(safe-area-inset-bottom, 0)',
        zIndex: 50,
      }}
      className="mobile-nav"
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
              flexDirection: 'column',
              alignItems: 'center',
              gap: '4px',
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              textDecoration: 'none',
              fontSize: 11,
              fontWeight: isActive ? 500 : 400,
              color: isActive
                ? 'var(--color-primary-light)'
                : 'var(--color-text-tertiary)',
              transition: 'all var(--transition-fast)',
            }}
          >
            <Icon
              size={20}
              style={{
                color: isActive
                  ? 'var(--color-primary-light)'
                  : 'var(--color-text-tertiary)',
              }}
            />
            <span>{item.label}</span>
            {isActive && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 0,
                  width: 20,
                  height: 2,
                  borderRadius: '2px 2px 0 0',
                  background: 'var(--color-primary)',
                }}
              />
            )}
          </Link>
        )
      })}

      <style jsx global>{`
        @media (min-width: 1025px) {
          .mobile-nav {
            display: none !important;
          }
        }
      `}</style>
    </nav>
  )
}
