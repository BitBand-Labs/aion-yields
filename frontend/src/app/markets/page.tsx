'use client'

import React, { useState } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { ActionModal } from '@/components/ui/ActionModal'
import { ArrowDownLeft, ArrowUpRight, ExternalLink } from 'lucide-react'

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
      <div className="animate-fade-in">
        {/* Summary row */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-6)',
            marginBottom: 'var(--space-6)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="text-label">Total Markets</span>
            <span style={{ fontSize: 20, fontWeight: 600 }}>{markets.length}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="text-label">Total Supply</span>
            <span style={{ fontSize: 20, fontWeight: 600 }}>$24.8M</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="text-label">Total Borrow</span>
            <span style={{ fontSize: 20, fontWeight: 600 }}>$14.2M</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span className="text-label">Avg Utilization</span>
            <span style={{ fontSize: 20, fontWeight: 600 }}>46.9%</span>
          </div>
        </div>

        {/* Markets table */}
        <div
          className="card-flat"
          style={{ padding: 0, overflow: 'hidden' }}
        >
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
                <th>Actions</th>
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
                          width: 32,
                          height: 32,
                          borderRadius: 'var(--radius-full)',
                          background: assetColors[market.symbol] || 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 700,
                          color: '#fff',
                        }}
                      >
                        {market.symbol.slice(0, 2)}
                      </div>
                      <div>
                        <p style={{ fontWeight: 500, margin: 0, fontSize: 14 }}>
                          {market.asset}
                        </p>
                        <p className="text-caption" style={{ margin: 0, fontSize: 11 }}>
                          {market.symbol}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {market.price}
                  </td>
                  <td>
                    <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>
                      {market.supplyAPY}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: 'var(--color-warning)', fontWeight: 500 }}>
                      {market.borrowAPY}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {market.totalSupplied}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {market.totalBorrowed}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 48,
                          height: 4,
                          background: 'var(--color-border)',
                          borderRadius: 2,
                          overflow: 'hidden',
                        }}
                      >
                        <div
                          style={{
                            width: market.utilization,
                            height: '100%',
                            background:
                              parseFloat(market.utilization) > 80
                                ? 'var(--color-error)'
                                : parseFloat(market.utilization) > 60
                                ? 'var(--color-warning)'
                                : 'var(--color-primary)',
                            borderRadius: 2,
                          }}
                        />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>
                        {market.utilization}
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-primary">
                        <ArrowDownLeft size={14} />
                        Supply
                      </button>
                      <button className="btn btn-sm btn-secondary">
                        <ArrowUpRight size={14} />
                        Borrow
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

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
