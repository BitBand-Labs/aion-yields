'use client'

import React, { ReactNode } from 'react'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { motion } from 'framer-motion'

interface StatCardProps {
  label: string
  value: string
  change?: string
  changeType?: 'positive' | 'negative' | 'neutral' | 'warning'
  icon?: ReactNode
  loading?: boolean
}

export function StatCard({
  label,
  value,
  change,
  changeType = 'neutral',
  icon,
  loading = false,
}: StatCardProps) {
  if (loading) {
    return (
      <div className="card-flat" style={{ minHeight: 120 }}>
        <div
          className="skeleton"
          style={{ width: 80, height: 12, marginBottom: 12 }}
        />
        <div
          className="skeleton"
          style={{ width: 120, height: 28, marginBottom: 8 }}
        />
        <div
          className="skeleton"
          style={{ width: 60, height: 14 }}
        />
      </div>
    )
  }

  const changeColorMap = {
    positive: 'var(--color-success)',
    negative: 'var(--color-error)',
    neutral: 'var(--color-text-tertiary)',
    warning: 'var(--color-warning)',
  }

  const ChangeIcon =
    changeType === 'positive'
      ? TrendingUp
      : changeType === 'negative'
      ? TrendingDown
      : Minus

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className="card"
      style={{
        minHeight: 120,
        position: 'relative',
        overflow: 'hidden',
        transition: 'border-color 0.2s, box-shadow 0.2s',
      }}
    >
      {/* Background icon (subtle) */}
      {icon && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 0.08, scale: 1 }}
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            color: 'var(--color-primary)',
          }}
        >
          {icon}
        </motion.div>
      )}

      <p className="text-label" style={{ marginBottom: 12, margin: 0 }}>
        {label}
      </p>

      <p
        style={{
          fontSize: 28,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--color-text-primary)',
          margin: '12px 0 8px',
          lineHeight: 1.1,
        }}
      >
        {value}
      </p>

      {change && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: changeColorMap[changeType],
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          <ChangeIcon size={14} />
          <span>{change}</span>
        </div>
      )}
    </motion.div>
  )
}
