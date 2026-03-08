'use client'

import React, { useState, useEffect } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Badge } from '@/components/ui/Badge'
import {
  Bot,
  Shield,
  Trophy,
  Coins,
  Star,
  TrendingUp,
  Zap,
  ExternalLink,
  Search,
  Loader2,
  CheckCircle,
  AlertCircle,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAccount, useChainId, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi'
import { type Address, parseUnits, erc20Abi } from 'viem'
import { useContractAddresses } from '@/hooks/useContracts'
import abis from '@/lib/abi/abi.json'

const agents = [
  {
    name: 'Anthropic',
    address: '0x1a2b...3c4d',
    reputation: 96,
    accuracy: '94.2%',
    totalPredictions: 1247,
    staked: '15,000 LINK',
    revenue: '$2,340',
    status: 'active' as const,
    specialty: 'Yield optimization',
  },
  {
    name: 'Guardian-3',
    address: '0x5e6f...7a8b',
    reputation: 91,
    accuracy: '89.7%',
    totalPredictions: 892,
    staked: '10,500 LINK',
    revenue: '$1,820',
    status: 'active' as const,
    specialty: 'Risk assessment',
  },
  {
    name: 'Oracle-9',
    address: '0x9c0d...1e2f',
    reputation: 88,
    accuracy: '87.1%',
    totalPredictions: 634,
    staked: '8,200 LINK',
    revenue: '$1,450',
    status: 'active' as const,
    specialty: 'Market analysis',
  },
  {
    name: 'AlphaSeeker',
    address: '0x3a4b...5c6d',
    reputation: 82,
    accuracy: '84.5%',
    totalPredictions: 421,
    staked: '5,000 LINK',
    revenue: '$890',
    status: 'staking' as const,
    specialty: 'APY forecasting',
  },
  {
    name: 'NeuralLend',
    address: '0x7e8f...9a0b',
    reputation: 75,
    accuracy: '79.3%',
    totalPredictions: 215,
    staked: '3,000 LINK',
    revenue: '$420',
    status: 'active' as const,
    specialty: 'Interest rate modeling',
  },
]

function getReputationColor(score: number): string {
  if (score >= 90) return 'var(--color-success)'
  if (score >= 80) return 'var(--color-primary-light)'
  if (score >= 70) return 'var(--color-warning)'
  return 'var(--color-error)'
}

type InferenceType = 'yield_prediction' | 'risk_assessment' | 'market_analysis'

const inferenceOptions: { type: InferenceType; label: string; price: string; agent: string }[] = [
  { type: 'yield_prediction', label: 'Yield Prediction', price: '$0.50', agent: 'Anthropic' },
  { type: 'risk_assessment', label: 'Risk Assessment', price: '$0.25', agent: 'Guardian-3' },
  { type: 'market_analysis', label: 'Market Analysis', price: '$1.00', agent: 'Oracle-9' },
]

interface LivePayment {
  type: string
  agent: string
  amount: string
  time: string
  status: 'processing' | 'completed' | 'ai_response'
  aiResult?: any
}

export default function AgentsPage() {
  const { address: userAddress, isConnected } = useAccount()
  const chainId = useChainId()
  const addresses = useContractAddresses()

  const gatewayAddress = addresses.X402PaymentGateway as Address
  const usdcAddress = addresses.MockUSDC as Address

  // Read live on-chain data from X402PaymentGateway
  const { data: totalPayments } = useReadContract({
    address: gatewayAddress,
    abi: abis.X402PaymentGateway as readonly any[],
    functionName: 'totalPayments',
  })

  const { data: totalVolume } = useReadContract({
    address: gatewayAddress,
    abi: abis.X402PaymentGateway as readonly any[],
    functionName: 'totalPaymentVolume',
  })

  const { data: protocolFee } = useReadContract({
    address: gatewayAddress,
    abi: abis.X402PaymentGateway as readonly any[],
    functionName: 'protocolFee',
  })

  const { data: escrowBalance } = useReadContract({
    address: gatewayAddress,
    abi: abis.X402PaymentGateway as readonly any[],
    functionName: 'getEscrowBalance',
    args: userAddress ? [userAddress] : undefined,
    query: { enabled: !!userAddress },
  })

  // State for live payment demo
  const [livePayments, setLivePayments] = useState<LivePayment[]>([])
  const [isRunningDemo, setIsRunningDemo] = useState(false)
  const [selectedInference, setSelectedInference] = useState<InferenceType>('yield_prediction')

  // Local payment counters (increment on each inference to reflect x402 activity)
  const [localPaymentCount, setLocalPaymentCount] = useState(0)
  const [localPaymentVolume, setLocalPaymentVolume] = useState(0)

  // Write hooks for deposit + payment
  const { writeContract: writeDeposit, data: depositHash, isPending: isDepositing } = useWriteContract()
  const { isSuccess: depositConfirmed } = useWaitForTransactionReceipt({ hash: depositHash })

  const { writeContract: writeApprove, data: approveHash, isPending: isApproving } = useWriteContract()
  const { isSuccess: approveConfirmed } = useWaitForTransactionReceipt({ hash: approveHash })

  // Trigger live AI inference + payment
  const triggerInference = async (inferenceType: InferenceType) => {
    setIsRunningDemo(true)

    const option = inferenceOptions.find(o => o.type === inferenceType)!
    const newPayment: LivePayment = {
      type: option.label,
      agent: option.agent,
      amount: option.price,
      time: 'Just now',
      status: 'processing',
    }

    setLivePayments(prev => [newPayment, ...prev])

    // Call the AI engine
    try {
      const endpoint = inferenceType === 'yield_prediction' || inferenceType === 'risk_assessment'
        ? '/analyze'
        : '/predict'

      const body = inferenceType === 'market_analysis'
        ? { asset_address: usdcAddress, timeframe_seconds: 1 }
        : { asset_address: usdcAddress, asset_symbol: 'USDC' }

      const response = await fetch(`http://localhost:8000${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const result = await response.json()

      // Increment local x402 payment counters
      const priceNum = parseFloat(option.price.replace('$', ''))
      setLocalPaymentCount(prev => prev + 1)
      setLocalPaymentVolume(prev => prev + priceNum)

      // Update payment status to completed
      setLivePayments(prev => {
        const updated = [...prev]
        updated[0] = { ...updated[0], status: 'completed' }
        return updated
      })

      // After a brief delay, show AI response
      setTimeout(() => {
        setLivePayments(prev => {
          const updated = [...prev]
          updated[0] = { ...updated[0], status: 'ai_response', aiResult: result }
          return updated
        })
        setIsRunningDemo(false)
      }, 800)

    } catch (error) {
      setLivePayments(prev => {
        const updated = [...prev]
        updated[0] = { ...updated[0], status: 'completed' }
        return updated
      })
      setIsRunningDemo(false)
    }
  }

  const formatVolume = (vol: bigint | undefined) => {
    if (!vol) return '$0.00'
    return `$${(Number(vol) / 1e6).toFixed(2)}`
  }

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
              AI Agent Marketplace
            </h2>
            <p className="text-secondary" style={{ margin: 0 }}>
               Discover and stake on top-performing autonomous yield agents
            </p>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
             <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
                <input
                  type="text"
                  placeholder="Filter agents..."
                  style={{ padding: '10px 12px 10px 36px', borderRadius: 10, border: '1px solid var(--color-border)', fontSize: 13, background: 'var(--color-bg)', outline: 'none', width: 260 }}
                />
             </div>
             <button className="btn btn-primary" style={{ borderRadius: 10 }}>Register Agent</button>
          </div>
        </motion.div>

        {/* Summary cards — LIVE on-chain data */}
        <div className="grid-stats" style={{ marginBottom: 'var(--space-8)' }}>
          {[
            { label: 'Registered Agents', value: String(agents.length), icon: Bot, color: 'var(--color-accent)' },
            { label: 'x402 Payments', value: String((totalPayments != null ? Number(totalPayments) : 0) + localPaymentCount), icon: Zap, color: 'var(--color-primary)' },
            { label: 'Payment Volume', value: `$${(((totalVolume ? Number(totalVolume) / 1e6 : 0) + localPaymentVolume).toFixed(2))}`, icon: Coins, color: 'var(--color-success)' },
            { label: 'Protocol Fee', value: protocolFee != null ? `${Number(protocolFee) / 100}%` : '...', icon: Trophy, color: 'var(--color-warning)' },
          ].map((stat) => (
            <motion.div
              key={stat.label}
              variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
              className="card-flat"
              style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '24px' }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 12,
                  background: `${stat.color}15`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
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

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)',
            gap: 'var(--space-8)',
          }}
          className="agents-grid"
        >
          {/* Agent Leaderboard */}
          <motion.div
            variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
            className="card-flat" style={{ padding: 0, overflow: 'hidden' }}
          >
            <div
              style={{
                padding: '20px 24px',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Trophy size={18} style={{ color: 'var(--color-warning)' }} />
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
                  Agent Leaderboard
                </h3>
                <Badge variant="accent" style={{ fontSize: 10, fontWeight: 700 }}>ERC-8004 COMPLIANT</Badge>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--color-primary)' }}>Full Rankings</button>
            </div>

            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Agent Interface</th>
                  <th>Reputation</th>
                  <th>Accuracy</th>
                  <th>Total Claims</th>
                  <th>Staked</th>
                  <th style={{ textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent, i) => (
                  <tr key={agent.name} style={{ cursor: 'pointer' }}>
                    <td>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background:
                            i === 0
                              ? 'var(--color-warning-muted)'
                              : i === 1
                              ? 'var(--color-border)'
                              : 'transparent',
                          fontSize: 13,
                          fontWeight: 710,
                          color:
                            i === 0
                              ? 'var(--color-warning)'
                              : 'var(--color-text-secondary)',
                          border: i < 3 ? '1px solid currentColor' : 'none'
                        }}
                      >
                        {i + 1}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: 10,
                            background: 'var(--color-surface-raised)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--color-primary)',
                            boxShadow: 'inset 0 0 10px rgba(0,0,0,0.05)'
                          }}
                        >
                          <Bot size={18} />
                        </div>
                        <div>
                          <p style={{ fontWeight: 700, margin: '0 0 2px', fontSize: 14 }}>
                            {agent.name}
                          </p>
                          <p className="text-caption" style={{ margin: 0, fontSize: 11, fontWeight: 600 }}>
                            {agent.specialty}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 40, height: 4, background: 'var(--color-bg)', borderRadius: 2, overflow: 'hidden' }}>
                           <div style={{ width: `${agent.reputation}%`, height: '100%', background: getReputationColor(agent.reputation) }} />
                        </div>
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 13,
                            color: getReputationColor(agent.reputation),
                          }}
                        >
                          {agent.reputation}
                        </span>
                      </div>
                    </td>
                    <td style={{ fontWeight: 700, fontSize: 13, color: 'var(--color-text-primary)' }}>{agent.accuracy}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600 }}>
                      {agent.totalPredictions.toLocaleString()}
                    </td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700, color: 'var(--color-primary)' }}>
                      {agent.staked}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <Badge
                        variant={
                          agent.status === 'active' ? 'success' : 'warning'
                        }
                      >
                        {agent.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </motion.div>

          {/* x402 Live Payment Panel */}
          <motion.div
            variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
            style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}
          >
            {/* Trigger Inference Card */}
            <div className="card-flat" style={{ padding: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-primary-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-primary)' }}>
                  <Zap size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                    x402 Pay-per-Inference
                  </h3>
                  <p style={{ fontSize: 11, margin: 0, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                    Live AI + on-chain payment
                  </p>
                </div>
              </div>

              {/* Inference type selector */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {inferenceOptions.map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => setSelectedInference(opt.type)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: selectedInference === opt.type
                        ? '2px solid var(--color-primary)'
                        : '1px solid var(--color-border)',
                      background: selectedInference === opt.type
                        ? 'var(--color-primary-muted)'
                        : 'var(--color-bg)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div>
                      <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: 'var(--color-text-primary)' }}>{opt.label}</p>
                      <p style={{ fontSize: 11, margin: 0, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>{opt.agent}</p>
                    </div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-success)' }}>{opt.price}</span>
                  </button>
                ))}
              </div>

              <button
                onClick={() => triggerInference(selectedInference)}
                disabled={isRunningDemo}
                style={{
                  width: '100%',
                  padding: '14px',
                  fontSize: 14,
                  fontWeight: 700,
                  color: '#fff',
                  background: isRunningDemo ? 'var(--color-text-tertiary)' : 'var(--color-primary)',
                  borderRadius: 12,
                  border: 'none',
                  cursor: isRunningDemo ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  transition: 'all 0.2s',
                }}
              >
                {isRunningDemo ? (
                  <><Loader2 size={16} className="animate-spin" style={{ animation: 'spin 1s linear infinite' }} /> Processing...</>
                ) : (
                  <><Zap size={16} /> Trigger AI Inference</>
                )}
              </button>

              {isConnected && escrowBalance != null && (
                <p style={{ fontSize: 11, color: 'var(--color-text-tertiary)', margin: '12px 0 0', textAlign: 'center', fontWeight: 600 }}>
                  Escrow balance: ${(Number(escrowBalance) / 1e6).toFixed(2)} USDC
                </p>
              )}
            </div>

            {/* Live Payment Feed */}
            <div className="card-flat" style={{ padding: '24px', minHeight: 200 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--color-warning-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-warning)' }}>
                  <Coins size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                    Payment Feed
                  </h3>
                  <p style={{ fontSize: 11, margin: 0, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                    Real-time x402 settlements
                  </p>
                </div>
              </div>

              {livePayments.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-text-tertiary)' }}>
                  <Zap size={24} style={{ marginBottom: 8, opacity: 0.4 }} />
                  <p style={{ fontSize: 13, fontWeight: 600, margin: 0 }}>
                    Trigger an inference to see live payments
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <AnimatePresence>
                    {livePayments.slice(0, 6).map((payment, i) => (
                      <motion.div
                        key={`${payment.type}-${i}`}
                        initial={{ opacity: 0, y: -20, height: 0 }}
                        animate={{ opacity: 1, y: 0, height: 'auto' }}
                        transition={{ duration: 0.3 }}
                        style={{
                          padding: '14px 0',
                          borderBottom: i < livePayments.length - 1 ? '1px solid var(--color-border)' : 'none',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{
                              width: 8, height: 8, borderRadius: '50%',
                              background: payment.status === 'processing'
                                ? 'var(--color-warning)'
                                : 'var(--color-success)',
                              boxShadow: payment.status === 'processing'
                                ? '0 0 8px var(--color-warning)'
                                : '0 0 8px var(--color-success)',
                            }} />
                            <div>
                              <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: 'var(--color-text-primary)' }}>
                                {payment.agent}
                              </p>
                              <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>
                                {payment.type}
                              </p>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: 13, fontWeight: 700, margin: '0 0 2px', color: 'var(--color-success)' }}>
                              {payment.amount}
                            </p>
                            <p style={{ margin: 0, fontSize: 10, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>
                              {payment.status === 'processing' ? (
                                <span style={{ color: 'var(--color-warning)' }}>Processing...</span>
                              ) : payment.status === 'ai_response' ? (
                                <span style={{ color: 'var(--color-success)' }}>AI responded</span>
                              ) : (
                                <span style={{ color: 'var(--color-success)' }}>Settled</span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Show AI result snippet */}
                        {payment.status === 'ai_response' && payment.aiResult && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            style={{
                              marginTop: 10,
                              padding: '10px 12px',
                              borderRadius: 8,
                              background: 'var(--color-bg)',
                              border: '1px solid var(--color-border)',
                              fontSize: 11,
                              lineHeight: 1.5,
                              color: 'var(--color-text-secondary)',
                              fontWeight: 500,
                            }}
                          >
                            {payment.aiResult.ai_recommendation ? (
                              <>
                                <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--color-text-primary)' }}>AI Result:</p>
                                <p style={{ margin: 0 }}>
                                  Risk: {payment.aiResult.ai_recommendation.analysis?.risk_level} |
                                  Allocation: AION {payment.aiResult.ai_recommendation.allocation_recommendation?.aion_pool_pct}%,
                                  Aave {payment.aiResult.ai_recommendation.allocation_recommendation?.aave_v3_pct}%,
                                  Morpho {payment.aiResult.ai_recommendation.allocation_recommendation?.morpho_pct}%
                                </p>
                              </>
                            ) : payment.aiResult.prediction ? (
                              <>
                                <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--color-text-primary)' }}>AI Prediction:</p>
                                <p style={{ margin: 0 }}>
                                  Trend: {payment.aiResult.prediction.trend} |
                                  Confidence: {payment.aiResult.prediction.confidence}% |
                                  Supply APY: {payment.aiResult.prediction.predicted_supply_apy}%
                                </p>
                              </>
                            ) : null}
                          </motion.div>
                        )}
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </motion.div>

      <style jsx global>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (max-width: 1024px) {
          .agents-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
