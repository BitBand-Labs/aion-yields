'use client'

import React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import {
  DollarSign,
  TrendingUp,
  Users,
  Zap,
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Bot,
  Shield,
} from 'lucide-react'

const recentActivity = [
  { type: 'deposit', asset: 'USDC', amount: '5,000', time: '2 min ago', user: '0x1a2b...3c4d' },
  { type: 'borrow', asset: 'ETH', amount: '1.5', time: '5 min ago', user: '0x5e6f...7a8b' },
  { type: 'repay', asset: 'USDC', amount: '2,300', time: '12 min ago', user: '0x9c0d...1e2f' },
  { type: 'liquidation', asset: 'WBTC', amount: '0.15', time: '18 min ago', user: '0x3a4b...5c6d' },
  { type: 'deposit', asset: 'ETH', amount: '3.2', time: '25 min ago', user: '0x7e8f...9a0b' },
  { type: 'borrow', asset: 'USDC', amount: '10,000', time: '32 min ago', user: '0x1c2d...3e4f' },
]

const aiInsights = [
  { label: 'Optimal Strategy', value: 'Supply USDC → Borrow ETH', confidence: 92 },
  { label: 'Predicted APY Boost', value: '+2.4% vs static', confidence: 87 },
  { label: 'Liquidation Risk', value: 'Low (next 24h)', confidence: 95 },
]

const typeIconMap: Record<string, React.ReactNode> = {
  deposit: <ArrowDownLeft size={14} />,
  borrow: <ArrowUpRight size={14} />,
  repay: <RefreshCw size={14} />,
  liquidation: <Zap size={14} />,
}

const typeBadgeMap: Record<string, 'success' | 'primary' | 'warning' | 'error'> = {
  deposit: 'success',
  borrow: 'primary',
  repay: 'warning',
  liquidation: 'error',
}

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Stats row */}
        <div className="grid-stats" style={{ marginBottom: 'var(--space-6)' }}>
          <StatCard
            label="Total Value Locked"
            value="$24.8M"
            change="+12.4% this week"
            changeType="positive"
            icon={<DollarSign size={40} />}
          />
          <StatCard
            label="Total Borrowed"
            value="$14.2M"
            change="+8.7% this week"
            changeType="positive"
            icon={<TrendingUp size={40} />}
          />
          <StatCard
            label="Active Users"
            value="1,247"
            change="+23 today"
            changeType="positive"
            icon={<Users size={40} />}
          />
          <StatCard
            label="Protocol Revenue"
            value="$48.2K"
            change="+5.1% this week"
            changeType="positive"
            icon={<Zap size={40} />}
          />
        </div>

        {/* Two-column layout */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 'var(--space-4)',
          }}
          className="dashboard-grid"
        >
          {/* AI Yield Insights */}
          <div className="card-glow">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--color-accent-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--color-accent)',
                }}
              >
                <Bot size={18} />
              </div>
              <div>
                <h3
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    margin: 0,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  AI Yield Insights
                </h3>
                <p
                  style={{
                    fontSize: 12,
                    color: 'var(--color-text-tertiary)',
                    margin: 0,
                  }}
                >
                  Powered by Chainlink CRE
                </p>
              </div>
              <Badge variant="accent" dot>
                Live
              </Badge>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              {aiInsights.map((insight, i) => (
                <div
                  key={i}
                  style={{
                    padding: '14px 16px',
                    background: 'var(--color-bg)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <p
                      className="text-caption"
                      style={{ margin: '0 0 4px' }}
                    >
                      {insight.label}
                    </p>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 500,
                        color: 'var(--color-text-primary)',
                        margin: 0,
                      }}
                    >
                      {insight.value}
                    </p>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Shield size={12} style={{ color: 'var(--color-success)' }} />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--color-success)',
                      }}
                    >
                      {insight.confidence}%
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary"
              style={{
                width: '100%',
                marginTop: 16,
              }}
            >
              <Bot size={16} />
              View Full AI Analysis
            </button>
          </div>

          {/* Recent Activity */}
          <div className="card-flat">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 16,
              }}
            >
              <h3
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--color-text-primary)',
                }}
              >
                Recent Activity
              </h3>
              <span className="text-caption" style={{ cursor: 'pointer' }}>
                View all →
              </span>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0,
              }}
            >
              {recentActivity.map((activity, i) => (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 0',
                    borderBottom:
                      i < recentActivity.length - 1
                        ? '1px solid var(--color-border)'
                        : 'none',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 'var(--radius-sm)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      className={`badge-${typeBadgeMap[activity.type]}`}
                    >
                      {typeIconMap[activity.type]}
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: 13,
                          fontWeight: 500,
                          margin: 0,
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {activity.type.charAt(0).toUpperCase() + activity.type.slice(1)}{' '}
                        <span style={{ color: 'var(--color-text-secondary)' }}>
                          {activity.amount} {activity.asset}
                        </span>
                      </p>
                      <p className="text-caption" style={{ margin: 0, fontSize: 11 }}>
                        {activity.user}
                      </p>
                    </div>
                  </div>
                  <span className="text-caption">{activity.time}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-4)',
            marginTop: 'var(--space-6)',
          }}
          className="quick-actions-grid"
        >
          <div
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-success-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-success)',
              }}
            >
              <ArrowDownLeft size={20} />
            </div>
            <div>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--color-text-primary)',
                }}
              >
                Deposit
              </p>
              <p className="text-caption" style={{ margin: 0 }}>
                Supply assets to earn yield
              </p>
            </div>
          </div>

          <div
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-primary-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary-light)',
              }}
            >
              <ArrowUpRight size={20} />
            </div>
            <div>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--color-text-primary)',
                }}
              >
                Borrow
              </p>
              <p className="text-caption" style={{ margin: 0 }}>
                Borrow against your collateral
              </p>
            </div>
          </div>

          <div
            className="card"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              cursor: 'pointer',
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-warning-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-warning)',
              }}
            >
              <RefreshCw size={20} />
            </div>
            <div>
              <p
                style={{
                  fontSize: 15,
                  fontWeight: 600,
                  margin: 0,
                  color: 'var(--color-text-primary)',
                }}
              >
                Repay
              </p>
              <p className="text-caption" style={{ margin: 0 }}>
                Repay your outstanding debt
              </p>
            </div>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 768px) {
          .dashboard-grid {
            grid-template-columns: 1fr !important;
          }
          .quick-actions-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
