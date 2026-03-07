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
    <div className="app-shell" style={{ background: 'var(--color-bg)', minHeight: '100vh', color: 'var(--color-text-primary)', position: 'relative', overflow: 'hidden' }}>
      {/* Global Background Assets */}
      <div style={{ position: 'fixed', top: '10%', left: '-5%', width: '50vw', height: '50vw', opacity: 0.03, filter: 'blur(12px)', pointerEvents: 'none', zIndex: 0 }}>
        <img src="/assets/illustrations/HERO-ILLUSTRATION.png" alt="" style={{ width: '100%', height: 'auto' }} />
      </div>
      <div style={{ position: 'fixed', bottom: '5%', right: '-5%', width: '45vw', height: '45vw', opacity: 0.03, filter: 'blur(10px)', pointerEvents: 'none', zIndex: 0 }}>
        <img src="/assets/illustrations/CROSS-CHAIN.png" alt="" style={{ width: '100%', height: 'auto' }} />
      </div>
      {/* Desktop sidebar */}
      <div 
        className="desktop-sidebar"
        style={{
          position: 'fixed',
          top: '16px',
          left: '16px',
          bottom: '16px',
          zIndex: 40,
          transition: 'all var(--transition-slow)',
        }}
      >
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      </div>

      {/* Header */}
      <div
        style={{
          position: 'fixed',
          top: '16px',
          right: '16px',
          left: sidebarCollapsed 
            ? 'calc(var(--sidebar-collapsed) + 32px)' 
            : 'calc(var(--sidebar-width) + 32px)',
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
          marginLeft: sidebarCollapsed 
            ? 'calc(var(--sidebar-collapsed) + 16px)' 
            : 'calc(var(--sidebar-width) + 16px)',
          paddingTop: 'calc(var(--header-height) + 32px)',
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
