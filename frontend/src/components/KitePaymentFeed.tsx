'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Zap, CheckCircle, AlertCircle, ExternalLink, RefreshCw, Coins } from 'lucide-react'

// ── Types ────────────────────────────────────────────────────────────────────

interface PaymentProof {
  paid: boolean
  tx_hash: string | null
  amount_kite: number
  from: string | null
  to: string
  chain_id: number
  explorer_url: string | null
  action_type: string
  timestamp: number
  error: string | null
}

interface FeedEntry extends PaymentProof {
  id: string // client-generated for React key
}

interface SessionSpend {
  session_spent_kite: number
  session_limit_kite: number
  remaining_kite: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AI_ENGINE_URL = process.env.NEXT_PUBLIC_AI_ENGINE_URL ?? 'http://localhost:8000'

function shortAddr(addr: string | null): string {
  if (!addr) return '—'
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function formatTime(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function actionLabel(type: string): string {
  const map: Record<string, string> = {
    analyze: 'Strategy Analyze',
    predict: 'Yield Predict',
    ai_inference: 'AI Inference',
  }
  return map[type] ?? type
}

// ── Component ─────────────────────────────────────────────────────────────────

export function KitePaymentFeed() {
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [session, setSession] = useState<SessionSpend | null>(null)
  const [loading, setLoading] = useState(false)

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`${AI_ENGINE_URL}/kite-payments/session`)
      if (res.ok) {
        const data: SessionSpend = await res.json()
        setSession(data)
      }
    } catch {
      // backend may not be running in all environments
    }
  }, [])

  // Trigger a live inference call and capture its payment proof
  const triggerInference = useCallback(async (type: 'analyze' | 'predict') => {
    setLoading(true)
    try {
      const res = await fetch(`${AI_ENGINE_URL}/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chain: 'fuji' }),
      })
      const data = await res.json()
      if (data?.payment_proof) {
        const entry: FeedEntry = {
          ...data.payment_proof,
          id: `${Date.now()}-${Math.random()}`,
        }
        setFeed((prev) => [entry, ...prev].slice(0, 20)) // keep latest 20
        await fetchSession()
      }
    } catch {
      // silently handle — network may not be available
    } finally {
      setLoading(false)
    }
  }, [fetchSession])

  // Add a demo entry when there are no real ones (for UI preview)
  const addDemoEntry = useCallback(() => {
    const demo: FeedEntry = {
      id: `demo-${Date.now()}`,
      paid: true,
      tx_hash: '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      amount_kite: 0.001,
      from: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      to: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      chain_id: 2368,
      explorer_url:
        'https://testnet.kitescan.ai/tx/0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      action_type: 'analyze',
      timestamp: Math.floor(Date.now() / 1000),
      error: null,
    }
    setFeed((prev) => [demo, ...prev].slice(0, 20))
  }, [])

  useEffect(() => {
    fetchSession()
  }, [fetchSession])

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 backdrop-blur-sm p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-purple-500/20 flex items-center justify-center">
            <Zap className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Kite Payment Feed</h3>
            <p className="text-xs text-gray-400">x402 AI inference micropayments</p>
          </div>
        </div>
        <button
          onClick={fetchSession}
          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
          title="Refresh session stats"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Session Stats */}
      {session && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[
            { label: 'Spent', value: `${session.session_spent_kite.toFixed(4)} KITE` },
            { label: 'Limit', value: `${session.session_limit_kite.toFixed(1)} KITE` },
            { label: 'Remaining', value: `${session.remaining_kite.toFixed(4)} KITE` },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-lg bg-gray-800/60 px-3 py-2 text-center">
              <p className="text-xs text-gray-400">{label}</p>
              <p className="text-xs font-semibold text-white mt-0.5">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => triggerInference('analyze')}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 text-purple-300 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Zap className="w-3.5 h-3.5" />
          )}
          Pay + Analyze
        </button>
        <button
          onClick={() => triggerInference('predict')}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 text-blue-300 text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Coins className="w-3.5 h-3.5" />
          )}
          Pay + Predict
        </button>
        <button
          onClick={addDemoEntry}
          className="py-2 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white text-xs font-medium transition-colors"
          title="Add demo entry"
        >
          Demo
        </button>
      </div>

      {/* Feed */}
      {feed.length === 0 ? (
        <div className="text-center py-8 text-gray-500 text-xs">
          <Zap className="w-5 h-5 mx-auto mb-2 opacity-30" />
          No payments yet — trigger an inference above
        </div>
      ) : (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          <AnimatePresence initial={false}>
            {feed.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className={`rounded-lg border p-3 ${
                  entry.paid
                    ? 'bg-green-900/10 border-green-800/40'
                    : 'bg-red-900/10 border-red-800/40'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {entry.paid ? (
                      <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-white truncate">
                        {actionLabel(entry.action_type)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {shortAddr(entry.from)} → {shortAddr(entry.to)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-semibold ${entry.paid ? 'text-green-400' : 'text-red-400'}`}>
                      {entry.amount_kite} KITE
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatTime(entry.timestamp)}</p>
                  </div>
                </div>

                {entry.error && (
                  <p className="text-xs text-red-400 mt-1.5 truncate">{entry.error}</p>
                )}

                {entry.tx_hash && (
                  <div className="mt-1.5 flex items-center gap-1">
                    <p className="text-xs text-gray-500 font-mono truncate flex-1">
                      {entry.tx_hash.slice(0, 18)}…
                    </p>
                    {entry.explorer_url && (
                      <a
                        href={entry.explorer_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-400 hover:text-purple-300 flex-shrink-0"
                        title="View on Kitescan"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Footer */}
      <p className="text-xs text-gray-600 text-center mt-3">
        Chain ID 2368 · Kite Testnet ·{' '}
        <a
          href="https://testnet.kitescan.ai"
          target="_blank"
          rel="noopener noreferrer"
          className="text-purple-500 hover:text-purple-400"
        >
          kitescan.ai
        </a>
      </p>
    </div>
  )
}
