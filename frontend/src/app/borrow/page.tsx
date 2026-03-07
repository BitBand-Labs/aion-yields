'use client'

import React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { MagicCard } from '@/components/ui/MagicCard'
import { ArrowUpRight, Shield, RefreshCw, AlertTriangle, Wallet } from 'lucide-react'
import { motion } from 'framer-motion'
import { TokenIcon } from '@/components/ui/TokenIcon'

const collateralAssets = [
  { asset: 'USDC', amount: '5,000.00', value: '$5,000.00', ltv: '85%' },
  { asset: 'ETH', amount: '2.50', value: '$8,553.75', ltv: '80%' },
]

const borrowedPositions = [
  { asset: 'USDC', amount: '3,200.00', value: '$3,200.00', apy: '6.14%', interest: '$4.82' },
]

const assetColors: Record<string, string> = {
  USDC: '#2775CA',
  ETH: '#627EEA',
  WBTC: '#F7931A',
  DAI: '#F5AC37',
}

export default function BorrowPage() {
  const borrowLimit = 11093.00
  const totalBorrowed = 3200.00
  const utilization = (totalBorrowed / borrowLimit) * 100

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
        <motion.h2 
          variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          className="heading-md" style={{ marginBottom: 'var(--space-8)', fontWeight: 700, letterSpacing: '-0.02em' }}
        >
          Borrowing Overview
        </motion.h2>

        {/* Borrow Capacity Card (Premium) */}
        <motion.div 
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="card-glow" 
          style={{ 
            marginBottom: 'var(--space-8)', 
            padding: '32px 40px',
            background: 'var(--color-surface-dark)',
            color: 'var(--color-text-primary)',
            position: 'relative',
            overflow: 'hidden'
          }}
        >
          {/* Background graphics */}
          <div style={{ position: 'absolute', top: '-50%', right: '-10%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(8,71,247,0.1) 0%, transparent 70%)', filter: 'blur(40px)' }} />
          
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-8)' }}>
            <div>
              <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: 1 }}>Borrow Capacity</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
                <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em' }}>
                  ${totalBorrowed.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
                <span style={{ fontSize: 18, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                  of ${borrowLimit.toLocaleString('en-US', { minimumFractionDigits: 2 })} limit
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>Available to Borrow</p>
              <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-success)' }}>
                ${(borrowLimit - totalBorrowed).toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          <div style={{ width: '100%', height: 12, background: 'var(--overlay-light)', borderRadius: 6, overflow: 'hidden', marginBottom: 'var(--space-6)', border: '1px solid var(--overlay-light)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${utilization}%` }}
              transition={{ duration: 1.2, ease: 'circOut' }}
              style={{
                height: '100%',
                background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary-light))',
                boxShadow: '0 0 15px rgba(14, 167, 203, 0.4)',
                borderRadius: 6,
              }}
            />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-secondary)' }}>{utilization.toFixed(1)}% Limit Used</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <AlertTriangle size={16} color="var(--color-warning)" />
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-warning)' }}>Liquidation Threshold: 90%</span>
            </div>
          </div>
        </motion.div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--space-8)' }} className="borrow-grid">
          
          {/* Main Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            {/* Borrowed Positions */}
            <motion.div 
              variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
              className="card-flat" style={{ padding: 0, overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Active Borrowings</h3>
                  <Badge variant="warning">{borrowedPositions.length} Positions</Badge>
                </div>
                <button className="btn btn-sm btn-primary" style={{ borderRadius: 8 }}>
                  <ArrowUpRight size={14} /> Borrow Asset
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Debt</th>
                      <th>Value</th>
                      <th>Borrow APY</th>
                      <th>Accrued Interest</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {borrowedPositions.map((pos) => (
                      <tr key={pos.asset}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <TokenIcon symbol={pos.asset} size={32} />
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{pos.asset}</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{pos.amount}</td>
                        <td style={{ fontWeight: 600 }}>{pos.value}</td>
                        <td><span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>{pos.apy}</span></td>
                        <td><span style={{ color: 'var(--color-error)', fontWeight: 600 }}>{pos.interest}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-sm btn-secondary" style={{ borderRadius: 8 }}><RefreshCw size={14} /> Repay</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {borrowedPositions.length === 0 && (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '64px 24px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                            <img src="/assets/illustrations/AI-FEATURE.png" alt="No active vaults" style={{ width: 120, height: 'auto', opacity: 0.6 }} />
                            <div>
                              <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>No active borrowings yet</p>
                              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Deposit assets to start earning and unlock your borrow capacity.</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* Collateral Manager */}
            <motion.div 
              variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
              className="card-flat" style={{ padding: 0, overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Collateral Assets</h3>
                  <Badge variant="success">{collateralAssets.length} Assets</Badge>
                </div>
                <button className="btn btn-sm btn-secondary" style={{ borderRadius: 8 }}>
                  <Shield size={14} /> Add Collateral
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Balance</th>
                      <th>Value</th>
                      <th>Max LTV</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collateralAssets.map((pos) => (
                      <tr key={pos.asset}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 10, background: assetColors[pos.asset] || 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: 'var(--color-text-primary)' }}>
                              {pos.asset.slice(0, 2)}
                            </div>
                            <span style={{ fontWeight: 700, fontSize: 14 }}>{pos.asset}</span>
                          </div>
                        </td>
                        <td style={{ fontWeight: 600 }}>{pos.amount}</td>
                        <td style={{ fontWeight: 600 }}>{pos.value}</td>
                        <td><span style={{ fontWeight: 600, color: 'var(--color-text-secondary)' }}>{pos.ltv}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button className="btn btn-sm btn-secondary" style={{ borderRadius: 8 }}>Withdraw</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>

          {/* Sidebar Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            <MagicCard 
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'var(--space-2)' }}
            >
              <p style={{ margin: 'var(--space-2) 0', fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Account Health Factor</p>
              <HealthGauge value={2.1} size={160} />
              <p style={{ marginTop: '24px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, padding: '0 16px' }}>
                Your positions are well collateralized. <br/> <span style={{ color: 'var(--color-success)', fontWeight: 600 }}>Health is verified by Chainlink CCIP.</span>
              </p>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 12, color: 'var(--color-primary)', fontSize: 11 }}>Risk Sensitivity Settings</button>
            </MagicCard>

            {/* Faint info card */}
            <motion.div 
               variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
               style={{ padding: 24, borderRadius: 'var(--radius-lg)', background: 'rgba(14, 167, 203, 0.03)', border: '1px dashed var(--color-primary-muted)' }}
            >
               <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--color-text-primary)' }}>Did you know?</h4>
               <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
                 You can increase your borrow limit by supplying yield-bearing assets from the <strong style={{ color: 'var(--color-primary)' }}>AI Yield</strong> pool.
               </p>
            </motion.div>
          </div>

        </div>
      </motion.div>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .borrow-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
