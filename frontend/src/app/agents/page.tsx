'use client'

import React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import {
  Bot,
  Shield,
  Trophy,
  Coins,
  Star,
  TrendingUp,
  Zap,
  ExternalLink,
} from 'lucide-react'

const agents = [
  {
    name: 'YieldMax-v3',
    address: '0x1a2b...3c4d',
    reputation: 96,
    accuracy: '94.2%',
    totalPredictions: 1247,
    staked: '15,000 LINK',
    revenue: '$2,340',
    status: 'active' as const,
    specialty: 'Cross-chain yield',
  },
  {
    name: 'RiskGuard-AI',
    address: '0x5e6f...7a8b',
    reputation: 91,
    accuracy: '89.7%',
    totalPredictions: 892,
    staked: '10,500 LINK',
    revenue: '$1,820',
    status: 'active' as const,
    specialty: 'Liquidation prevention',
  },
  {
    name: 'AlphaSeeker',
    address: '0x9c0d...1e2f',
    reputation: 88,
    accuracy: '87.1%',
    totalPredictions: 634,
    staked: '8,200 LINK',
    revenue: '$1,450',
    status: 'active' as const,
    specialty: 'APY optimization',
  },
  {
    name: 'DeepYield-v2',
    address: '0x3a4b...5c6d',
    reputation: 82,
    accuracy: '84.5%',
    totalPredictions: 421,
    staked: '5,000 LINK',
    revenue: '$890',
    status: 'staking' as const,
    specialty: 'Risk modeling',
  },
  {
    name: 'NeuralLend',
    address: '0x7e8f...9a0b',
    reputation: 75,
    accuracy: '79.3%',
    totalPredictions: 215,
    staked: '3,000 LINK',
    revenue: '$420',
    status: 'active' as const,
    specialty: 'Interest rate forecasting',
  },
]

const paymentHistory = [
  { agent: 'YieldMax-v3', amount: '$2.40', type: 'Yield prediction', time: '3 min ago' },
  { agent: 'RiskGuard-AI', amount: '$1.80', type: 'Risk assessment', time: '8 min ago' },
  { agent: 'AlphaSeeker', amount: '$2.10', type: 'APY forecast', time: '15 min ago' },
  { agent: 'YieldMax-v3', amount: '$2.40', type: 'Rebalance signal', time: '22 min ago' },
]

function getReputationColor(score: number): string {
  if (score >= 90) return 'var(--color-success)'
  if (score >= 80) return 'var(--color-primary-light)'
  if (score >= 70) return 'var(--color-warning)'
  return 'var(--color-error)'
}

export default function AgentsPage() {
  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Summary cards */}
        <div className="grid-stats" style={{ marginBottom: 'var(--space-6)' }}>
          <div className="card-flat" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-accent-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-accent)',
              }}
            >
              <Bot size={20} />
            </div>
            <div>
              <p className="text-label" style={{ margin: 0 }}>Registered Agents</p>
              <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 0' }}>{agents.length}</p>
            </div>
          </div>

          <div className="card-flat" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-success-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-success)',
              }}
            >
              <Coins size={20} />
            </div>
            <div>
              <p className="text-label" style={{ margin: 0 }}>Total Staked</p>
              <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 0' }}>41,700 LINK</p>
            </div>
          </div>

          <div className="card-flat" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-primary-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-primary-light)',
              }}
            >
              <Zap size={20} />
            </div>
            <div>
              <p className="text-label" style={{ margin: 0 }}>Total Inferences</p>
              <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 0' }}>3,409</p>
            </div>
          </div>

          <div className="card-flat" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-warning-muted)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--color-warning)',
              }}
            >
              <Trophy size={20} />
            </div>
            <div>
              <p className="text-label" style={{ margin: 0 }}>Revenue Paid (x402)</p>
              <p style={{ fontSize: 22, fontWeight: 700, margin: '4px 0 0' }}>$6,920</p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr',
            gap: 'var(--space-4)',
          }}
          className="agents-grid"
        >
          {/* Agent Leaderboard */}
          <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
            <div
              style={{
                padding: '16px 24px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Trophy size={16} style={{ color: 'var(--color-warning)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                Agent Leaderboard
              </h3>
              <Badge variant="accent" dot>ERC-8004</Badge>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Agent</th>
                  <th>Reputation</th>
                  <th>Accuracy</th>
                  <th>Predictions</th>
                  <th>Staked</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent, i) => (
                  <tr key={agent.name}>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 24,
                          height: 24,
                          borderRadius: 'var(--radius-full)',
                          background:
                            i === 0
                              ? 'var(--color-warning-muted)'
                              : i === 1
                              ? 'var(--color-border)'
                              : 'transparent',
                          fontSize: 12,
                          fontWeight: 600,
                          color:
                            i === 0
                              ? 'var(--color-warning)'
                              : 'var(--color-text-secondary)',
                        }}
                      >
                        {i + 1}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 'var(--radius-md)',
                            background: 'var(--color-accent-muted)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-accent)',
                          }}
                        >
                          <Bot size={14} />
                        </div>
                        <div>
                          <p style={{ fontWeight: 500, margin: 0, fontSize: 13 }}>
                            {agent.name}
                          </p>
                          <p className="text-caption" style={{ margin: 0, fontSize: 11 }}>
                            {agent.specialty}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Star
                          size={12}
                          fill={getReputationColor(agent.reputation)}
                          style={{ color: getReputationColor(agent.reputation) }}
                        />
                        <span
                          style={{
                            fontWeight: 600,
                            color: getReputationColor(agent.reputation),
                          }}
                        >
                          {agent.reputation}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 500 }}>{agent.accuracy}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {agent.totalPredictions.toLocaleString()}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                      {agent.staked}
                    </td>
                    <td>
                      <Badge
                        variant={
                          agent.status === 'active' ? 'success' : 'warning'
                        }
                        dot
                      >
                        {agent.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* x402 Payment Feed */}
          <div className="card-flat">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 16,
              }}
            >
              <Zap size={16} style={{ color: 'var(--color-warning)' }} />
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                x402 Payments
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {paymentHistory.map((payment, i) => (
                <div
                  key={i}
                  style={{
                    padding: '12px 0',
                    borderBottom:
                      i < paymentHistory.length - 1
                        ? '1px solid var(--color-border)'
                        : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 500,
                        margin: '0 0 2px',
                        color: 'var(--color-text-primary)',
                      }}
                    >
                      {payment.agent}
                    </p>
                    <p className="text-caption" style={{ margin: 0, fontSize: 11 }}>
                      {payment.type}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        margin: '0 0 2px',
                        color: 'var(--color-success)',
                      }}
                    >
                      {payment.amount}
                    </p>
                    <p className="text-caption" style={{ margin: 0, fontSize: 11 }}>
                      {payment.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <a
              href="#"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 4,
                marginTop: 16,
                fontSize: 13,
                color: 'var(--color-primary-light)',
                textDecoration: 'none',
              }}
            >
              View all payments <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .agents-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
