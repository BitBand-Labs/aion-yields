'use client'

import React from 'react'

interface HealthGaugeProps {
  healthFactor: number
  size?: number
}

export function HealthGauge({ healthFactor, size = 120 }: HealthGaugeProps) {
  // Clamp between 0 and 5 for display
  const clamped = Math.min(Math.max(healthFactor, 0), 5)
  const percentage = (clamped / 5) * 100

  // Color based on health factor
  let color = 'var(--color-success)'
  let label = 'Healthy'
  if (healthFactor < 1) {
    color = 'var(--color-error)'
    label = 'Liquidatable'
  } else if (healthFactor < 1.5) {
    color = 'var(--color-error)'
    label = 'At Risk'
  } else if (healthFactor < 2.5) {
    color = 'var(--color-warning)'
    label = 'Moderate'
  }

  const strokeWidth = 8
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const strokeDash = (percentage / 100) * circumference * 0.75 // 270 degree arc
  const totalArc = circumference * 0.75

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
      }}
    >
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          style={{ transform: 'rotate(135deg)' }}
        >
          {/* Background arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth={strokeWidth}
            strokeDasharray={`${totalArc} ${circumference}`}
            strokeLinecap="round"
          />
          {/* Progress arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeDasharray={`${strokeDash} ${circumference}`}
            strokeLinecap="round"
            style={{
              transition: 'stroke-dasharray 0.5s ease-out, stroke 0.3s ease',
              filter: `drop-shadow(0 0 6px ${color})`,
            }}
          />
        </svg>

        {/* Center value */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontSize: size * 0.22,
              fontWeight: 700,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.02em',
            }}
          >
            {healthFactor.toFixed(2)}
          </span>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: color,
            boxShadow: `0 0 6px ${color}`,
          }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 500,
            color,
          }}
        >
          {label}
        </span>
      </div>
    </div>
  )
}
