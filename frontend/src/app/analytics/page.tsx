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
  Zap,
} from 'lucide-react'
import { motion } from 'framer-motion'

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
        style={{ position: 'relative' }}
      >
        {/* Background Visual */}
        <div style={{ position: 'fixed', top: '15%', right: '-5%', width: '50vw', height: '50vw', opacity: 0.05, filter: 'blur(8px)', pointerEvents: 'none', zIndex: -1 }}>
          <img src="/assets/illustrations/CROSS-CHAIN.png" alt="" style={{ width: '100%', height: 'auto' }} />
        </div>
        <motion.div 
          variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}
        >
          <div>
            <h2 className="heading-md" style={{ margin: '0 0 var(--space-2)', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Protocol Analytics
            </h2>
            <p className="text-secondary" style={{ margin: 0 }}>
              Real-time performance and cross-chain metrics
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
             <button className="btn btn-sm btn-secondary" style={{ borderRadius: 8 }}>
                <Clock size={14} /> Last 24 Hours
             </button>
             <button className="btn btn-sm btn-primary" style={{ borderRadius: 8 }}>
                Download Report
             </button>
          </div>
        </motion.div>

        {/* TVL Chart */}
        <motion.div 
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="card-glow" 
          style={{ marginBottom: 'var(--space-8)', padding: '32px' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 32,
            }}
          >
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Total Value Locked
                </h3>
                <Badge variant="success" dot style={{ padding: '4px 10px', fontSize: 11 }}>
                  Live Monitoring
                </Badge>
              </div>
              <p
                style={{
                  fontSize: 40,
                  fontWeight: 700,
                  margin: '12px 0 0',
                  letterSpacing: '-0.03em',
                  color: 'var(--color-text-primary)'
                }}
              >
                $24,842,912
              </p>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '8px 12px',
                borderRadius: 8,
                background: 'var(--color-success-muted)',
                color: 'var(--color-success)',
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <TrendingUp size={16} />
              +202% YTD
            </div>
          </div>

          {/* Premium bar chart */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 12,
              height: 200,
              padding: '0 8px',
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
                  gap: 12,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: i === tvlHistory.length - 1 ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                  }}
                >
                  ${data.value}M
                </span>
                <div style={{ width: '100%', position: 'relative' }}>
                   <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(data.value / maxTVL) * 140}px` }}
                    transition={{ duration: 1, delay: i * 0.1, ease: 'easeOut' }}
                    style={{
                      width: '100%',
                      background:
                        i === tvlHistory.length - 1
                          ? 'linear-gradient(180deg, var(--color-primary), var(--color-primary-light))'
                          : 'var(--color-surface-raised)',
                      borderRadius: '8px 8px 4px 4px',
                      boxShadow: i === tvlHistory.length - 1 ? '0 0 20px rgba(8, 71, 247, 0.2)' : 'none',
                    }}
                   />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-tertiary)' }}>
                  {data.date}
                </span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Two-column: Protocol Metrics + CCIP */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 1fr)',
            gap: 'var(--space-8)',
          }}
          className="analytics-grid"
        >
          {/* Protocol Metrics */}
          <motion.div 
            variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
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
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                 <BarChart3 size={20} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                System Performance
              </h3>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 16,
              }}
            >
              {protocolMetrics.map((metric) => (
                <motion.div
                  key={metric.label}
                  whileHover={{ y: -4, borderColor: 'var(--color-primary)' }}
                  style={{
                    padding: '20px',
                    background: 'var(--color-bg)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px solid var(--color-border)',
                    transition: 'all 0.2s ease',
                    cursor: 'default'
                  }}
                >
                  <p className="text-caption" style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>
                    {metric.label}
                  </p>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                    }}
                  >
                    <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                      {metric.value}
                    </span>
                    <Badge variant={metric.change.startsWith('+') ? 'success' : 'error'} style={{ fontSize: 11, padding: '2px 8px' }}>
                      {metric.change}
                    </Badge>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* CCIP Cross-Chain Activity */}
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
               <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-accent)' }}>
                 <Globe size={20} />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                Cross-Chain Activity
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
                    padding: '18px 0',
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
                      gap: 12,
                    }}
                  >
                    <div style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--color-surface-raised)', fontSize: 11, fontWeight: 700 }}>{transfer.from}</div>
                    <ArrowRight size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    <div style={{ padding: '4px 10px', borderRadius: 6, background: 'var(--color-primary-muted)', color: 'var(--color-primary)', fontSize: 11, fontWeight: 700 }}>{transfer.to}</div>
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 16,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono)',
                        color: 'var(--color-text-primary)'
                      }}
                    >
                      {transfer.amount}
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                      }}
                    >
                      {transfer.status === 'completed' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-success)' }}>
                           <CheckCircle size={14} />
                           {/* <span style={{ fontSize: 11, fontWeight: 600 }}>Finalized</span> */}
                        </div>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-warning)' }}>
                           <Clock size={14} className="animate-pulse" />
                           {/* <span style={{ fontSize: 11, fontWeight: 600 }}>Routing</span> */}
                        </div>
                      )}
                      <span
                        style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)' }}
                      >
                        {transfer.time}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Chain Summary (Premium) */}
            <div
              style={{
                marginTop: 32,
                padding: '24px',
                background: 'linear-gradient(135deg, rgba(8, 71, 247, 0.05), transparent)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--color-primary-muted)',
                display: 'flex',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              <div style={{ position: 'relative', zIndex: 1 }}>
                <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>
                  Total Bridge Volume
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>$2.4M</span>
                  <span style={{ fontSize: 12, color: 'var(--color-success)', fontWeight: 600 }}>+12%</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', position: 'relative', zIndex: 1 }}>
                 <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--color-surface-raised)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)', marginLeft: 'auto' }}>
                    <Zap size={20} />
                 </div>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>

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
