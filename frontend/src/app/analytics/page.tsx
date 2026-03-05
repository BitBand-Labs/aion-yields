'use client'

import React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import {
  TrendingUp,
  BarChart3,
  Activity,
  Globe,
  ArrowRight,
  CheckCircle,
  Clock,
  AlertTriangle,
} from 'lucide-react'

const tvlHistory = [
  { date: 'Jan', value: 8.2 },
  { date: 'Feb', value: 12.5 },
  { date: 'Mar', value: 15.1 },
  { date: 'Apr', value: 18.7 },
  { date: 'May', value: 22.3 },
  { date: 'Jun', value: 24.8 },
]

const ccipTransfers = [
  {
    from: 'Base',
    to: 'Ethereum',
    amount: '$120K',
    status: 'completed' as const,
    time: '10 min ago',
  },
  {
    from: 'Ethereum',
    to: 'Base',
    amount: '$85K',
    status: 'completed' as const,
    time: '25 min ago',
  },
  {
    from: 'Base',
    to: 'Arbitrum',
    amount: '$45K',
    status: 'pending' as const,
    time: '3 min ago',
  },
  {
    from: 'Optimism',
    to: 'Base',
    amount: '$200K',
    status: 'completed' as const,
    time: '1h ago',
  },
]

const protocolMetrics = [
  { label: 'Protocol Revenue (24h)', value: '$6,842', change: '+14.2%' },
  { label: 'Liquidations (24h)', value: '3', change: '-40%' },
  { label: 'CRE Executions (24h)', value: '127', change: '+8.3%' },
  { label: 'Avg Supply Rate', value: '3.41%', change: '+0.15%' },
  { label: 'Avg Borrow Rate', value: '4.96%', change: '+0.22%' },
  { label: 'Active Borrowers', value: '312', change: '+18' },
]

const maxTVL = Math.max(...tvlHistory.map((d) => d.value))

export default function AnalyticsPage() {
  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* TVL Chart */}
        <div className="card-glow" style={{ marginBottom: 'var(--space-4)' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 24,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                  Total Value Locked
                </h3>
                <Badge variant="success" dot>
                  Live
                </Badge>
              </div>
              <p
                style={{
                  fontSize: 32,
                  fontWeight: 700,
                  margin: '8px 0 0',
                  letterSpacing: '-0.02em',
                }}
              >
                $24.8M
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                color: 'var(--color-success)',
                fontSize: 14,
                fontWeight: 500,
              }}
            >
              <TrendingUp size={16} />
              +202% YTD
            </div>
          </div>

          {/* Simple bar chart */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 8,
              height: 160,
              padding: '0 4px',
            }}
          >
            {tvlHistory.map((data, i) => (
              <div
                key={data.date}
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 500,
                    color: 'var(--color-text-secondary)',
                  }}
                >
                  ${data.value}M
                </span>
                <div
                  style={{
                    width: '100%',
                    height: `${(data.value / maxTVL) * 120}px`,
                    background:
                      i === tvlHistory.length - 1
                        ? 'linear-gradient(180deg, var(--color-primary), var(--color-secondary))'
                        : 'var(--color-surface-raised)',
                    borderRadius: '6px 6px 0 0',
                    transition: 'height 0.5s ease-out',
                    minHeight: 8,
                  }}
                />
                <span className="text-caption" style={{ fontSize: 11 }}>
                  {data.date}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Two-column: Protocol Metrics + CCIP */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-4)',
          }}
          className="analytics-grid"
        >
          {/* Protocol Metrics */}
          <div className="card-flat">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 20,
              }}
            >
              <BarChart3 size={16} style={{ color: 'var(--color-primary-light)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                Protocol Metrics (24h)
              </h3>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              {protocolMetrics.map((metric) => (
                <div
                  key={metric.label}
                  style={{
                    padding: '14px 16px',
                    background: 'var(--color-bg)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <p className="text-caption" style={{ margin: '0 0 6px', fontSize: 11 }}>
                    {metric.label}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 18, fontWeight: 600 }}>
                      {metric.value}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: metric.change.startsWith('+')
                          ? 'var(--color-success)'
                          : metric.change.startsWith('-')
                          ? 'var(--color-error)'
                          : 'var(--color-text-secondary)',
                      }}
                    >
                      {metric.change}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* CCIP Cross-Chain Activity */}
          <div className="card-flat">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 20,
              }}
            >
              <Globe size={16} style={{ color: 'var(--color-accent)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                Cross-Chain Activity (CCIP)
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {ccipTransfers.map((transfer, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 0',
                    borderBottom:
                      i < ccipTransfers.length - 1
                        ? '1px solid var(--color-border)'
                        : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <Badge variant="primary">{transfer.from}</Badge>
                    <ArrowRight size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    <Badge variant="primary">{transfer.to}</Badge>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 14,
                        fontWeight: 600,
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {transfer.amount}
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {transfer.status === 'completed' ? (
                        <CheckCircle
                          size={14}
                          style={{ color: 'var(--color-success)' }}
                        />
                      ) : transfer.status === 'pending' ? (
                        <Clock
                          size={14}
                          style={{ color: 'var(--color-warning)' }}
                        />
                      ) : (
                        <AlertTriangle
                          size={14}
                          style={{ color: 'var(--color-error)' }}
                        />
                      )}
                      <span
                        className="text-caption"
                        style={{ fontSize: 11 }}
                      >
                        {transfer.time}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Chain Summary */}
            <div
              style={{
                marginTop: 20,
                padding: '14px 16px',
                background: 'var(--color-bg)',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                display: 'flex',
                justifyContent: 'space-between',
              }}
            >
              <div>
                <p className="text-caption" style={{ margin: '0 0 4px', fontSize: 11 }}>
                  Cross-chain Volume (7d)
                </p>
                <span style={{ fontSize: 18, fontWeight: 600 }}>$2.4M</span>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p className="text-caption" style={{ margin: '0 0 4px', fontSize: 11 }}>
                  Active Bridges
                </p>
                <span style={{ fontSize: 18, fontWeight: 600 }}>4</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .analytics-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
