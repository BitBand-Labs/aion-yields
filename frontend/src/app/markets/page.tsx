'use client'

import React, { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { ActionModal } from '@/components/ui/ActionModal'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Globe } from 'lucide-react'
import { motion } from 'framer-motion'

const markets = [
  {
    asset: 'USDC',
    symbol: 'USDC',
    price: '$1.00',
    supplyAPY: '4.82%',
    borrowAPY: '6.14%',
    totalSupplied: '$12.4M',
    totalBorrowed: '$8.1M',
    utilization: '65.3%',
    status: 'active' as const,
  },
  {
    asset: 'ETH',
    symbol: 'ETH',
    price: '$3,421.50',
    supplyAPY: '2.15%',
    borrowAPY: '3.89%',
    totalSupplied: '$8.2M',
    totalBorrowed: '$4.6M',
    utilization: '56.1%',
    status: 'active' as const,
  },
  {
    asset: 'WBTC',
    symbol: 'WBTC',
    price: '$62,840.00',
    supplyAPY: '1.42%',
    borrowAPY: '2.87%',
    totalSupplied: '$3.1M',
    totalBorrowed: '$1.2M',
    utilization: '38.7%',
    status: 'active' as const,
  },
  {
    asset: 'DAI',
    symbol: 'DAI',
    price: '$1.00',
    supplyAPY: '5.24%',
    borrowAPY: '6.93%',
    totalSupplied: '$1.1M',
    totalBorrowed: '$0.3M',
    utilization: '27.3%',
    status: 'active' as const,
  },
]

const assetColors: Record<string, string> = {
  USDC: '#2775CA',
  ETH: '#627EEA',
  WBTC: '#F7931A',
  DAI: '#F5AC37',
}

export default function MarketsPage() {
  const [selectedAsset, setSelectedAsset] = useState<(typeof markets)[0] | null>(null)

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
              Financial Markets
            </h2>
            <p className="text-secondary" style={{ margin: 0 }}>
              Real-time liquidity monitoring on Base Mainnet
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: 'var(--color-success-muted)', color: 'var(--color-success)', fontSize: 13, fontWeight: 600 }}>
                 <Globe size={14} /> Network Stable
             </div>
          </div>
        </motion.div>

        {/* Summary row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 'var(--space-6)',
            marginBottom: 'var(--space-8)',
          }}
        >
          {[
            { label: 'Total Markets', value: markets.length, icon: null },
            { label: 'Total Supply', value: '$24.8M', icon: null },
            { label: 'Total Borrow', value: '$14.2M', icon: null },
            { label: 'Avg Utilization', value: '46.9%', icon: null },
          ].map((stat, i) => (
            <motion.div 
              key={stat.label}
              variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
              className="card"
              style={{ padding: '20px 24px' }}
            >
              <span className="text-label" style={{ marginBottom: 8, display: 'block' }}>{stat.label}</span>
              <span style={{ fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)' }}>{stat.value}</span>
            </motion.div>
          ))}
        </div>

        {/* Markets table */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="card-flat"
          style={{ padding: 0, overflow: 'hidden' }}
        >
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Available Markets</h3>
             <input 
               type="text" 
               placeholder="Search assets..." 
               style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', outline: 'none', width: 240 }} 
             />
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Price</th>
                  <th>Supply APY</th>
                  <th>Borrow APY</th>
                  <th>Total Supplied</th>
                  <th>Total Borrowed</th>
                  <th>Utilization</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {markets.map((market) => (
                  <tr
                    key={market.symbol}
                    style={{ cursor: 'pointer' }}
                    onClick={() => setSelectedAsset(market)}
                  >
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: assetColors[market.symbol] || 'var(--color-primary)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 13,
                            fontWeight: 700,
                            color: '#fff',
                            boxShadow: `0 4px 12px ${assetColors[market.symbol]}33`,
                          }}
                        >
                          {market.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, margin: '0 0 2px', fontSize: 14 }}>
                            {market.asset}
                          </p>
                          <p className="text-caption" style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>
                            {market.symbol}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
                      {market.price}
                    </td>
                    <td>
                      <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: 14 }}>
                        {market.supplyAPY}
                      </span>
                    </td>
                    <td>
                      <span style={{ color: 'var(--color-warning)', fontWeight: 700, fontSize: 14 }}>
                        {market.borrowAPY}
                      </span>
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                      {market.totalSupplied}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                      {market.totalBorrowed}
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 48,
                            height: 6,
                            background: 'var(--color-bg)',
                            borderRadius: 3,
                            overflow: 'hidden',
                          }}
                        >
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: market.utilization }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            style={{
                              height: '100%',
                              background:
                                parseFloat(market.utilization) > 80
                                  ? 'var(--color-error)'
                                  : parseFloat(market.utilization) > 60
                                  ? 'var(--color-warning)'
                                  : 'var(--color-primary)',
                              borderRadius: 3,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                          {market.utilization}
                        </span>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                        <button className="btn btn-sm btn-primary" style={{ borderRadius: 8, padding: '0 12px' }}>
                          Supply
                        </button>
                        <button className="btn btn-sm btn-secondary" style={{ borderRadius: 8, padding: '0 12px' }}>
                          Borrow
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      </motion.div>

      {/* Asset Detail Modal */}
      <ActionModal
        isOpen={!!selectedAsset}
        onClose={() => setSelectedAsset(null)}
        title={selectedAsset ? `${selectedAsset.asset} Market` : ''}
      >
        {selectedAsset && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--radius-full)',
                  background: assetColors[selectedAsset.symbol] || 'var(--color-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 16,
                  fontWeight: 700,
                  color: '#fff',
                }}
              >
                {selectedAsset.symbol.slice(0, 2)}
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                  {selectedAsset.asset}
                </h3>
                <p className="text-caption" style={{ margin: 0 }}>
                  {selectedAsset.price}
                </p>
              </div>
              <Badge variant="success" dot>Active</Badge>
            </div>

            {/* Market stats grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              {[
                { label: 'Supply APY', value: selectedAsset.supplyAPY, color: 'var(--color-success)' },
                { label: 'Borrow APY', value: selectedAsset.borrowAPY, color: 'var(--color-warning)' },
                { label: 'Total Supplied', value: selectedAsset.totalSupplied, color: 'var(--color-text-primary)' },
                { label: 'Total Borrowed', value: selectedAsset.totalBorrowed, color: 'var(--color-text-primary)' },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: '12px 16px',
                    background: 'var(--color-bg)',
                    borderRadius: 'var(--radius-sm)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <p className="text-caption" style={{ margin: '0 0 4px' }}>
                    {stat.label}
                  </p>
                  <p
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      margin: 0,
                      color: stat.color,
                    }}
                  >
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Supply input */}
            <div>
              <label className="text-label" style={{ display: 'block', marginBottom: 8 }}>
                Supply Amount
              </label>
              <input
                className="input"
                type="text"
                placeholder={`Enter ${selectedAsset.symbol} amount`}
              />
              <p className="text-caption" style={{ marginTop: 4, margin: '4px 0 0' }}>
                Wallet Balance: 0.00 {selectedAsset.symbol}
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button className="btn btn-primary" style={{ flex: 1 }}>
                <ArrowDownLeft size={16} />
                Supply {selectedAsset.symbol}
              </button>
              <button className="btn btn-secondary" style={{ flex: 1 }}>
                <ArrowUpRight size={16} />
                Borrow {selectedAsset.symbol}
              </button>
            </div>

            <a
              href="#"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                justifyContent: 'center',
                fontSize: 13,
                color: 'var(--color-text-tertiary)',
                textDecoration: 'none',
              }}
            >
              View on Base Explorer <ExternalLink size={12} />
            </a>
          </div>
        )}
      </ActionModal>
    </AppShell>
  )
}
