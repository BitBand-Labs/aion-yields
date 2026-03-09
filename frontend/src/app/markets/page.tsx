'use client'

import React, { useState, useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import { ActionModal } from '@/components/ui/ActionModal'
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Globe, Loader2, RefreshCw, ArrowRightLeft } from 'lucide-react'
import { motion } from 'framer-motion'
import { TokenIcon } from '@/components/ui/TokenIcon'
import { useAccount, useChainId, useReadContract, useReadContracts } from 'wagmi'
import { type Address, formatUnits, parseUnits, erc20Abi } from 'viem'
import {
  useContractAddresses,
  useDeposit,
  useWithdraw,
  useBorrow,
  useRepay,
  useApproveToken,
  useTokenBalance,
  useTokenAllowance,
  useCrossChainDeposit,
} from '@/hooks/useContracts'
import { CONTRACT_ADDRESSES, SUPPORTED_CHAINS, BLOCKCHAIN_IDS } from '@/lib/constants'
import abis from '@/lib/abi/abi.json'
import toast, { Toaster } from 'react-hot-toast'

// Known assets per chain (address => metadata)
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
  // Convert RAY (1e27) to percentage
  const pct = Number(value * 10000n / RAY) / 100
  return pct.toFixed(2)
}

function formatUSD(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}k`
  return `$${value.toFixed(2)}`
}

interface MarketData {
  address: Address
  symbol: string
  decimals: number
  totalSupply: bigint
  totalBorrow: bigint
  liquidityRate: bigint
  borrowRate: bigint
  price: bigint
  priceValid: boolean
  liquidityIndex: bigint
  borrowIndex: bigint
}

export default function MarketsPage() {
  const { address: userAddress, isConnected } = useAccount()
  const chainId = useChainId()
  const addresses = useContractAddresses()
  const pool = addresses.LendingPool as Address

  const [selectedMarket, setSelectedMarket] = useState<MarketData | null>(null)
  const [actionType, setActionType] = useState<'supply' | 'withdraw' | 'borrow' | 'repay' | 'crosschain'>('supply')
  const [amount, setAmount] = useState('')
  const [markets, setMarkets] = useState<MarketData[]>([])

  // Avalanche Teleporter destination chains
  const DEST_CHAINS: Record<string, { name: string; blockchainID: `0x${string}` }> = {
    avalancheFuji: { name: 'Avalanche Fuji', blockchainID: BLOCKCHAIN_IDS.avalancheFuji },
    sepolia: { name: 'Ethereum Sepolia', blockchainID: BLOCKCHAIN_IDS.sepolia },
  }

  // Determine destination chain (opposite of current)
  const currentChainIsSepolia = chainId === 11155111
  const destChain = currentChainIsSepolia ? DEST_CHAINS.avalancheFuji : DEST_CHAINS.sepolia
  const destChainName = destChain.name

  // Get reserves count
  const { data: reservesCount } = useReadContract({
    address: pool,
    abi: abis.LendingPool,
    functionName: 'getReservesCount',
  })

  // Build asset list from known assets
  const knownAssets = KNOWN_ASSETS[chainId] || KNOWN_ASSETS[SUPPORTED_CHAINS.sepolia]
  const assetAddresses = Object.keys(knownAssets).map(a => a as Address)

  // Fetch reserve data for all known assets
  const reserveQueries = useReadContracts({
    contracts: assetAddresses.flatMap(asset => [
      {
        address: pool,
        abi: abis.LendingPool as readonly any[],
        functionName: 'getReserveData',
        args: [asset],
      },
      {
        address: addresses.ChainlinkPriceOracle as Address,
        abi: abis.ChainlinkPriceOracle as readonly any[],
        functionName: 'getAssetPrice',
        args: [asset],
      },
    ]),
  })

  useEffect(() => {
    if (!reserveQueries.data) return

    const parsed: MarketData[] = []
    for (let i = 0; i < assetAddresses.length; i++) {
      const reserveResult = reserveQueries.data[i * 2]
      const priceResult = reserveQueries.data[i * 2 + 1]
      const addr = assetAddresses[i]
      const meta = knownAssets[addr.toLowerCase()]

      if (reserveResult?.status === 'success' && reserveResult.result) {
        const r = reserveResult.result as any
        const [price, priceValid] = priceResult?.status === 'success' ? (priceResult.result as [bigint, boolean]) : [0n, false]

        parsed.push({
          address: addr as Address,
          symbol: meta?.symbol || 'Unknown',
          decimals: meta?.decimals || 18,
          totalSupply: r.totalSupply || 0n,
          totalBorrow: r.totalBorrow || 0n,
          liquidityRate: r.currentLiquidityRate || r.liquidityRate || 0n,
          borrowRate: r.currentVariableBorrowRate || r.variableBorrowRate || r.borrowRate || 0n,
          price: price as bigint,
          priceValid: priceValid as boolean,
          liquidityIndex: r.liquidityIndex || BigInt(1e27),
          borrowIndex: r.variableBorrowIndex || BigInt(1e27),
        })
      }
    }
    setMarkets(parsed)
  }, [reserveQueries.data])

  // Wallet balance for selected asset
  const { data: walletBalance } = useTokenBalance(
    selectedMarket?.address,
    userAddress
  )

  // Allowance check (for pool)
  const { data: allowance } = useTokenAllowance(
    selectedMarket?.address,
    userAddress,
    pool
  )

  // Allowance check (for CrossChainVault)
  const crossChainVault = (addresses as any).CrossChainVault as Address
  const { data: allowanceCrossChain } = useTokenAllowance(
    selectedMarket?.address,
    userAddress,
    crossChainVault
  )

  // User's position data from LendingPool.userReserves(user, asset)
  const { data: userReserveData } = useReadContract({
    address: pool,
    abi: abis.LendingPool as readonly any[],
    functionName: 'userReserves',
    args: userAddress && selectedMarket ? [userAddress, selectedMarket.address] : undefined,
    query: { enabled: !!userAddress && !!selectedMarket },
  })

  // Convert scaled balances to actual using indices from reserve data
  const userSupplyBalance = (() => {
    if (!userReserveData || !selectedMarket) return 0n
    const [scaledSupply] = userReserveData as [bigint, bigint, boolean]
    return scaledSupply * selectedMarket.liquidityIndex / BigInt(1e27)
  })()

  const userBorrowBalance = (() => {
    if (!userReserveData || !selectedMarket) return 0n
    const [, scaledBorrow] = userReserveData as [bigint, bigint, boolean]
    return scaledBorrow * selectedMarket.borrowIndex / BigInt(1e27)
  })()

  // Actions
  const { approve, isPending: approving, isSuccess: approved } = useApproveToken()
  const { deposit, isPending: depositing, isSuccess: deposited, error: depositError } = useDeposit()
  const { withdraw, isPending: withdrawing, isSuccess: withdrawn, error: withdrawError } = useWithdraw()
  const { borrow, isPending: borrowing, isSuccess: borrowed, error: borrowError } = useBorrow()
  const { repay, isPending: repaying, isSuccess: repaid, error: repayError } = useRepay()
  const { depositCrossChain, isPending: crossChaining, isSuccess: crossChained, error: crossChainError } = useCrossChainDeposit()

  useEffect(() => {
    if (deposited) {
      toast.success('Deposit successful!')
      setAmount('')
      setSelectedMarket(null)
      reserveQueries.refetch()
    }
  }, [deposited])

  useEffect(() => {
    if (withdrawn) {
      toast.success('Withdrawal successful!')
      setAmount('')
      setSelectedMarket(null)
      reserveQueries.refetch()
    }
  }, [withdrawn])

  useEffect(() => {
    if (borrowed) {
      toast.success('Borrow successful!')
      setAmount('')
      setSelectedMarket(null)
      reserveQueries.refetch()
    }
  }, [borrowed])

  useEffect(() => {
    if (repaid) {
      toast.success('Repayment successful!')
      setAmount('')
      setSelectedMarket(null)
      reserveQueries.refetch()
    }
  }, [repaid])

  useEffect(() => {
    if (depositError) toast.error(`Deposit failed: ${depositError.message.slice(0, 80)}`)
  }, [depositError])

  useEffect(() => {
    if (withdrawError) toast.error(`Withdraw failed: ${withdrawError.message.slice(0, 80)}`)
  }, [withdrawError])

  useEffect(() => {
    if (borrowError) toast.error(`Borrow failed: ${borrowError.message.slice(0, 80)}`)
  }, [borrowError])

  useEffect(() => {
    if (repayError) toast.error(`Repay failed: ${repayError.message.slice(0, 80)}`)
  }, [repayError])

  useEffect(() => {
    if (crossChained) {
      toast.success(`Cross-chain deposit sent to ${destChainName}! Teleporter message in transit.`)
      setAmount('')
      setSelectedMarket(null)
    }
  }, [crossChained])

  useEffect(() => {
    if (crossChainError) toast.error(`Cross-chain failed: ${crossChainError.message.slice(0, 80)}`)
  }, [crossChainError])

  const handleAction = () => {
    if (!selectedMarket || !amount || !userAddress) return
    const parsedAmount = parseUnits(amount, selectedMarket.decimals)

    if (actionType === 'crosschain') {
      const crossChainVault = (addresses as any).CrossChainVault as Address
      // Need approval to the CrossChainVault (not the pool)
      if (allowanceCrossChain !== undefined && allowanceCrossChain < parsedAmount) {
        approve(selectedMarket.address, crossChainVault, parsedAmount)
        toast('Approving CrossChainVault spend...', { icon: '⏳' })
        return
      }
      // Destination vault on the other chain
      const destAddresses = currentChainIsSepolia
        ? CONTRACT_ADDRESSES[SUPPORTED_CHAINS.avalancheFuji]
        : CONTRACT_ADDRESSES[SUPPORTED_CHAINS.sepolia]
      const destVault = (destAddresses as any).CrossChainVault as Address
      depositCrossChain(destChain.blockchainID, destVault, selectedMarket.address, parsedAmount)
      return
    }

    if (actionType === 'supply') {
      if (allowance !== undefined && allowance < parsedAmount) {
        approve(selectedMarket.address, pool, parsedAmount)
        toast('Approving token spend...', { icon: '⏳' })
        return
      }
      deposit(selectedMarket.address, parsedAmount, userAddress)
    } else if (actionType === 'withdraw') {
      withdraw(selectedMarket.address, parsedAmount, userAddress)
    } else if (actionType === 'borrow') {
      borrow(selectedMarket.address, parsedAmount, userAddress)
    } else if (actionType === 'repay') {
      if (allowance !== undefined && allowance < parsedAmount) {
        approve(selectedMarket.address, pool, parsedAmount)
        toast('Approving token spend...', { icon: '⏳' })
        return
      }
      repay(selectedMarket.address, parsedAmount, userAddress)
    }
  }

  // Approve callback: after approval succeeds, do the action
  useEffect(() => {
    if (approved && selectedMarket && amount && userAddress) {
      const parsedAmount = parseUnits(amount, selectedMarket.decimals)
      if (actionType === 'crosschain') {
        const destAddresses = currentChainIsSepolia
          ? CONTRACT_ADDRESSES[SUPPORTED_CHAINS.avalancheFuji]
          : CONTRACT_ADDRESSES[SUPPORTED_CHAINS.sepolia]
        const destVault = (destAddresses as any).CrossChainVault as Address
        depositCrossChain(destChain.blockchainID, destVault, selectedMarket.address, parsedAmount)
      } else if (actionType === 'supply') {
        deposit(selectedMarket.address, parsedAmount, userAddress)
      } else if (actionType === 'repay') {
        repay(selectedMarket.address, parsedAmount, userAddress)
      }
    }
  }, [approved])

  // Compute summary stats
  const totalSupplyUSD = markets.reduce((acc, m) => {
    const price = Number(m.price) / 1e8
    const supply = Number(formatUnits(m.totalSupply, m.decimals))
    return acc + supply * price
  }, 0)

  const totalBorrowUSD = markets.reduce((acc, m) => {
    const price = Number(m.price) / 1e8
    const borrow = Number(formatUnits(m.totalBorrow, m.decimals))
    return acc + borrow * price
  }, 0)

  const avgUtilization = markets.length > 0
    ? markets.reduce((acc, m) => {
        const supply = Number(m.totalSupply)
        const borrow = Number(m.totalBorrow)
        return acc + (supply > 0 ? (borrow / supply) * 100 : 0)
      }, 0) / markets.length
    : 0

  const isLoading = reserveQueries.isLoading

  return (
    <AppShell>
      <Toaster position="top-right" />
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.1 } }
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
              Real-time liquidity monitoring
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: isConnected ? 'var(--color-success-muted)' : 'var(--color-warning-muted)', color: isConnected ? 'var(--color-success)' : 'var(--color-warning)', fontSize: 13, fontWeight: 600 }}>
              <Globe size={14} /> {isConnected ? 'Connected' : 'Not Connected'}
            </div>
          </div>
        </motion.div>

        {/* Summary row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }}>
          {[
            { label: 'Total Markets', value: isLoading ? '...' : String(markets.length) },
            { label: 'Total Supply', value: isLoading ? '...' : formatUSD(totalSupplyUSD) },
            { label: 'Total Borrow', value: isLoading ? '...' : formatUSD(totalBorrowUSD) },
            { label: 'Avg Utilization', value: isLoading ? '...' : `${avgUtilization.toFixed(1)}%` },
          ].map((stat) => (
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
                {isLoading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                      <p style={{ marginTop: 8, color: 'var(--color-text-secondary)' }}>Loading markets from chain...</p>
                    </td>
                  </tr>
                ) : markets.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: 40 }}>
                      <p style={{ color: 'var(--color-text-secondary)' }}>No markets initialized yet. Deploy and initialize reserves first.</p>
                    </td>
                  </tr>
                ) : (
                  markets.map((market) => {
                    const price = Number(market.price) / 1e8
                    const supplyAmt = Number(formatUnits(market.totalSupply, market.decimals))
                    const borrowAmt = Number(formatUnits(market.totalBorrow, market.decimals))
                    const util = supplyAmt > 0 ? (borrowAmt / supplyAmt) * 100 : 0

                    return (
                      <tr key={market.address} style={{ cursor: 'pointer' }} onClick={() => { setSelectedMarket(market); setActionType('supply') }}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <TokenIcon symbol={market.symbol} size={36} />
                            <div>
                              <p style={{ fontWeight: 600, margin: '0 0 2px', fontSize: 14 }}>{market.symbol}</p>
                            </div>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
                          {market.priceValid ? `$${price.toFixed(2)}` : 'N/A'}
                        </td>
                        <td>
                          <span style={{ color: 'var(--color-success)', fontWeight: 700, fontSize: 14 }}>
                            {formatRay(market.liquidityRate)}%
                          </span>
                        </td>
                        <td>
                          <span style={{ color: 'var(--color-warning)', fontWeight: 700, fontSize: 14 }}>
                            {formatRay(market.borrowRate)}%
                          </span>
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                          {formatUSD(supplyAmt * price)}
                        </td>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--color-text-secondary)', fontWeight: 500 }}>
                          {formatUSD(borrowAmt * price)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ width: 48, height: 6, background: 'var(--color-bg)', borderRadius: 3, overflow: 'hidden' }}>
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${util}%` }}
                                transition={{ duration: 1, ease: 'easeOut' }}
                                style={{
                                  height: '100%',
                                  background: util > 80 ? 'var(--color-error)' : util > 60 ? 'var(--color-warning)' : 'var(--color-primary)',
                                  borderRadius: 3,
                                }}
                              />
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                              {util.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                            <button
                              className="btn btn-sm btn-primary"
                              style={{ borderRadius: 8, padding: '0 12px' }}
                              onClick={(e) => { e.stopPropagation(); setSelectedMarket(market); setActionType('supply') }}
                            >
                              Supply
                            </button>
                            <button
                              className="btn btn-sm btn-secondary"
                              style={{ borderRadius: 8, padding: '0 12px' }}
                              onClick={(e) => { e.stopPropagation(); setSelectedMarket(market); setActionType('borrow') }}
                            >
                              Borrow
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
      </motion.div>

      {/* Action Modal */}
      <ActionModal
        isOpen={!!selectedMarket}
        onClose={() => { setSelectedMarket(null); setAmount('') }}
        title={selectedMarket ? (actionType === 'crosschain' ? `Cross-Chain ${selectedMarket.symbol}` : `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} ${selectedMarket.symbol}`) : ''}
      >
        {selectedMarket && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <TokenIcon symbol={selectedMarket.symbol} size={44} />
              <div>
                <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>{selectedMarket.symbol}</h3>
                <p className="text-caption" style={{ margin: 0 }}>
                  {selectedMarket.priceValid ? `$${(Number(selectedMarket.price) / 1e8).toFixed(2)}` : 'Price N/A'}
                </p>
              </div>
              <Badge variant="success" dot>Active</Badge>
            </div>

            {/* Market stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[
                { label: 'Supply APY', value: `${formatRay(selectedMarket.liquidityRate)}%`, color: 'var(--color-success)' },
                { label: 'Borrow APY', value: `${formatRay(selectedMarket.borrowRate)}%`, color: 'var(--color-warning)' },
                { label: 'Your Deposits', value: userSupplyBalance > 0n ? `${Number(formatUnits(userSupplyBalance, selectedMarket.decimals)).toFixed(2)} ${selectedMarket.symbol}` : '0', color: 'var(--color-primary)' },
                { label: 'Your Debt', value: userBorrowBalance > 0n ? `${Number(formatUnits(userBorrowBalance, selectedMarket.decimals)).toFixed(2)} ${selectedMarket.symbol}` : '0', color: 'var(--color-warning)' },
              ].map((stat) => (
                <div key={stat.label} style={{ padding: '12px 16px', background: 'var(--color-bg)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--color-border)' }}>
                  <p className="text-caption" style={{ margin: '0 0 4px' }}>{stat.label}</p>
                  <p style={{ fontSize: 16, fontWeight: 600, margin: 0, color: stat.color }}>{stat.value}</p>
                </div>
              ))}
            </div>

            {/* 5-way Toggle */}
            <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--color-border)' }}>
              {(['supply', 'withdraw', 'borrow', 'repay', 'crosschain'] as const).map((action) => (
                <button
                  key={action}
                  onClick={() => setActionType(action)}
                  style={{
                    flex: 1, padding: '10px 4px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: 11,
                    background: actionType === action
                      ? action === 'crosschain' ? 'var(--color-accent, var(--color-primary))' : 'var(--color-primary)'
                      : 'var(--color-bg)',
                    color: actionType === action ? '#fff' : 'var(--color-text-secondary)',
                    transition: 'all 0.15s',
                  }}
                >
                  {action === 'crosschain' ? 'Cross-Chain' : action.charAt(0).toUpperCase() + action.slice(1)}
                </button>
              ))}
            </div>

            {/* Cross-chain info banner */}
            {actionType === 'crosschain' && (
              <div style={{
                padding: '12px 16px',
                background: 'var(--color-surface-raised, var(--color-bg))',
                borderRadius: 8,
                border: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}>
                <ArrowRightLeft size={18} style={{ color: 'var(--color-primary-light, var(--color-primary))', flexShrink: 0 }} />
                <div>
                  <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
                    Avalanche Warp Messaging
                  </p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
                    Deposit {selectedMarket.symbol} on {currentChainIsSepolia ? 'Sepolia' : 'Fuji'} → credited on {destChainName} LendingPool via Teleporter
                  </p>
                </div>
              </div>
            )}

            {/* Amount input */}
            <div>
              <label className="text-label" style={{ display: 'block', marginBottom: 8 }}>
                {actionType.charAt(0).toUpperCase() + actionType.slice(1)} Amount
              </label>
              <input
                className="input"
                type="text"
                placeholder={`Enter ${selectedMarket.symbol} amount`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                {walletBalance !== undefined && (
                  <p className="text-caption" style={{ margin: 0 }}>
                    Wallet: {Number(formatUnits(walletBalance, selectedMarket.decimals)).toFixed(4)} {selectedMarket.symbol}
                    {(actionType === 'supply' || actionType === 'repay') && (
                      <button
                        onClick={() => {
                          if (actionType === 'repay' && userBorrowBalance > 0n) {
                            const debt = Number(formatUnits(userBorrowBalance, selectedMarket.decimals))
                            const wallet = Number(formatUnits(walletBalance, selectedMarket.decimals))
                            setAmount(String(Math.min(debt, wallet)))
                          } else {
                            setAmount(formatUnits(walletBalance, selectedMarket.decimals))
                          }
                        }}
                        style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                      >
                        MAX
                      </button>
                    )}
                  </p>
                )}
                {actionType === 'withdraw' && userSupplyBalance > 0n && (
                  <p className="text-caption" style={{ margin: 0 }}>
                    Deposited: {Number(formatUnits(userSupplyBalance, selectedMarket.decimals)).toFixed(4)}
                    <button
                      onClick={() => setAmount(formatUnits(userSupplyBalance, selectedMarket.decimals))}
                      style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                    >
                      MAX
                    </button>
                  </p>
                )}
              </div>
            </div>

            <button
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={handleAction}
              disabled={!isConnected || !amount || depositing || withdrawing || borrowing || repaying || approving || crossChaining}
            >
              {!isConnected ? 'Connect Wallet' :
                approving ? 'Approving...' :
                crossChaining ? 'Sending via Teleporter...' :
                depositing || withdrawing || borrowing || repaying ? 'Confirming...' :
                actionType === 'crosschain' ? `Cross-Chain Deposit to ${destChainName}` :
                `${actionType.charAt(0).toUpperCase() + actionType.slice(1)} ${selectedMarket.symbol}`}
            </button>
          </div>
        )}
      </ActionModal>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </AppShell>
  )
}
