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
  Search,
} from 'lucide-react'
import { motion } from 'framer-motion'

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
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
          }
        }}
      >
        <motion.div 
          variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}
        >
          <div>
            <h2 className="heading-md" style={{ margin: '0 0 var(--space-2)', fontWeight: 700, letterSpacing: '-0.02em' }}>
              AI Agent Marketplace
            </h2>
            <p className="text-secondary" style={{ margin: 0 }}>
               Discover and stake on top-performing autonomous yield agents
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
             <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
                <input 
                  type="text" 
                  placeholder="Filter agents..." 
                  style={{ padding: '10px 12px 10px 36px', borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', outline: 'none', width: 260 }} 
                />
             </div>
             <button className="btn btn-primary" style={{ borderRadius: 10 }}>Register Agent</button>
          </div>
        </motion.div>

        {/* Summary cards (Staggered) */}
        <div className="grid-stats" style={{ marginBottom: 'var(--space-8)' }}>
          {[
            { label: 'Registered Agents', value: agents.length, icon: Bot, color: 'var(--color-accent)' },
            { label: 'Total Staked', value: '41,700 LINK', icon: Coins, color: 'var(--color-success)' },
            { label: 'Total Inferences', value: '3,409', icon: Zap, color: 'var(--color-primary)' },
            { label: 'Revenue Distributed', value: '$6,920', icon: Trophy, color: 'var(--color-warning)' },
          ].map((stat, i) => (
            <motion.div 
              key={stat.label}
              variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
              className="card-flat" 
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '24px' }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `${stat.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: stat.color,
                }}
              >
                <stat.icon size={22} />
              </div>
              <div>
                <p className="text-label" style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{stat.label}</p>
                <p style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}>{stat.value}</p>
              </div>
            </motion.div>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
            gap: 'var(--space-8)',
          }}
          className="agents-grid"
        >
          {/* Agent Leaderboard */}
          <motion.div 
            variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
            className="card-flat" style={{ padding: 0, overflow: 'hidden' }}
          >
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Trophy size={18} style={{ color: 'var(--color-warning)' }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                  Agent Leaderboard
                </h3>
                <Badge variant="accent" style={{ fontSize: 10, fontWeight: 700 }}>ERC-8004 COMPLIANT</Badge>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-primary)' }}>Full Rankings</button>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Agent Interface</th>
                  <th>Reputation</th>
                  <th>Accuracy</th>
                  <th>Total Claims</th>
                  <th>Staked</th>
                  <th style={{ textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent, i) => (
                  <tr key={agent.name} style={{ cursor: 'pointer' }}>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background:
                            i === 0
                              ? 'var(--color-warning-muted)'
                              : i === 1
                              ? 'var(--color-border)'
                              : 'transparent',
                          fontSize: 13,
                          fontWeight: 710,
                          color:
                            i === 0
                              ? 'var(--color-warning)'
                              : 'var(--color-text-secondary)',
                          border: i < 3 ? '1px solid currentColor' : 'none'
                        }}
                      >
                        {i + 1}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: 'var(--color-surface-raised)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            overflow: 'hidden',
                            border: '1px solid var(--color-border)'
                          }}
                        >
                          <img src="/assets/icons/CUSTOM-ICON-SET.png" alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, margin: '0 0 2px', fontSize: 14 }}>
                            {agent.name}
                          </p>
                          <p className="text-caption" style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
                            {agent.specialty}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 40, height: 4, background: 'var(--color-bg)', borderRadius: 2, overflow: 'hidden' }}>
                           <div style={{ width: `${agent.reputation}%`, height: '100%', background: getReputationColor(agent.reputation) }} />
                        </div>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: getReputationColor(agent.reputation),
                          }}
                        >
                          {agent.reputation}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-primary)' }}>{agent.accuracy}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
                      {agent.totalPredictions.toLocaleString()}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-primary)' }}>
                      {agent.staked}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Badge
                        variant={
                          agent.status === 'active' ? 'success' : 'warning'
                        }
                      >
                        {agent.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          {/* x402 Payment Feed (Premium) */}
          <motion.div 
            variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
            className="card-flat"
            style={{ padding: '32px' }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 32,
              }}
            >
               <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-warning-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-warning)' }}>
                 <Zap size={20} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                x402 Micropayments
              </h3>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {paymentHistory.map((payment, i) => (
                <div
                  key={i}
                  style={{
                    padding: '16px 0',
                    borderBottom:
                      i < paymentHistory.length - 1
                        ? '1px solid var(--color-border)'
                        : 'none',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-primary)', boxShadow: '0 0 8px var(--color-primary)' }} />
                    <div>
                      <p
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          margin: '0 0 4px',
                          color: 'var(--color-text-primary)',
                        }}
                      >
                        {payment.agent}
                      </p>
                      <p className="text-caption" style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
                        {payment.type}
                      </p>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        margin: '0 0 4px',
                        color: 'var(--color-success)',
                      }}
                    >
                      {payment.amount}
                    </p>
                    <p className="text-caption" style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>
                      {payment.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <button
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                gap: 8,
                marginTop: 24,
                padding: '12px',
                fontSize: 13,
                fontWeight: 700,
                color: 'var(--color-primary)',
                background: 'var(--color-primary-muted)',
                borderRadius: 10,
                border: 'none',
                cursor: 'pointer'
              }}
            >
              Real-time Inference Logs <ExternalLink size={14} />
            </button>
          </motion.div>
        </div>
      </motion.div>

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
