import React from 'react'

interface SkeletonProps {
  width?: string | number
  height?: string | number
  borderRadius?: string
  style?: React.CSSProperties
}

export function Skeleton({ width = '100%', height = 16, borderRadius, style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{
        width,
        height,
        borderRadius: borderRadius || 'var(--radius-sm)',
        ...style,
      }}
    />
  )
}

export function SkeletonCard() {
  return (
    <div className="card-flat" style={{ minHeight: 120 }}>
      <Skeleton width={90} height={12} />
      <div style={{ marginTop: 12 }}>
        <Skeleton width={140} height={28} />
      </div>
      <div style={{ marginTop: 8 }}>
        <Skeleton width={70} height={14} />
      </div>
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '16px',
        borderBottom: '1px solid var(--color-border)',
      }}
    >
      <Skeleton width={32} height={32} borderRadius="var(--radius-full)" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <Skeleton width="40%" height={14} />
        <Skeleton width="25%" height={12} />
      </div>
      <Skeleton width={80} height={14} />
      <Skeleton width={60} height={14} />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}
