'use client'

import React, { useState, useMemo } from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import {
  PieChart,
  TrendingUp,
  TrendingDown,
  Brain,
  Shield,
  Zap,
  Activity,
  Clock,
  Target,
  AlertTriangle,
  ChevronRight,
  Layers,
  DollarSign,
  BarChart3,
  Play,
  RefreshCw,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// ─── Mock data ───────────────────────────────────────────────────

const portfolioAssets = [
  { name: 'USDC', icon: '🔵', value: 10000, allocation: 40.8, apy: 4.5, risk: 'Low' as const, color: '#2775CA' },
  { name: 'ETH', icon: '⟠', value: 8500, allocation: 34.7, apy: 3.2, risk: 'Medium' as const, color: '#627EEA' },
  { name: 'WBTC', icon: '🟠', value: 4200, allocation: 17.1, apy: 2.8, risk: 'Medium' as const, color: '#F7931A' },
  { name: 'DAI', icon: '🟡', value: 1800, allocation: 7.3, apy: 3.9, risk: 'Low' as const, color: '#F5AC37' },
]

const totalValue = portfolioAssets.reduce((sum, a) => sum + a.value, 0)

// Performance data points (30 days)
function seededRandom(seed: number) {
  const x = Math.sin(seed * 9301 + 49297) * 49297
  return x - Math.floor(x)
}

const generatePerformanceData = () => {
  const days = 30
  const data = []
  let actual = 22000
  let predicted = 22000
  // Use a fixed base date to avoid server/client mismatch
  const baseDate = new Date('2026-02-07')

  for (let i = 0; i <= days; i++) {
    const date = new Date(baseDate)
    date.setDate(date.getDate() + i)
    const dailyReturn = (seededRandom(i * 13 + 7) - 0.45) * 300
    actual += dailyReturn
    predicted += dailyReturn * 0.8 + 80
    data.push({
      day: i,
      date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      actual: Math.round(actual),
      predicted: Math.round(predicted),
      aiOptimized: Math.round(actual + (actual * 0.002 * i)),
    })
  }
  return data
}

const performanceData = generatePerformanceData()

// AI Activity Feed
const aiActivities = [
  { time: '3 min ago', action: 'Rebalanced USDC allocation: Aave -> Morpho Blue', impact: '+0.4% APY', type: 'rebalance' as const, agent: 'Anthropic' },
  { time: '18 min ago', action: 'Reduced ETH exposure by 2% (volatility spike detected)', impact: 'Risk -12%', type: 'risk' as const, agent: 'Guardian-3' },
  { time: '45 min ago', action: 'Opened new DAI position on Compound v3', impact: '+3.9% APY', type: 'deposit' as const, agent: 'Anthropic' },
  { time: '1h 20m ago', action: 'AI prediction: ETH price correction likely in 6h', impact: 'Alert', type: 'prediction' as const, agent: 'Oracle-1' },
  { time: '2h ago', action: 'Harvested yield rewards across 3 protocols', impact: '+$42.50', type: 'harvest' as const, agent: 'Anthropic' },
  { time: '3h ago', action: 'Cross-chain bridge: $5K USDC C-Chain -> Subnet via Teleporter', impact: 'Completed', type: 'bridge' as const, agent: 'Router-2' },
]

const activityIcons: Record<string, typeof Activity> = {
  rebalance: RefreshCw,
  risk: Shield,
  deposit: DollarSign,
  prediction: Brain,
  harvest: Zap,
  bridge: Layers,
}

// Risk metrics
const riskMetrics = {
  tvl: { value: '$42.8M', change: '+8.2%', status: 'healthy' as const },
  smartContractRisk: { score: 92, label: 'A+', detail: '14 audits passed' },
  volatility: { value: '12.4%', change: '-2.1%', status: 'low' as const },
  liquidationRisk: { probability: '0.01%', buffer: '210%', status: 'safe' as const },
  impermanentLoss: { value: '0.3%', status: 'minimal' as const },
  correlationRisk: { value: '0.42', status: 'moderate' as const },
}

// ─── Component ───────────────────────────────────────────────────

export default function PortfolioPage() {
  const [activeTimeframe, setActiveTimeframe] = useState<'1W' | '1M' | '3M' | '1Y'>('1M')
  const [simulatorRisk, setSimulatorRisk] = useState(50)
  const [simulatorAmount, setSimulatorAmount] = useState(10000)
  const [showPrediction, setShowPrediction] = useState(true)

  // Projected value calculation (12 months)
  const projectedValues = useMemo(() => {
    const monthlyRate = 0.01045 // ~12.54% APY compounded
    const conservative = simulatorAmount * Math.pow(1 + monthlyRate * 0.6, 12)
    const moderate = simulatorAmount * Math.pow(1 + monthlyRate, 12)
    const aggressive = simulatorAmount * Math.pow(1 + monthlyRate * 1.4, 12)
    return {
      conservative: Math.round(conservative),
      moderate: Math.round(moderate),
      aggressive: Math.round(aggressive),
    }
  }, [simulatorAmount])

  // Performance chart dimensions
  const chartWidth = 100 // percentage
  const chartHeight = 240
  const dataLen = performanceData.length
  const minVal = Math.min(...performanceData.map(d => Math.min(d.actual, d.predicted, d.aiOptimized)))
  const maxVal = Math.max(...performanceData.map(d => Math.max(d.actual, d.predicted, d.aiOptimized)))
  const range = maxVal - minVal || 1

  const toY = (val: number) => chartHeight - ((val - minVal) / range) * (chartHeight - 20)
  const toX = (i: number) => (i / (dataLen - 1)) * 100

  const makePath = (key: 'actual' | 'predicted' | 'aiOptimized') =>
    performanceData.map((d, i) => `${i === 0 ? 'M' : 'L'} ${toX(i)} ${toY(d[key])}`).join(' ')

  return (
    <AppShell>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: { staggerChildren: 0.08 } },
        }}
      >
        {/* Header */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-8)' }}
        >
          <div>
            <h2 className="heading-md" style={{ margin: '0 0 var(--space-2)', fontWeight: 700, letterSpacing: '-0.02em' }}>
              Portfolio Intelligence
            </h2>
            <p className="text-secondary" style={{ margin: 0 }}>
              AI-powered portfolio analytics, predictions, and risk management
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Badge variant="success" dot>AI Active</Badge>
            <Badge variant="primary">Sepolia</Badge>
          </div>
        </motion.div>

        {/* Top Stats Row */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          className="grid-stats"
          style={{ marginBottom: 'var(--space-8)' }}
        >
          <StatCard label="Net Worth" value={`$${totalValue.toLocaleString()}`} icon={<DollarSign />} change="+12.4% (30d)" changeType="positive" />
          <StatCard label="AI-Optimized APY" value="12.45%" icon={<Brain />} change="+3.2% vs market" changeType="positive" />
          <StatCard label="Risk Score" value="A+" icon={<Shield />} change="Low risk" changeType="positive" />
          <StatCard label="Projected (12mo)" value={`$${projectedValues.moderate.toLocaleString()}`} icon={<Target />} change="+13.3%" changeType="positive" />
        </motion.div>

        {/* Main Grid: Chart + Allocation */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }} className="portfolio-main-grid">

          {/* Performance Chart with AI Prediction */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="card-flat"
            style={{ padding: '28px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <div>
                <h3 className="heading-sm" style={{ margin: '0 0 4px', fontWeight: 700 }}>Performance & AI Predictions</h3>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>Portfolio value over time with AI prediction overlay</p>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  onClick={() => setShowPrediction(!showPrediction)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                    background: showPrediction ? 'var(--color-primary-muted)' : 'var(--color-surface-raised)',
                    color: showPrediction ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                    border: `1px solid ${showPrediction ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  }}
                >
                  <Brain size={12} /> AI Prediction
                </button>
                <div style={{ display: 'flex', gap: 2, background: 'var(--color-bg)', padding: 3, borderRadius: 8 }}>
                  {(['1W', '1M', '3M', '1Y'] as const).map(tf => (
                    <button
                      key={tf}
                      onClick={() => setActiveTimeframe(tf)}
                      style={{
                        padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        background: activeTimeframe === tf ? 'var(--color-surface)' : 'transparent',
                        color: activeTimeframe === tf ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                        border: 'none',
                        boxShadow: activeTimeframe === tf ? 'var(--shadow-subtle)' : 'none',
                      }}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* SVG Chart */}
            <div style={{ position: 'relative', height: chartHeight, marginBottom: 16 }}>
              {/* Y-axis labels */}
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 60, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-tertiary)', fontWeight: 600 }}>
                <span>${(maxVal / 1000).toFixed(1)}k</span>
                <span>${((maxVal + minVal) / 2 / 1000).toFixed(1)}k</span>
                <span>${(minVal / 1000).toFixed(1)}k</span>
              </div>
              <svg
                viewBox={`0 0 100 ${chartHeight}`}
                preserveAspectRatio="none"
                style={{ width: 'calc(100% - 60px)', height: '100%', marginLeft: 60 }}
              >
                {/* Grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map(frac => (
                  <line key={frac} x1="0" y1={20 + frac * (chartHeight - 20)} x2="100" y2={20 + frac * (chartHeight - 20)} stroke="var(--color-border)" strokeWidth="0.2" strokeDasharray="1,2" />
                ))}

                {/* AI Optimized area fill */}
                <path
                  d={`${makePath('aiOptimized')} L 100 ${chartHeight} L 0 ${chartHeight} Z`}
                  fill="url(#aiGradient)"
                  opacity="0.15"
                />

                {/* Actual portfolio line */}
                <motion.path
                  d={makePath('actual')}
                  fill="none"
                  stroke="var(--color-primary)"
                  strokeWidth="0.6"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 2 }}
                />

                {/* AI Optimized line */}
                <motion.path
                  d={makePath('aiOptimized')}
                  fill="none"
                  stroke="var(--color-success)"
                  strokeWidth="0.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 2, delay: 0.3 }}
                />

                {/* AI Prediction line (dashed) */}
                {showPrediction && (
                  <motion.path
                    d={makePath('predicted')}
                    fill="none"
                    stroke="var(--color-accent)"
                    strokeWidth="0.4"
                    strokeDasharray="2,1.5"
                    strokeLinecap="round"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.5 }}
                  />
                )}

                <defs>
                  <linearGradient id="aiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-success)" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="var(--color-success)" stopOpacity="0" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 20, height: 3, background: 'var(--color-primary)', borderRadius: 2 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Actual Value</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 20, height: 3, background: 'var(--color-success)', borderRadius: 2 }} />
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>AI-Optimized</span>
              </div>
              {showPrediction && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 20, height: 3, borderTop: '2px dashed var(--color-accent)' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-secondary)' }}>AI Prediction</span>
                </div>
              )}
            </div>
          </motion.div>

          {/* Asset Allocation + Projected Value */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Allocation Donut */}
            <motion.div
              variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
              className="card-flat"
              style={{ padding: '24px' }}
            >
              <h3 className="heading-sm" style={{ margin: '0 0 20px', fontWeight: 700 }}>
                <PieChart size={16} style={{ marginRight: 8, verticalAlign: 'text-bottom', color: 'var(--color-primary)' }} />
                Asset Allocation
              </h3>
              {/* Visual donut using conic gradient */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
                <div style={{
                  width: 140, height: 140, borderRadius: '50%',
                  background: `conic-gradient(${portfolioAssets.map((a, i) => {
                    const start = portfolioAssets.slice(0, i).reduce((s, x) => s + x.allocation, 0)
                    return `${a.color} ${start}% ${start + a.allocation}%`
                  }).join(', ')})`,
                  position: 'relative',
                }}>
                  <div style={{
                    position: 'absolute', inset: 28, borderRadius: '50%',
                    background: 'var(--color-bg-elevated)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexDirection: 'column',
                  }}>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>${(totalValue / 1000).toFixed(1)}k</span>
                    <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>Total</span>
                  </div>
                </div>
              </div>
              {/* Legend */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {portfolioAssets.map(a => (
                  <div key={a.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: a.color }} />
                      <span style={{ fontWeight: 600 }}>{a.icon} {a.name}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <span style={{ color: 'var(--color-text-tertiary)', fontSize: 12 }}>{a.allocation}%</span>
                      <span style={{ fontWeight: 600 }}>${a.value.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* 12-Month Projection */}
            <motion.div
              variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
              className="card-glow"
              style={{ padding: '24px' }}
            >
              <h3 className="heading-sm" style={{ margin: '0 0 16px', fontWeight: 700 }}>
                <Target size={16} style={{ marginRight: 8, verticalAlign: 'text-bottom', color: 'var(--color-primary)' }} />
                12-Month Projection
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {[
                  { label: 'Conservative', value: projectedValues.conservative, color: 'var(--color-text-tertiary)', pct: ((projectedValues.conservative - totalValue) / totalValue * 100).toFixed(1) },
                  { label: 'AI-Optimized', value: projectedValues.moderate, color: 'var(--color-success)', pct: ((projectedValues.moderate - totalValue) / totalValue * 100).toFixed(1) },
                  { label: 'Aggressive', value: projectedValues.aggressive, color: 'var(--color-warning)', pct: ((projectedValues.aggressive - totalValue) / totalValue * 100).toFixed(1) },
                ].map(p => (
                  <div key={p.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 8, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                    <div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase' }}>{p.label}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>${p.value.toLocaleString()}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: p.color, marginLeft: 8 }}>+{p.pct}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>

        {/* Second Row: AI Activity Feed + Risk Intelligence */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)', marginBottom: 'var(--space-8)' }} className="portfolio-secondary-grid">

          {/* Live Strategy Feed */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="card-flat"
            style={{ padding: '28px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>
                <Activity size={16} style={{ marginRight: 8, verticalAlign: 'text-bottom', color: 'var(--color-primary)' }} />
                Live Strategy Feed
              </h3>
              <Badge variant="success" dot style={{ fontSize: 10 }}>Real-time</Badge>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {aiActivities.map((act, i) => {
                const Icon = activityIcons[act.type] || Activity
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08 }}
                    style={{
                      display: 'flex', gap: 14, padding: '14px 0',
                      borderBottom: i < aiActivities.length - 1 ? '1px solid var(--color-border)' : 'none',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                      background: act.type === 'risk' ? 'rgba(239,68,68,0.1)' : act.type === 'prediction' ? 'rgba(139,92,246,0.1)' : 'var(--color-primary-muted)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: act.type === 'risk' ? 'var(--color-error)' : act.type === 'prediction' ? 'var(--color-accent)' : 'var(--color-primary)',
                    }}>
                      <Icon size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                          {act.action}
                        </p>
                        <Badge
                          variant={act.type === 'risk' ? 'warning' : act.type === 'prediction' ? 'accent' : 'success'}
                          style={{ fontSize: 10, padding: '2px 6px', flexShrink: 0 }}
                        >
                          {act.impact}
                        </Badge>
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginTop: 4, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
                        <span>{act.time}</span>
                        <span style={{ fontFamily: 'var(--font-mono)' }}>{act.agent}</span>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </motion.div>

          {/* Risk Intelligence Panel */}
          <motion.div
            variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
            className="card-flat"
            style={{ padding: '28px' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
              <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>
                <Shield size={16} style={{ marginRight: 8, verticalAlign: 'text-bottom', color: 'var(--color-primary)' }} />
                Risk Intelligence
              </h3>
              <Badge variant="success" style={{ fontSize: 10 }}>All Clear</Badge>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {/* Protocol TVL */}
              <div style={{ padding: 16, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Protocol TVL</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{riskMetrics.tvl.value}</div>
                <div style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 600, marginTop: 4 }}>{riskMetrics.tvl.change}</div>
              </div>

              {/* Smart Contract Risk */}
              <div style={{ padding: 16, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>SC Risk Score</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 700 }}>{riskMetrics.smartContractRisk.score}</span>
                  <Badge variant="success" style={{ fontSize: 10 }}>{riskMetrics.smartContractRisk.label}</Badge>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>{riskMetrics.smartContractRisk.detail}</div>
              </div>

              {/* Volatility */}
              <div style={{ padding: 16, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Portfolio Volatility</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{riskMetrics.volatility.value}</div>
                <div style={{ fontSize: 11, color: 'var(--color-success)', fontWeight: 600, marginTop: 4 }}>{riskMetrics.volatility.change} (30d)</div>
              </div>

              {/* Liquidation Risk */}
              <div style={{ padding: 16, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Liquidation Risk</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--color-success)' }}>{riskMetrics.liquidationRisk.probability}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 4 }}>Buffer: {riskMetrics.liquidationRisk.buffer}</div>
              </div>

              {/* Impermanent Loss */}
              <div style={{ padding: 16, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Impermanent Loss</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{riskMetrics.impermanentLoss.value}</div>
                <Badge variant="success" style={{ fontSize: 10, marginTop: 6 }}>{riskMetrics.impermanentLoss.status}</Badge>
              </div>

              {/* Correlation */}
              <div style={{ padding: 16, borderRadius: 10, background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 }}>Correlation Index</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{riskMetrics.correlationRisk.value}</div>
                <Badge variant="warning" style={{ fontSize: 10, marginTop: 6 }}>{riskMetrics.correlationRisk.status}</Badge>
              </div>
            </div>
          </motion.div>
        </div>

        {/* AI Yield Simulator */}
        <motion.div
          variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
          className="card-glow"
          style={{ padding: '32px', marginBottom: 'var(--space-8)' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div>
              <h3 className="heading-sm" style={{ margin: '0 0 4px', fontWeight: 700 }}>
                <Brain size={16} style={{ marginRight: 8, verticalAlign: 'text-bottom', color: 'var(--color-primary)' }} />
                AI Yield Simulator
              </h3>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                Interactive projections powered by on-chain AI models
              </p>
            </div>
            <Badge variant="accent" style={{ fontSize: 11 }}>
              <Zap size={10} style={{ marginRight: 4 }} /> Powered by Chainlink CRE
            </Badge>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }} className="simulator-grid">
            {/* Input: Amount */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                Investment Amount
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, fontWeight: 600, color: 'var(--color-text-tertiary)' }}>$</span>
                <input
                  type="number"
                  value={simulatorAmount}
                  onChange={(e) => setSimulatorAmount(Number(e.target.value) || 0)}
                  style={{
                    width: '100%', padding: '14px 14px 14px 28px', borderRadius: 10,
                    border: '1px solid var(--color-border)', background: 'var(--color-bg)',
                    fontSize: 18, fontWeight: 700, color: 'var(--color-text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                {[1000, 5000, 10000, 50000].map(v => (
                  <button
                    key={v}
                    onClick={() => setSimulatorAmount(v)}
                    style={{
                      flex: 1, padding: '6px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      background: simulatorAmount === v ? 'var(--color-primary-muted)' : 'var(--color-bg)',
                      color: simulatorAmount === v ? 'var(--color-primary)' : 'var(--color-text-tertiary)',
                      border: `1px solid ${simulatorAmount === v ? 'var(--color-primary)' : 'var(--color-border)'}`,
                    }}
                  >
                    ${v >= 1000 ? `${v / 1000}k` : v}
                  </button>
                ))}
              </div>
            </div>

            {/* Input: Risk Tolerance */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                Risk Tolerance
              </label>
              <div style={{ padding: '14px', borderRadius: 10, border: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: simulatorRisk < 30 ? 'var(--color-success)' : simulatorRisk > 70 ? 'var(--color-error)' : 'var(--color-warning)' }}>
                    {simulatorRisk < 30 ? 'Conservative' : simulatorRisk > 70 ? 'Aggressive' : 'Moderate'}
                  </span>
                  <span style={{ fontSize: 14, fontWeight: 700 }}>{simulatorRisk}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={simulatorRisk}
                  onChange={(e) => setSimulatorRisk(Number(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--color-primary)' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                  <span>Safe</span>
                  <span>Balanced</span>
                  <span>High Risk</span>
                </div>
              </div>
            </div>

            {/* Output: Projected Returns */}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 8 }}>
                Projected 12-Month Return
              </label>
              <div style={{ padding: '14px', borderRadius: 10, background: 'linear-gradient(135deg, rgba(16,185,129,0.05), rgba(8,71,247,0.05))', border: '1px solid var(--color-primary-muted)' }}>
                <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 4 }}>
                  ${(() => {
                    const rate = 0.01045 * (0.6 + (simulatorRisk / 100) * 0.8)
                    return Math.round(simulatorAmount * Math.pow(1 + rate, 12)).toLocaleString()
                  })()}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={14} style={{ color: 'var(--color-success)' }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-success)' }}>
                    +{(() => {
                      const rate = 0.01045 * (0.6 + (simulatorRisk / 100) * 0.8)
                      return ((Math.pow(1 + rate, 12) - 1) * 100).toFixed(1)
                    })()}% estimated return
                  </span>
                </div>
                <p style={{ margin: '8px 0 0', fontSize: 10, color: 'var(--color-text-tertiary)' }}>
                  Based on current AI model predictions and historical data
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>

      <style jsx global>{`
        @media (max-width: 1200px) {
          .portfolio-main-grid {
            grid-template-columns: 1fr !important;
          }
          .simulator-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 900px) {
          .portfolio-secondary-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 768px) {
          .grid-stats {
            grid-template-columns: 1fr 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
