'use client'

import React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { HealthGauge } from '@/components/ui/HealthGauge'
import {
  Wallet,
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

export default function DashboardPage() {
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
        {/* Welcome Hero Section (Asymmetrical) */}
        <motion.div 
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          style={{
            position: 'relative',
            padding: '32px 40px',
            borderRadius: 'var(--radius-lg)',
            background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-light))',
            color: '#fff',
            marginBottom: 'var(--space-8)',
            overflow: 'hidden',
          }}
        >
          <div style={{ position: 'absolute', top: '-20%', right: '-5%', width: '300px', height: '300px', background: 'rgba(255,255,255,0.1)', borderRadius: '50%', filter: 'blur(60px)' }} />
          <div style={{ position: 'relative', zIndex: 1, maxWidth: '600px' }}>
            <h2 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px', letterSpacing: '-0.02em' }}>
              Welcome back, Alpha Optimizer
            </h2>
            <p style={{ fontSize: 15, opacity: 0.9, lineHeight: 1.5, marginBottom: 24 }}>
              Your AI agents have successfully prevented 2 liquidation risks in the last 24 hours. Net portfolio yield updated to 4.20% APY.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-secondary btn-sm" style={{ border: 'none', background: 'rgba(255,255,255,0.2)', color: '#fff', backdropFilter: 'blur(10px)' }}>
                View Agent Logs
              </button>
              <button className="btn btn-ghost btn-sm" style={{ color: '#fff' }}>
                Strategy Settings <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </motion.div>

        <motion.h2 
          variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
          className="heading-md" style={{ marginBottom: 'var(--space-6)', fontWeight: 700, letterSpacing: '-0.02em' }}
        >
          Portfolio Summary
        </motion.h2>

        {/* Stats row */}
        <div className="grid-stats" style={{ marginBottom: 'var(--space-8)' }}>
          <StatCard
            label="Total Deposits"
            value="$12,450.00"
            icon={<ArrowDownLeft size={40} />}
          />
          <StatCard
            label="Total Borrowed"
            value="$4,200.00"
            icon={<ArrowUpRight size={40} />}
          />
          <StatCard
            label="Net APY"
            value="4.20%"
            change="+0.5% this week"
            changeType="positive"
            icon={<Percent size={40} />}
          />
          <StatCard
            label="Health Factor"
            value="2.10"
            change="Moderate Risk"
            changeType="warning"
            icon={<Activity size={40} />}
          />
        </div>

        {/* Two-column layout for Table and Risk Widget */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 340px',
            gap: 'var(--space-6)',
          }}
          className="dashboard-grid"
        >
          {/* Position Overview Table */}
          <motion.div 
            variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
            className="card-flat"
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-6)' }}>
              <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>
                Position Overview
              </h3>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-primary)' }}>Export CSV</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Deposited</th>
                    <th>Borrowed</th>
                    <th>Interest Rate</th>
                    <th><div style={{ textAlign: 'center' }}>Health Factor</div></th>
                    <th><div style={{ textAlign: 'right' }}>Actions</div></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((pos, i) => (
                    <tr key={i}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontWeight: 600 }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                            {pos.icon}
                          </div>
                          {pos.asset}
                        </div>
                      </td>
                      <td style={{ fontWeight: 600 }}>{pos.deposited}</td>
                      <td style={{ fontWeight: 600 }}>{pos.borrowed}</td>
                      <td style={{ color: pos.interestRate.startsWith('-') ? 'var(--color-error)' : 'var(--color-success)', fontWeight: 600 }}>
                        {pos.interestRate}
                      </td>
                      <td>
                        <div style={{ textAlign: 'center' }}>
                          <span
                            className={
                              pos.healthFactor === '—'
                                ? 'badge'
                                : Number(pos.healthFactor) < 1.5
                                ? 'badge badge-error'
                                : Number(pos.healthFactor) < 2.5
                                ? 'badge badge-warning'
                                : 'badge badge-success'
                            }
                            style={{ background: pos.healthFactor === '—' ? 'transparent' : undefined }}
                          >
                            {pos.healthFactor}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                          <button className="btn btn-secondary btn-sm" style={{ borderRadius: 8 }}>Manage</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* Liquidation Risk Widget */}
          <motion.div 
            variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
            className="card" 
            style={{ display: 'flex', flexDirection: 'column', height: 'fit-content' }}
          >
            <h3 className="heading-sm" style={{ marginBottom: 'var(--space-6)', fontWeight: 700 }}>
              Liquidation Risk
            </h3>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-4) 0',
              }}
            >
              <HealthGauge healthFactor={2.1} size={180} />
              
              <div style={{ textAlign: 'center', marginTop: 'var(--space-8)' }}>
                <p style={{ margin: '0 0 var(--space-4)', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  Your assets are currently secure. A health factor below <strong style={{color: 'var(--color-error)'}}>1.0</strong> will result in liquidation.
                </p>
                <div style={{ padding: '16px', borderRadius: 12, background: 'var(--color-bg)', border: '1px solid var(--color-border)', marginBottom: 24, textAlign: 'left' }}>
                   <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>AI Prediction</p>
                   <p style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>Low volatility expected in next 4h. No rebalance needed.</p>
                </div>
                <button className="btn btn-primary btn-sm" style={{ width: '100%', borderRadius: 8 }}>
                  View Detailed Risk Params
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .dashboard-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
