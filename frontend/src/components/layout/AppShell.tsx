'use client'

import React, { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { MobileNav } from '@/components/layout/MobileNav'

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/': { title: 'Dashboard', subtitle: 'Protocol overview & AI yield insights' },
  '/markets': { title: 'Markets', subtitle: 'Explore lending & borrowing markets' },
  '/portfolio': { title: 'Portfolio', subtitle: 'Manage your positions' },
  '/agents': { title: 'AI Agents', subtitle: 'ERC-8004 agent marketplace' },
  '/analytics': { title: 'Analytics', subtitle: 'Protocol metrics & data' },
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
      <div
        className="main-content"
        style={{
          marginLeft: sidebarCollapsed ? 'var(--sidebar-collapsed)' : 'var(--sidebar-width)',
        }}
      >
        {children}
      </div>

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
