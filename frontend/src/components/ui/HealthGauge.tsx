'use client'

import React from 'react'
import { motion } from 'framer-motion'

interface HealthGaugeProps {
  value: number // 1.0 to 10.0+
  min?: number
  max?: number
  label?: string
  size?: number
}

export function HealthGauge({
  value,
  min = 1,
  max = 5,
  label = 'Health Factor',
  size = 200
}: HealthGaugeProps) {
  // Normalize value for the gauge (0 to 1 range)
  const normalizedValue = Math.min(Math.max((value - min) / (max - min), 0), 1)
  const rotation = normalizedValue * 180 - 90 // -90 to 90 degrees

  // Gauge colors based on value
  const getColor = (val: number) => {
    if (val < 1.1) return '#ef4444' // Error red
    if (val < 1.5) return '#f59e0b' // Warning amber
    return '#10b981' // Success green
  }

  const activeColor = getColor(value)

  return (
    <div style={{ position: 'relative', width: size, height: size / 2 + 40, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg width={size} height={size / 2} viewBox={`0 0 ${size} ${size / 2}`}>
        {/* Background Track */}
        <path
          d={`M 20 ${size / 2} A ${size / 2 - 20} ${size / 2 - 20} 0 0 1 ${size - 20} ${size / 2}`}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="12"
          strokeLinecap="round"
          style={{ opacity: 0.5 }}
        />
        
        {/* Colored Progress */}
        <motion.path
          initial={{ pathLength: 0 }}
          animate={{ pathLength: normalizedValue }}
          transition={{ duration: 1, ease: 'easeOut' }}
          d={`M 20 ${size / 2} A ${size / 2 - 20} ${size / 2 - 20} 0 0 1 ${size - 20} ${size / 2}`}
          fill="none"
          stroke={activeColor}
          strokeWidth="12"
          strokeLinecap="round"
        />

        {/* Needle Base Circle */}
        <circle cx={size / 2} cy={size / 2} r="6" fill="var(--color-text-primary)" />
        
        {/* Needle */}
        <motion.line
          initial={{ rotate: -90 }}
          animate={{ rotate: rotation }}
          transition={{ duration: 1.2, ease: 'easeOut' }}
          x1={size / 2}
          y1={size / 2}
          x2={size / 2}
          y2="25"
          stroke="var(--color-text-primary)"
          strokeWidth="2"
          style={{ transformOrigin: 'center bottom' }}
        />
      </svg>

      {/* Numerical Value */}
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ fontSize: 24, fontWeight: 700, color: activeColor, letterSpacing: '-0.02em' }}
        >
          {value.toFixed(2)}
        </motion.div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {label}
        </div>
      </div>
    </div>
  )
}
