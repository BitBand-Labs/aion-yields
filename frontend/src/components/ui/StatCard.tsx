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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card"
      style={{
        minHeight: 100,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        padding: 'var(--space-2)',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border-hover)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--color-border)'
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {icon && (
        <div
          style={{
            position: 'absolute',
            top: '12px',
            right: '12px',
            color: 'var(--color-text-tertiary)',
            opacity: 0.6
          }}
        >
          {React.isValidElement(icon) 
            ? React.cloneElement(icon as React.ReactElement<any>, { size: 16 }) 
            : icon}
        </div>
      )}

      <p style={{ 
        fontSize: 11, 
        fontWeight: 600, 
        color: 'var(--color-text-tertiary)', 
        textTransform: 'uppercase', 
        letterSpacing: '0.05em', 
        margin: '0 0 8px' 
      }}>
        {label}
      </p>

      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <p
          style={{
            fontSize: 22,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: 'var(--color-text-primary)',
            margin: 0,
            lineHeight: 1,
          }}
        >
          {value}
        </p>

        {change && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              color: changeColorMap[changeType],
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            <ChangeIcon size={10} strokeWidth={3} />
            <span>{change}</span>
          </div>
        )}
      </div>
    </motion.div>
  )
}
