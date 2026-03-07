'use client'

import React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { HealthGauge } from '@/components/ui/HealthGauge'
import {
  Wallet,
  Bot,
  TrendingDown,
  Percent,
  Activity,
  ArrowUpRight,
  ArrowDownLeft,
  ChevronRight,
} from 'lucide-react'
import { motion } from 'framer-motion'

const positions = [
  {
    asset: 'USDC',
    icon: '🔵',
    deposited: '$10,000.00',
    borrowed: '$0.00',
    interestRate: '4.50%',
    healthFactor: '—',
  },
  {
    asset: 'ETH',
    icon: '⟠',
    deposited: '$2,450.00',
    borrowed: '$4,200.00',
    interestRate: '-2.10%',
    healthFactor: '2.10',
  },
]

import { MagicCard } from '@/components/ui/MagicCard'
import { DataFlow } from '@/components/ui/DataFlow'

export default function DashboardPage() {
  return (
    <AppShell>
      {/* Dashboard Branding Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ 
          marginBottom: 'var(--space-4)', 
          padding: 'var(--space-2)',
          display: 'flex', 
          flexDirection: 'column', 
          gap: 8 
        }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.04em' }}>
          Protocol overview & real-time analytics
        </h1>
      </motion.div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gridAutoRows: 'minmax(120px, auto)',
          gap: 'var(--space-2)',
          paddingBottom: 'var(--space-4)',
        }}
      >
        {/* Row 1: Quick Stats + Highlight */}
        <div style={{ gridColumn: 'span 1' }}>
          <StatCard label="Protocol TVL" value="$42.8M" icon={<Activity />} />
        </div>

        <MagicCard
          style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          gradientColor="rgba(16, 185, 129, 0.05)"
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <motion.span 
                animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }} 
                transition={{ duration: 2, repeat: Infinity }}
                style={{ width: 8, height: 8, background: 'var(--color-success)', borderRadius: '50%' }} 
              />
              AI-Orchestrated Net APY
            </div>
            <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--color-text-primary)', lineHeight: 1 }}>
              12.45<span style={{ fontSize: 24, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>%</span>
            </div>
          </div>
        </MagicCard>

        <div style={{ gridColumn: 'span 1' }}>
          <StatCard label="My Balance" value="$24.5k" icon={<Wallet />} change="+2.4%" changeType="positive" />
        </div>

        {/* Row 2: Main Positions + Risk */}
        <MagicCard style={{ gridColumn: 'span 3', gridRow: 'span 2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <h3 className="heading-sm" style={{ margin: 0, fontSize: 16 }}>Your Positions</h3>
            <button style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}>View All Markets</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Balance</th>
                  <th>Yield / APR</th>
                  <th>Risk Level</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {positions.map((pos, i) => (
                  <tr key={i}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, fontSize: 13 }}>
                        <span style={{ fontSize: 16 }}>{pos.icon}</span>
                        {pos.asset}
                      </div>
                    </td>
                    <td style={{ fontSize: 13, fontWeight: 500 }}>{pos.deposited}</td>
                    <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)' }}>{pos.interestRate}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 40, height: 4, background: 'var(--color-border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: pos.asset === 'USDC' ? '20%' : '60%', height: '100%', background: pos.asset === 'USDC' ? 'var(--color-success)' : 'var(--color-warning)' }} />
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                          {pos.asset === 'USDC' ? 'Low' : 'Med'}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--color-bg)', border: '1px solid var(--color-border)', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Manage</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </MagicCard>

        <MagicCard style={{ gridColumn: 'span 1', gridRow: 'span 2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <HealthGauge value={2.1} size={160} />
          <div style={{ marginTop: 24, padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.02)', border: '1px solid var(--color-border)', width: '100%' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>AI Risk Guardian</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>Liquidation probability <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>0.01%</span> over next 24h.</div>
          </div>
        </MagicCard>

        {/* Row 3: Live Flows */}
        <div style={{ gridColumn: 'span 3' }}>
          <DataFlow />
        </div>

        <MagicCard style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Top Performer</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={16} color="var(--color-accent)" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Sigma-7</div>
              <div style={{ fontSize: 11, color: 'var(--color-success)' }}>+18.4% APY</div>
            </div>
          </div>
        </MagicCard>
      </div>

      <style jsx global>{`
        @media (max-width: 1200px) {
          .app-shell > div > div {
            grid-template-columns: repeat(2, 1fr) !important;
          }
          div[style*="span 3"], div[style*="span 2"] {
            grid-column: span 2 !important;
          }
        }
        @media (max-width: 768px) {
          .app-shell > div > div {
            grid-template-columns: 1fr !important;
          }
          div[style*="span 3"], div[style*="span 2"], div[style*="span 1"] {
            grid-column: span 1 !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
