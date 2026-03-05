'use client'

import React, { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'
import { motion, AnimatePresence } from 'framer-motion'
const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Protocol overview & real-time analytics' },
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
    <div className="app-shell">
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
          transition: 'left var(--transition-slow)',
        }}
        className="header-wrapper"
      >
        <Header title={pageInfo.title} subtitle={pageInfo.subtitle} />
      </div>

      {/* Main content */}
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="main-content"
        style={{
          marginLeft: sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
        }}
      >
        {children}
      </motion.div>

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
