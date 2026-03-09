'use client'

import { useState, useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { HealthGauge } from '@/components/ui/HealthGauge'
import { MagicCard } from '@/components/ui/MagicCard'
import { ArrowUpRight, Shield, RefreshCw, AlertTriangle, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { useTheme } from 'next-themes'
import { useAccount, useChainId, useReadContracts } from 'wagmi'
import { type Address, formatUnits, parseUnits } from 'viem'
import {
  useContractAddresses,
  useUserAccountData,
  useHealthFactor,
  useRepay,
  useApproveToken,
  useBorrow,
  useTokenBalance,
  useTokenAllowance,
} from '@/hooks/useContracts'
import { ActionModal } from '@/components/ui/ActionModal'
import { CONTRACT_ADDRESSES, SUPPORTED_CHAINS } from '@/lib/constants'
import abis from '@/lib/abi/abi.json'
import toast, { Toaster } from 'react-hot-toast'

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
  asset: Address
  symbol: string
  decimals: number
  totalSupply: bigint
  totalBorrow: bigint
  supplyRate: bigint
  borrowRate: bigint
  price: number
  liquidityIndex: bigint
  borrowIndex: bigint
}

export default function BorrowPage() {
  const { theme, resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'dark'
  const isLight = currentTheme === 'light'

  const { address: userAddress, isConnected } = useAccount()
  const chainId = useChainId()
  const addresses = useContractAddresses()
  const pool = addresses.LendingPool as Address

  const knownAssets = KNOWN_ASSETS[chainId] || KNOWN_ASSETS[SUPPORTED_CHAINS.sepolia]
  const assetAddresses = Object.keys(knownAssets).map(a => a as Address)

  // Modal state
  const [modalAction, setModalAction] = useState<'borrow' | 'repay' | null>(null)
  const [selectedAsset, setSelectedAsset] = useState<ReserveInfo | null>(null)
  const [amount, setAmount] = useState('')

  // Account data
  const { data: accountData } = useUserAccountData(userAddress)
  const { data: healthFactor } = useHealthFactor(userAddress)

  // Fetch reserve data for all known assets
  const reserveQueries = useReadContracts({
    contracts: assetAddresses.flatMap(asset => [
      { address: pool, abi: abis.LendingPool as readonly any[], functionName: 'getReserveData', args: [asset] },
      { address: addresses.ChainlinkPriceOracle as Address, abi: abis.ChainlinkPriceOracle as readonly any[], functionName: 'getAssetPrice', args: [asset] },
    ]),
    query: { enabled: isConnected },
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
          asset: addr as Address,
          symbol: meta.symbol,
          decimals: meta.decimals,
          totalSupply: r.totalSupply || 0n,
          totalBorrow: r.totalBorrow || 0n,
          supplyRate: r.currentLiquidityRate || r.liquidityRate || 0n,
          borrowRate: r.currentVariableBorrowRate || r.variableBorrowRate || r.borrowRate || 0n,
          price: Number(price) / 1e8,
          liquidityIndex: r.liquidityIndex || BigInt(1e27),
          borrowIndex: r.variableBorrowIndex || BigInt(1e27),
        })
      }
    }
    setReserves(parsed)
  }, [reserveQueries.data])

  // Fetch user positions via LendingPool.userReserves(user, asset)
  const userReserveQueries = useReadContracts({
    contracts: reserves.map(r => ({
      address: pool,
      abi: abis.LendingPool as readonly any[],
      functionName: 'userReserves',
      args: userAddress ? [userAddress, r.asset] : undefined,
    })),
    query: { enabled: isConnected && reserves.length > 0 && !!userAddress },
  })

  // Parse user positions: convert scaled balances to actual using indices
  const RAY = BigInt(1e27)
  const userPositions = reserves.map((r, i) => {
    const result = userReserveQueries.data?.[i]
    if (result?.status !== 'success' || !result.result) {
      return { ...r, aBalance: 0n, debtBalance: 0n }
    }
    const [scaledSupply, scaledBorrow] = result.result as [bigint, bigint, boolean]
    const aBalance = scaledSupply * r.liquidityIndex / RAY
    const debtBalance = scaledBorrow * r.borrowIndex / RAY
    return { ...r, aBalance, debtBalance }
  })

  const collateralPositions = userPositions.filter(p => p.aBalance > 0n)
  const borrowPositions = userPositions.filter(p => p.debtBalance > 0n)

  // Totals
  const totalCollateralUSD = accountData ? Number((accountData as any).totalCollateralUSD || 0) / 1e8 : 0
  const totalDebtUSD = accountData ? Number((accountData as any).totalDebtUSD || 0) / 1e8 : 0
  const borrowLimit = accountData ? Number((accountData as any).availableBorrowsUSD || 0) / 1e8 + totalDebtUSD : 0
  const utilization = borrowLimit > 0 ? (totalDebtUSD / borrowLimit) * 100 : 0
  const hf = healthFactor ? Number(healthFactor) / 1e18 : 0

  // Wallet balance for modal
  const { data: walletBalance } = useTokenBalance(selectedAsset?.asset, userAddress)
  const { data: allowance } = useTokenAllowance(selectedAsset?.asset, userAddress, pool)

  // Actions
  const { approve, isPending: approving, isSuccess: approved } = useApproveToken()
  const { repay, isPending: repaying, isSuccess: repaid, error: repayError } = useRepay()
  const { borrow, isPending: borrowing, isSuccess: borrowed, error: borrowError } = useBorrow()

  useEffect(() => {
    if (repaid) { toast.success('Repayment successful!'); setAmount(''); setModalAction(null); reserveQueries.refetch(); userReserveQueries.refetch() }
  }, [repaid])
  useEffect(() => {
    if (borrowed) { toast.success('Borrow successful!'); setAmount(''); setModalAction(null); reserveQueries.refetch(); userReserveQueries.refetch() }
  }, [borrowed])
  useEffect(() => { if (repayError) toast.error(`Repay failed: ${repayError.message.slice(0, 80)}`) }, [repayError])
  useEffect(() => { if (borrowError) toast.error(`Borrow failed: ${borrowError.message.slice(0, 80)}`) }, [borrowError])

  const handleAction = () => {
    if (!selectedAsset || !amount || !userAddress) return
    const parsedAmount = parseUnits(amount, selectedAsset.decimals)

    if (modalAction === 'repay') {
      if (allowance !== undefined && allowance < parsedAmount) {
        approve(selectedAsset.asset, pool, parsedAmount)
        toast('Approving token spend...', { icon: '\u23F3' })
        return
      }
      repay(selectedAsset.asset, parsedAmount, userAddress)
    } else {
      borrow(selectedAsset.asset, parsedAmount, userAddress)
    }
  }

  useEffect(() => {
    if (approved && selectedAsset && amount && userAddress && modalAction === 'repay') {
      const parsedAmount = parseUnits(amount, selectedAsset.decimals)
      repay(selectedAsset.asset, parsedAmount, userAddress)
    }
  }, [approved])

  const isLoading = reserveQueries.isLoading

  return (
    <AppShell>
      <Toaster position="top-right" />
      <motion.div
        initial="hidden" animate="visible"
        variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } }}
      >
        <motion.h2
          variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          className="heading-md" style={{ marginBottom: 'var(--space-8)', fontWeight: 700, letterSpacing: '-0.02em' }}
        >
          Borrowing Overview
        </motion.h2>

        {/* Borrow Capacity Card */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="card-glow"
          style={{ marginBottom: 'var(--space-8)', padding: '32px 40px', background: 'var(--color-surface-dark)', color: 'var(--color-text-primary)', position: 'relative', overflow: 'hidden' }}
        >
          <div style={{ position: 'absolute', top: '-50%', right: '-10%', width: '400px', height: '400px', background: 'radial-gradient(circle, rgba(8,71,247,0.1) 0%, transparent 70%)', filter: 'blur(40px)' }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-8)' }}>
            <div>
              <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'var(--color-primary-light)', textTransform: 'uppercase', letterSpacing: 1 }}>Borrow Capacity</p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '16px' }}>
                <span style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em', color: isLight ? 'var(--color-primary)' : 'inherit' }}>
                  {isConnected ? formatUSD(totalDebtUSD) : '--'}
                </span>
                <span style={{ fontSize: 18, color: 'var(--color-text-tertiary)', fontWeight: 500 }}>
                  of {isConnected ? formatUSD(borrowLimit) : '--'} limit
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: '0 0 12px', fontSize: 12, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 1 }}>Available to Borrow</p>
              <span style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-success)' }}>
                {isConnected ? formatUSD(Math.max(0, borrowLimit - totalDebtUSD)) : '--'}
              </span>
            </div>
          </div>

          <div style={{ width: '100%', height: 12, background: 'var(--overlay-light)', borderRadius: 6, overflow: 'hidden', marginBottom: 'var(--space-6)', border: '1px solid var(--overlay-light)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${utilization}%` }}
              transition={{ duration: 1.2, ease: 'circOut' }}
              style={{ height: '100%', background: 'linear-gradient(90deg, var(--color-primary), var(--color-primary-light))', boxShadow: '0 0 15px rgba(255, 0, 122, 0.4)', borderRadius: 6 }}
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
            {/* Active Borrowings */}
            <motion.div
              variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
              className="card-flat" style={{ padding: 0, overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Active Borrowings</h3>
                  <Badge variant="warning">{borrowPositions.length} Positions</Badge>
                </div>
                <Badge variant="accent" style={{ fontSize: 10, fontWeight: 700 }}>LIVE ON-CHAIN</Badge>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Debt</th>
                      <th>Value</th>
                      <th>Borrow APY</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>
                          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                        </td>
                      </tr>
                    ) : borrowPositions.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: 'center', padding: '64px 24px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                            <div>
                              <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--color-text-primary)' }}>No active borrowings yet</p>
                              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>Deposit assets to start earning and unlock your borrow capacity.</p>
                            </div>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      borrowPositions.map((pos) => {
                        const debtAmt = Number(formatUnits(pos.debtBalance, pos.decimals))
                        return (
                          <tr key={pos.asset}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <TokenIcon symbol={pos.symbol} size={32} />
                                <span style={{ fontWeight: 700, fontSize: 14 }}>{pos.symbol}</span>
                              </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{debtAmt.toFixed(4)}</td>
                            <td style={{ fontWeight: 600 }}>{formatUSD(debtAmt * pos.price)}</td>
                            <td><span style={{ color: 'var(--color-warning)', fontWeight: 700 }}>{formatRay(pos.borrowRate)}%</span></td>
                            <td>
                              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                <button
                                  className="btn btn-sm btn-secondary" style={{ borderRadius: 8 }}
                                  onClick={() => { setSelectedAsset(pos); setModalAction('repay') }}
                                >
                                  <RefreshCw size={14} /> Repay
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>

            {/* Collateral Assets */}
            <motion.div
              variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
              className="card-flat" style={{ padding: 0, overflow: 'hidden' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Collateral Assets</h3>
                  <Badge variant="success">{collateralPositions.length} Assets</Badge>
                </div>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Balance</th>
                      <th>Value</th>
                      <th>Supply APY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collateralPositions.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--color-text-secondary)' }}>
                          No collateral deposited
                        </td>
                      </tr>
                    ) : (
                      collateralPositions.map((pos) => {
                        const bal = Number(formatUnits(pos.aBalance, pos.decimals))
                        return (
                          <tr key={pos.asset}>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <TokenIcon symbol={pos.symbol} size={32} />
                                <span style={{ fontWeight: 700, fontSize: 14 }}>{pos.symbol}</span>
                              </div>
                            </td>
                            <td style={{ fontWeight: 600 }}>{bal.toFixed(4)}</td>
                            <td style={{ fontWeight: 600 }}>{formatUSD(bal * pos.price)}</td>
                            <td><span style={{ fontWeight: 600, color: 'var(--color-success)' }}>{formatRay(pos.supplyRate)}%</span></td>
                          </tr>
                        )
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>

          {/* Sidebar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            <MagicCard style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: 'var(--space-2)' }}>
              <p style={{ margin: 'var(--space-2) 0', fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Account Health Factor</p>
              <HealthGauge value={isConnected && hf > 0 ? (hf > 100 ? 99.9 : hf) : 0} size={160} />
              <p style={{ marginTop: '24px', fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, padding: '0 16px' }}>
                {isConnected && hf > 0
                  ? <>Health Factor: <span style={{ color: hf > 2 ? 'var(--color-success)' : 'var(--color-warning)', fontWeight: 600 }}>{hf.toFixed(2)}</span></>
                  : 'Connect wallet to view health'
                }
              </p>
            </MagicCard>

            <motion.div
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              style={{ padding: 24, borderRadius: 'var(--radius-lg)', background: 'rgba(255, 0, 122, 0.03)', border: '1px dashed var(--color-primary-muted)' }}
            >
              <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--color-text-primary)' }}>Did you know?</h4>
              <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
                You can increase your borrow limit by supplying yield-bearing assets from the <strong style={{ color: 'var(--color-primary)' }}>AI Yield</strong> pool.
              </p>
            </motion.div>
          </div>
        </div>
      </motion.div>

      {/* Borrow / Repay Modal */}
      <ActionModal
        isOpen={!!modalAction && !!selectedAsset}
        onClose={() => { setModalAction(null); setAmount('') }}
        title={modalAction === 'repay' ? `Repay ${selectedAsset?.symbol}` : `Borrow ${selectedAsset?.symbol}`}
      >
        {selectedAsset && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <TokenIcon symbol={selectedAsset.symbol} size={44} />
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{selectedAsset.symbol}</h3>
                <p className="text-caption" style={{ margin: 0 }}>
                  Borrow APY: {formatRay(selectedAsset.borrowRate)}%
                </p>
              </div>
            </div>

            <div>
              <label className="text-label" style={{ display: 'block', marginBottom: 8 }}>
                {modalAction === 'repay' ? 'Repay' : 'Borrow'} Amount
              </label>
              <input
                className="input"
                type="text"
                placeholder={`Enter ${selectedAsset.symbol} amount`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              {walletBalance !== undefined && modalAction === 'repay' && (
                <p className="text-caption" style={{ margin: '4px 0 0' }}>
                  Wallet Balance: {Number(formatUnits(walletBalance, selectedAsset.decimals)).toFixed(4)} {selectedAsset.symbol}
                  <button
                    onClick={() => setAmount(formatUnits(walletBalance, selectedAsset.decimals))}
                    style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    MAX
                  </button>
                </p>
              )}
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleAction}
              disabled={!isConnected || !amount || repaying || borrowing || approving}
            >
              {!isConnected ? 'Connect Wallet' :
                approving ? 'Approving...' :
                repaying || borrowing ? 'Confirming...' :
                modalAction === 'repay' ? `Repay ${selectedAsset.symbol}` : `Borrow ${selectedAsset.symbol}`}
            </button>
          </div>
        )}
      </ActionModal>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 1024px) {
          .borrow-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
