'use client'

import { useState, useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { HealthGauge } from '@/components/ui/HealthGauge'
import {
  Wallet,
  Bot,
  Activity,
  Loader2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { MagicCard } from '@/components/ui/MagicCard'
import { DataFlow } from '@/components/ui/DataFlow'
import { useAccount, useChainId, useReadContracts } from 'wagmi'
import { type Address, formatUnits } from 'viem'
import { useContractAddresses, useUserAccountData, useHealthFactor } from '@/hooks/useContracts'
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

// Mirror the on-chain InterestRateModel kink parameters
const DEFAULT_BASE_RATE = 0.02   // 2%
const DEFAULT_SLOPE_1 = 0.04     // 4%
const DEFAULT_SLOPE_2 = 3.00     // 300%
const DEFAULT_OPTIMAL_UTIL = 0.80 // 80%
const DEFAULT_RESERVE_FACTOR = 0.10 // 10%

/** Compute supply APY from utilization using the on-chain kink model */
function computeSupplyAPY(totalSupply: bigint, totalBorrow: bigint): number {
  if (totalSupply === 0n) return 0
  const utilization = Number(totalBorrow) / Number(totalSupply)

  let borrowRate: number
  if (utilization < DEFAULT_OPTIMAL_UTIL) {
    borrowRate = DEFAULT_BASE_RATE + DEFAULT_SLOPE_1 * (utilization / DEFAULT_OPTIMAL_UTIL)
  } else {
    const excessUtil = utilization - DEFAULT_OPTIMAL_UTIL
    const maxExcess = 1 - DEFAULT_OPTIMAL_UTIL
    borrowRate = DEFAULT_BASE_RATE + DEFAULT_SLOPE_1 + DEFAULT_SLOPE_2 * (excessUtil / maxExcess)
  }

  // supplyRate = borrowRate * utilization * (1 - reserveFactor)
  return borrowRate * utilization * (1 - DEFAULT_RESERVE_FACTOR) * 100
}

function formatRay(value: bigint): string {
  const pct = Number(value * 10000n / RAY) / 100
  return pct.toFixed(2)
}

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`
  return `$${value.toFixed(2)}`
}

interface Position {
  asset: Address
  symbol: string
  decimals: number
  deposited: bigint
  borrowed: bigint
  supplyRate: bigint
  borrowRate: bigint
  price: number
}

export default function DashboardPage() {
  const { address: userAddress, isConnected } = useAccount()
  const chainId = useChainId()
  const addresses = useContractAddresses()
  const pool = addresses.LendingPool as Address

  const knownAssets = KNOWN_ASSETS[chainId] || KNOWN_ASSETS[SUPPORTED_CHAINS.sepolia]
  const assetAddresses = Object.keys(knownAssets).map(a => a as Address)

  // User account data (total collateral, total debt, health factor, etc.)
  const { data: accountData } = useUserAccountData(userAddress)
  const { data: healthFactor } = useHealthFactor(userAddress)

  const aiEngine = addresses.AIYieldEngine as Address

  // Fetch reserve data + user balances + AI predictions for each known asset
  const queries = useReadContracts({
    contracts: assetAddresses.flatMap(asset => {
      return [
        { address: pool, abi: abis.LendingPool as readonly any[], functionName: 'getReserveData', args: [asset] },
        { address: addresses.ChainlinkPriceOracle as Address, abi: abis.ChainlinkPriceOracle as readonly any[], functionName: 'getAssetPrice', args: [asset] },
        { address: aiEngine, abi: abis.AIYieldEngine as readonly any[], functionName: 'getLatestPrediction', args: [asset] },
      ]
    }),
    query: { enabled: isConnected },
  })

  const [positions, setPositions] = useState<Position[]>([])
  const [tvl, setTvl] = useState(0)
  const [aiAPY, setAiAPY] = useState<number | null>(null)

  useEffect(() => {
    if (!queries.data) return

    const parsed: Position[] = []
    let totalTVL = 0
    let bestAiAPY = 0

    for (let i = 0; i < assetAddresses.length; i++) {
      const reserveResult = queries.data[i * 3]
      const priceResult = queries.data[i * 3 + 1]
      const predictionResult = queries.data[i * 3 + 2]
      const addr = assetAddresses[i]
      const meta = knownAssets[addr.toLowerCase()]

      if (reserveResult?.status === 'success' && reserveResult.result) {
        const r = reserveResult.result as any
        const [price] = priceResult?.status === 'success' ? (priceResult.result as [bigint, boolean]) : [0n, false]
        const priceNum = Number(price) / 1e8
        const supply = Number(formatUnits(r.totalSupply || 0n, meta.decimals))

        totalTVL += supply * priceNum

        parsed.push({
          asset: addr as Address,
          symbol: meta.symbol,
          decimals: meta.decimals,
          deposited: r.totalSupply || 0n,
          borrowed: r.totalBorrow || 0n,
          supplyRate: r.currentLiquidityRate || r.liquidityRate || 0n,
          borrowRate: r.currentVariableBorrowRate || r.variableBorrowRate || r.borrowRate || 0n,
          price: priceNum,
        })
      }

      // Extract AI-predicted APY from the AIYieldEngine
      if (predictionResult?.status === 'success' && predictionResult.result) {
        const prediction = predictionResult.result as any
        const predictedAPY = prediction.predictedAPY || prediction[1] || 0n
        const timestamp = prediction.timestamp || prediction[4] || 0n
        if (timestamp > 0n) {
          const apyPct = Number(BigInt(predictedAPY) * 10000n / RAY) / 100
          if (apyPct > bestAiAPY) bestAiAPY = apyPct
        }
      }
    }

    // Compute supply APY from utilization as fallback when on-chain rates are stale
    let computedAPY = 0
    for (const pos of parsed) {
      const apy = computeSupplyAPY(pos.deposited, pos.borrowed)
      if (apy > computedAPY) computedAPY = apy
    }

    setPositions(parsed)
    setTvl(totalTVL)
    setAiAPY(bestAiAPY > 0 ? bestAiAPY : computedAPY > 0 ? computedAPY : null)
  }, [queries.data])

  const hf = healthFactor ? Number(healthFactor) / 1e18 : 0
  const displayHF = hf > 100 ? 99.9 : hf

  // User balances from accountData
  const totalCollateralUSD = accountData ? Number((accountData as any).totalCollateralUSD || 0) / 1e8 : 0
  const totalDebtUSD = accountData ? Number((accountData as any).totalDebtUSD || 0) / 1e8 : 0
  const netWorth = totalCollateralUSD - totalDebtUSD

  // Best supply APY
  const bestAPY = positions.length > 0
    ? Math.max(...positions.map(p => Number(p.supplyRate * 10000n / RAY) / 100))
    : 0

  const isLoading = queries.isLoading

  return (
    <AppShell>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ marginBottom: 'var(--space-4)', padding: 'var(--space-2)', display: 'flex', flexDirection: 'column', gap: 8 }}
      >
        <h1 style={{ fontSize: 32, fontWeight: 800, color: 'var(--color-text-primary)', margin: 0, letterSpacing: '-0.04em' }}>
          Protocol overview & real-time analytics
        </h1>
      </motion.div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gridAutoRows: 'minmax(120px, auto)', gap: 'var(--space-2)', paddingBottom: 'var(--space-4)' }}>
        {/* Row 1: Quick Stats */}
        <div style={{ gridColumn: 'span 1' }}>
          <StatCard
            label="Protocol TVL"
            value={isLoading ? '...' : formatUSD(tvl)}
            icon={<Activity />}
          />
        </div>

        <MagicCard style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', justifyContent: 'center' }} gradientColor="rgba(16, 185, 129, 0.05)">
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <motion.span
                animate={{ scale: [1, 1.4, 1], opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                style={{ width: 8, height: 8, background: 'var(--color-success)', borderRadius: '50%' }}
              />
              AI-Orchestrated Net APY
            </div>
            <div style={{ fontSize: 48, fontWeight: 800, letterSpacing: '-0.04em', color: 'var(--color-text-primary)', lineHeight: 1 }}>
              {isLoading ? '...' : (aiAPY ?? bestAPY).toFixed(2)}<span style={{ fontSize: 24, fontWeight: 500, color: 'var(--color-text-tertiary)' }}>%</span>
            </div>
          </div>
        </MagicCard>

        <div style={{ gridColumn: 'span 1' }}>
          <StatCard
            label="My Balance"
            value={!isConnected ? '--' : isLoading ? '...' : formatUSD(netWorth)}
            icon={<Wallet />}
          />
        </div>

        {/* Row 2: Positions + Health */}
        <MagicCard style={{ gridColumn: 'span 3', gridRow: 'span 2' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-3)' }}>
            <h3 className="heading-sm" style={{ margin: 0, fontSize: 16 }}>Market Overview</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Total Supply</th>
                  <th>Supply APY</th>
                  <th>Total Borrow</th>
                  <th>Borrow APY</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>
                      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                      <p style={{ marginTop: 8, color: 'var(--color-text-secondary)', fontSize: 13 }}>Loading from chain...</p>
                    </td>
                  </tr>
                ) : positions.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>
                      No reserves initialized
                    </td>
                  </tr>
                ) : (
                  positions.map((pos) => (
                    <tr key={pos.asset}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600, fontSize: 13 }}>
                          <TokenIcon symbol={pos.symbol} size={20} />
                          {pos.symbol}
                        </div>
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 500 }}>
                        {formatUSD(Number(formatUnits(pos.deposited, pos.decimals)) * pos.price)}
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)' }}>
                        {pos.supplyRate > 0n
                          ? `${formatRay(pos.supplyRate)}%`
                          : `${computeSupplyAPY(pos.deposited, pos.borrowed).toFixed(2)}%`
                        }
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 500 }}>
                        {formatUSD(Number(formatUnits(pos.borrowed, pos.decimals)) * pos.price)}
                      </td>
                      <td style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-warning)' }}>
                        {formatRay(pos.borrowRate)}%
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </MagicCard>

        <MagicCard style={{ gridColumn: 'span 1', gridRow: 'span 2', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <HealthGauge value={isConnected && hf > 0 ? displayHF : 0} size={160} />
          <div style={{ marginTop: 24, padding: 12, borderRadius: 8, background: 'rgba(0,0,0,0.02)', border: '1px solid var(--color-border)', width: '100%' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 4 }}>AI Risk Guardian</div>
            <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', lineHeight: 1.4 }}>
              {isConnected && hf > 0
                ? <>Health Factor: <span style={{ color: hf > 2 ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 600 }}>{hf.toFixed(2)}</span></>
                : 'Connect wallet to view risk'
              }
            </div>
          </div>
        </MagicCard>

        {/* Row 3: Live Flows */}
        <div style={{ gridColumn: 'span 3' }}>
          <DataFlow />
        </div>

        <MagicCard style={{ gridColumn: 'span 1', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 8 }}>Top Performer</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--color-accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={16} color="var(--color-accent)" />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Anthropic</div>
              <div style={{ fontSize: 11, color: 'var(--color-success)' }}>
                {positions.length > 0 ? `+${(aiAPY ?? bestAPY).toFixed(1)}% APY` : 'Waiting for data'}
              </div>
            </div>
          </div>
        </MagicCard>
      </div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 1200px) {
          .app-shell > div > div {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 768px) {
          .app-shell > div > div {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
