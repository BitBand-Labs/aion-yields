import React, { ReactNode } from 'react'

type BadgeVariant = 'primary' | 'success' | 'warning' | 'error' | 'accent' | 'neutral'

interface BadgeProps {
  children: ReactNode
  variant?: BadgeVariant
  dot?: boolean
}

const variantMap: Record<BadgeVariant, string> = {
  primary: 'badge-primary',
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  accent: 'badge-accent',
  neutral: '',
}

const dotColorMap: Record<BadgeVariant, string> = {
  primary: 'var(--color-primary-light)',
  success: 'var(--color-success)',
  warning: 'var(--color-warning)',
  error: 'var(--color-error)',
  accent: 'var(--color-accent)',
  neutral: 'var(--color-text-tertiary)',
}

export function Badge({ children, variant = 'primary', dot = false }: BadgeProps) {
  return (
    <span
      className={`badge ${variantMap[variant]}`}
      style={
        variant === 'neutral'
          ? {
              background: 'var(--color-surface-raised)',
              color: 'var(--color-text-secondary)',
            }
          : undefined
      }
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: dotColorMap[variant],
            display: 'inline-block',
            flexShrink: 0,
          }}
        />
      )}
      {children}
    </span>
  )
}
