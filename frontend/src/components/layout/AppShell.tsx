'use client'

import React, { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { motion, AnimatePresence } from 'framer-motion'
const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Welcome', subtitle: 'AION Yield Protocol' },
  '/dashboard': { title: 'Dashboard', subtitle: 'Protocol overview & real-time analytics' },
  '/markets': { title: 'Markets', subtitle: 'Explore lending & borrowing markets' },
  '/borrow': { title: 'Borrowing', subtitle: 'Manage your borrowing positions' },
  '/ai-yield': { title: 'AI Yield', subtitle: 'AI-driven allocation & risk forecasting' },
  '/agents': { title: 'AI Marketplace', subtitle: 'ERC-8004 agent reputation & HTTP 402 inferences' },
  '/analytics': { title: 'Analytics', subtitle: 'Protocol metrics & data flows' },
  '/settings': { title: 'Settings', subtitle: 'User preferences & configuration' },
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const pathname = usePathname()
  const pageInfo = pageTitles[pathname] || pageTitles['/']

  return (
    <div className="app-shell" style={{ background: 'var(--color-bg)', minHeight: '100vh', color: 'var(--color-text-primary)' }}>
      {/* Desktop sidebar */}
      <div className="desktop-sidebar">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Header */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          left: sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
          zIndex: 30,
          transition: 'all var(--transition-slow)',
        }}
        className="header-wrapper"
      >
        <Header title={pageInfo.title} subtitle={pageInfo.subtitle} />
      </div>

      {/* Main content wrapper */}
      <main
        style={{
          marginLeft: sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
          paddingTop: 'var(--header-height)',
          transition: 'margin var(--transition-slow)',
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column'
        }}
        className="main-content"
      >
        <div style={{ flex: 1, padding: 'var(--space-2)', position: 'relative' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(4px)' }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ height: '100%' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      {/* Mobile bottom nav */}
      <MobileNav />

      <style jsx global>{`
        @media (max-width: 1024px) {
          .desktop-sidebar {
            display: none !important;
          }
          .header-wrapper {
            left: 0 !important;
          }
          .main-content {
            margin-left: 0 !important;
          }
        }
      `}</style>
    </div>
  )
}
