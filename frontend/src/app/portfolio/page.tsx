'use client'

import React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { Badge } from '@/components/ui/Badge'
import {
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Plus,
  DollarSign,
  Percent,
} from 'lucide-react'

const suppliedPositions = [
  { asset: 'USDC', amount: '5,000.00', value: '$5,000.00', apy: '4.82%', earned: '$12.40' },
  { asset: 'ETH', amount: '2.50', value: '$8,553.75', apy: '2.15%', earned: '$8.65' },
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

export default function PortfolioPage() {
  return (
    <AppShell>
      <div className="animate-fade-in">
        {/* Overview stats row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 1fr auto',
            gap: 'var(--space-4)',
            marginBottom: 'var(--space-6)',
            alignItems: 'start',
          }}
          className="portfolio-overview"
        >
          <StatCard
            label="Net Worth"
            value="$10,353.75"
            change="+$21.05 earned"
            changeType="positive"
            icon={<DollarSign size={36} />}
          />
          <StatCard
            label="Total Supplied"
            value="$13,553.75"
            change="+3.12% avg APY"
            changeType="positive"
            icon={<ArrowDownLeft size={36} />}
          />
          <StatCard
            label="Total Borrowed"
            value="$3,200.00"
            change="6.14% borrow rate"
            changeType="neutral"
            icon={<ArrowUpRight size={36} />}
          />

          {/* Health Factor Gauge */}
          <div
            className="card-flat"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-6)',
              minWidth: 160,
            }}
          >
            <p className="text-label" style={{ margin: '0 0 8px' }}>
              Health Factor
            </p>
            <HealthGauge healthFactor={3.42} size={100} />
          </div>
        </div>

        {/* Supplied Positions */}
        <div className="card-flat" style={{ marginBottom: 'var(--space-4)', padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 24px',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                Supplied Assets
              </h3>
              <Badge variant="success" dot>
                {suppliedPositions.length} positions
              </Badge>
            </div>
            <button className="btn btn-sm btn-primary">
              <Plus size={14} />
              Supply More
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Balance</th>
                <th>Value</th>
                <th>APY</th>
                <th>Earned</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliedPositions.map((pos) => (
                <tr key={pos.asset}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 'var(--radius-full)',
                          background: assetColors[pos.asset] || 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#fff',
                        }}
                      >
                        {pos.asset.slice(0, 2)}
                      </div>
                      <span style={{ fontWeight: 500 }}>{pos.asset}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {pos.amount}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {pos.value}
                  </td>
                  <td>
                    <span style={{ color: 'var(--color-success)', fontWeight: 500 }}>
                      {pos.apy}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: 'var(--color-success)', fontWeight: 500, fontSize: 13 }}>
                      {pos.earned}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-secondary">Withdraw</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Borrowed Positions */}
        <div className="card-flat" style={{ padding: 0, overflow: 'hidden' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 24px',
              borderBottom: '1px solid var(--color-border)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                Borrowed Assets
              </h3>
              <Badge variant="warning" dot>
                {borrowedPositions.length} positions
              </Badge>
            </div>
            <button className="btn btn-sm btn-secondary">
              <ArrowUpRight size={14} />
              Borrow More
            </button>
          </div>

          <table className="data-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Debt</th>
                <th>Value</th>
                <th>APY</th>
                <th>Accrued Interest</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {borrowedPositions.map((pos) => (
                <tr key={pos.asset}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 'var(--radius-full)',
                          background: assetColors[pos.asset] || 'var(--color-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 11,
                          fontWeight: 700,
                          color: '#fff',
                        }}
                      >
                        {pos.asset.slice(0, 2)}
                      </div>
                      <span style={{ fontWeight: 500 }}>{pos.asset}</span>
                    </div>
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {pos.amount}
                  </td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                    {pos.value}
                  </td>
                  <td>
                    <span style={{ color: 'var(--color-warning)', fontWeight: 500 }}>
                      {pos.apy}
                    </span>
                  </td>
                  <td>
                    <span style={{ color: 'var(--color-error)', fontWeight: 500, fontSize: 13 }}>
                      {pos.interest}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-sm btn-primary">
                        <RefreshCw size={14} />
                        Repay
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .portfolio-overview {
            grid-template-columns: 1fr 1fr !important;
          }
        }
        @media (max-width: 640px) {
          .portfolio-overview {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
