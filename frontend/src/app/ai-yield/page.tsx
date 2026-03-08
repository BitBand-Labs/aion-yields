'use client'

import React, { useState, useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { Cpu, TrendingUp, Zap, Clock, Shield, ArrowRight, Activity, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { useAccount, useChainId, useReadContracts } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { useContractAddresses } from '@/hooks/useContracts'
import { CONTRACT_ADDRESSES, SUPPORTED_CHAINS } from '@/lib/constants'
import abis from '@/lib/abi/abi.json'

const KNOWN_ASSETS: Record<number, Record<string, { symbol: string; decimals: number }>> = {
  [SUPPORTED_CHAINS.sepolia]: {
    [CONTRACT_ADDRESSES[SUPPORTED_CHAINS.sepolia].MockUSDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
  },
  [SUPPORTED_CHAINS.avalancheFuji]: {
    [CONTRACT_ADDRESSES[SUPPORTED_CHAINS.avalancheFuji].MockUSDC.toLowerCase()]: { symbol: 'USDC', decimals: 6 },
  },
}

const RAY = BigInt(1e27)

function formatRay(value: bigint): string {
  const pct = Number(value * 10000n / RAY) / 100
  return pct.toFixed(2)
}

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`
  return `$${value.toFixed(2)}`
}

interface ReserveInfo {
  address: Address
  symbol: string
  decimals: number
  totalSupply: bigint
  totalBorrow: bigint
  supplyRate: bigint
  borrowRate: bigint
  price: number
}

export default function AIYieldPage() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const addresses = useContractAddresses()
  const pool = addresses.LendingPool as Address

  const knownAssets = KNOWN_ASSETS[chainId] || KNOWN_ASSETS[SUPPORTED_CHAINS.sepolia]
  const assetAddresses = Object.keys(knownAssets).map(a => a as Address)

  // Fetch reserve data
  const reserveQueries = useReadContracts({
    contracts: assetAddresses.flatMap(asset => [
      { address: pool, abi: abis.LendingPool as readonly any[], functionName: 'getReserveData', args: [asset] },
      { address: addresses.ChainlinkPriceOracle as Address, abi: abis.ChainlinkPriceOracle as readonly any[], functionName: 'getAssetPrice', args: [asset] },
    ]),
  })

  const [reserves, setReserves] = useState<ReserveInfo[]>([])

  useEffect(() => {
    if (!reserveQueries.data) return
    const parsed: ReserveInfo[] = []
    for (let i = 0; i < assetAddresses.length; i++) {
      const reserveResult = reserveQueries.data[i * 2]
      const priceResult = reserveQueries.data[i * 2 + 1]
      const addr = assetAddresses[i]
      const meta = knownAssets[addr.toLowerCase()]
      if (reserveResult?.status === 'success' && reserveResult.result) {
        const r = reserveResult.result as any
        const [price] = priceResult?.status === 'success' ? (priceResult.result as [bigint, boolean]) : [0n, false]
        parsed.push({
          address: addr as Address,
          symbol: meta.symbol,
          decimals: meta.decimals,
          totalSupply: r.totalSupply || 0n,
          totalBorrow: r.totalBorrow || 0n,
          supplyRate: r.currentLiquidityRate || r.liquidityRate || 0n,
          borrowRate: r.currentVariableBorrowRate || r.variableBorrowRate || r.borrowRate || 0n,
          price: Number(price) / 1e8,
        })
      }
    }
    setReserves(parsed)
  }, [reserveQueries.data])

  const isLoading = reserveQueries.isLoading

  // Compute totals from on-chain data
  const totalCapitalUSD = reserves.reduce((acc, r) => {
    return acc + Number(formatUnits(r.totalSupply, r.decimals)) * r.price
  }, 0)

  const avgSupplyAPY = reserves.length > 0
    ? reserves.reduce((acc, r) => acc + Number(r.supplyRate * 10000n / RAY) / 100, 0) / reserves.length
    : 0

  // The AI bonus yield is the difference between AI-optimized and base rates
  // Base rate is roughly 2% (the protocol default), AI pushes it higher via rebalancing
  const baseAPY = 2.0
  const bonusYield = Math.max(0, avgSupplyAPY - baseAPY)

  // Utilization-based inference indicator: higher utilization = more active AI management
  const avgUtilization = reserves.length > 0
    ? reserves.reduce((acc, r) => {
        const supply = Number(r.totalSupply)
        return acc + (supply > 0 ? (Number(r.totalBorrow) / supply) * 100 : 0)
      }, 0) / reserves.length
    : 0

  // Build strategies from real reserve data
  const activeStrategies = reserves.map((r) => {
    const supplyAPY = Number(r.supplyRate * 10000n / RAY) / 100
    const utilization = Number(r.totalSupply) > 0
      ? (Number(r.totalBorrow) / Number(r.totalSupply)) * 100
      : 0
    return {
      name: `${r.symbol} Yield Optimization`,
      asset: r.symbol,
      apy: `${supplyAPY.toFixed(2)}%`,
      baseApy: `${baseAPY.toFixed(2)}%`,
      status: 'active',
      risk: utilization > 60 ? 'Medium' : 'Low',
      totalSupplied: formatUSD(Number(formatUnits(r.totalSupply, r.decimals)) * r.price),
      totalBorrowed: formatUSD(Number(formatUnits(r.totalBorrow, r.decimals)) * r.price),
      utilization: `${utilization.toFixed(1)}%`,
    }
  })

  // Build activity from on-chain context
  const recentActivity = [
    { time: 'On-chain', action: `Pool utilization at ${reserves[0] ? ((Number(reserves[0].totalBorrow) / Math.max(1, Number(reserves[0].totalSupply))) * 100).toFixed(1) : '0'}% — rates auto-adjusted`, agent: 'InterestRateModel', gain: 'Dynamic APY' },
    { time: 'On-chain', action: `${formatUSD(totalCapitalUSD)} total capital under management`, agent: 'LendingPool', gain: 'Active' },
    { time: 'CRE', action: `AI yield optimization active via Chainlink CRE pipeline`, agent: 'AIYieldEngine', gain: 'Verified' },
  ]

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
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-8)' }}
        >
          <div>
            <h2 className="heading-md" style={{ margin: '0 0 var(--space-2)', fontWeight: 700, letterSpacing: '-0.02em' }}>
              AI Yield Optimization
            </h2>
            <p className="text-secondary" style={{ margin: 0 }}>
              Orchestrated by Chainlink CRE and autonomous ERC-8004 agents
            </p>
          </div>
          <Badge variant="accent" style={{ fontSize: 11, fontWeight: 700, padding: '6px 12px' }}>LIVE ON-CHAIN DATA</Badge>
        </motion.div>

        {/* Stats row */}
        <div className="grid-stats" style={{ marginBottom: 'var(--space-8)' }}>
          {[
            { label: 'Total Capital Optimized', value: isLoading ? '...' : formatUSD(totalCapitalUSD), icon: Cpu, color: 'var(--color-primary)' },
            { label: 'Current Supply APY', value: isLoading ? '...' : `${avgSupplyAPY.toFixed(2)}%`, icon: TrendingUp, color: 'var(--color-success)' },
            { label: 'Pool Utilization', value: isLoading ? '...' : `${avgUtilization.toFixed(1)}%`, icon: Zap, color: 'var(--color-warning)' },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
              className="card-flat"
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '24px' }}
            >
              <div
                style={{
                  width: 44, height: 44, borderRadius: 12,
                  background: `${stat.color}15`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--space-6)' }} className="ai-grid">

          {/* Main Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

            {/* Active Strategies Panel */}
            <motion.div
              variants={{ hidden: { opacity: 0, scale: 0.98 }, visible: { opacity: 1, scale: 1 } }}
              className="card-flat" style={{ padding: 0, overflow: 'hidden' }}
            >
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Active Strategies</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                   <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', boxShadow: '0 0 8px var(--color-success)' }} />
                   <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Live Feed</span>
                </div>
              </div>

              <table className="data-table">
                <thead>
                  <tr>
                    <th>Strategy</th>
                    <th>Asset</th>
                    <th>Current APY</th>
                    <th>Total Supplied</th>
                    <th>Utilization</th>
                    <th>Risk</th>
                    <th style={{ textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 40 }}>
                        <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                        <p style={{ marginTop: 8, color: 'var(--color-text-secondary)' }}>Loading from chain...</p>
                      </td>
                    </tr>
                  ) : activeStrategies.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>
                        No active strategies
                      </td>
                    </tr>
                  ) : (
                    activeStrategies.map((strat, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 600 }}>{strat.name}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                             <TokenIcon symbol={strat.asset} size={20} />
                             {strat.asset}
                          </div>
                        </td>
                        <td><span style={{ color: 'var(--color-success)', fontWeight: 700 }}>{strat.apy}</span></td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{strat.totalSupplied}</td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13 }}>{strat.utilization}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Shield size={14} style={{ color: strat.risk === 'Low' ? 'var(--color-success)' : 'var(--color-warning)' }} />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{strat.risk}</span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <Badge variant="success" dot>Active</Badge>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </motion.div>

            {/* Performance Chart Placeholder */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="card-flat"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
                <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Yield Performance</h3>
                <div style={{ display: 'flex', gap: 'var(--space-2)', background: 'var(--color-bg)', padding: 4, borderRadius: 8 }}>
                  <button className="badge" style={{ background: 'transparent', cursor: 'pointer', border: 'none', color: 'var(--color-text-secondary)' }}>1W</button>
                  <button className="badge" style={{ background: 'var(--color-surface)', cursor: 'pointer', border: 'none', fontWeight: 600, boxShadow: 'var(--shadow-subtle)' }}>1M</button>
                  <button className="badge" style={{ background: 'transparent', cursor: 'pointer', border: 'none', color: 'var(--color-text-secondary)' }}>All</button>
                </div>
              </div>

              <div style={{ height: 280, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderBottom: '1px solid var(--color-border)', position: 'relative', marginBottom: 24 }}>
                {/* Y-axis labels */}
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600 }}>
                  <span>8%</span>
                  <span>6%</span>
                  <span>4%</span>
                  <span>2%</span>
                  <span>0%</span>
                </div>

                {/* Chart bars */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '100%', paddingLeft: 40, gap: 12 }}>
                  {[40, 45, 60, 55, 75, 80, 70, 85].map((h, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '10%', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: h + '%' }}
                        transition={{ duration: 1, delay: i * 0.1 }}
                        style={{ width: '100%', background: 'linear-gradient(to top, var(--color-primary), var(--color-primary-light))', borderTopLeftRadius: 6, borderTopRightRadius: 6, zIndex: 2 }}
                      />
                      <motion.div
                        initial={{ height: 0 }}
                        animate={{ height: (h * 0.6) + '%' }}
                        transition={{ duration: 1, delay: i * 0.1 + 0.2 }}
                        style={{ width: '100%', background: 'var(--color-secondary)', position: 'absolute', bottom: 0, borderTopLeftRadius: 6, borderTopRightRadius: 6, opacity: 0.3, zIndex: 1 }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-8)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 14, height: 14, background: 'var(--color-primary)', borderRadius: 4 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Optimized AI Yield</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 14, height: 14, background: 'var(--color-secondary)', borderRadius: 4, opacity: 0.5 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Base Protocol Yield</span>
                </div>
              </div>
            </motion.div>

          </div>

          {/* Sidebar Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

            {/* Agent Activity Feed */}
            <motion.div
              variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
              className="card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}
            >
              <div style={{ position: 'absolute', top: 0, right: 0, width: '100px', height: '100px', background: 'radial-gradient(circle, var(--color-primary-muted) 0%, transparent 70%)', opacity: 0.5 }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
                <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Protocol Activity</h3>
                <Activity size={18} style={{ color: 'var(--color-primary)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                {recentActivity.map((act, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    style={{ display: 'flex', gap: 16, position: 'relative' }}
                  >
                    {i !== recentActivity.length - 1 && (
                      <div style={{ position: 'absolute', left: 15, top: 32, bottom: -24, width: 2, background: 'var(--color-border)', opacity: 0.5 }} />
                    )}
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, zIndex: 1
                    }}>
                      <Clock size={14} color="var(--color-text-tertiary)" />
                    </div>
                    <div>
                      <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {act.time}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                        {act.action}
                      </p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 500, padding: '4px 8px', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{act.agent}</span>
                        <Badge variant="success" style={{ padding: '3px 8px', fontSize: 11 }}>{act.gain}</Badge>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>

            {/* AI Trust Card */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="card-glow"
              style={{ padding: 24 }}
            >
               <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--color-primary)' }}>Protocol Assurance</h4>
               <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
                 All agentic workflows are verified by Chainlink Runtime Environment. Malicious predictions trigger instant slashing of agent stake.
               </p>
            </motion.div>

          </div>
        </div>
      </motion.div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 1024px) {
          .ai-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
