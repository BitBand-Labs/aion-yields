'use client'

import React, { useRef, useState } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'

interface MagicCardProps {
  children: React.ReactNode
  className?: string
  gradientColor?: string
  gradientSize?: number
  onClick?: () => void
  style?: React.CSSProperties
}

export function MagicCard({
  children,
  className = '',
  gradientColor = 'rgba(61, 90, 241, 0.1)',
  gradientSize = 400,
  onClick,
  style
}: MagicCardProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)

  // Smooth out mouse movement
  const springConfig = { damping: 20, stiffness: 200 }
  const x = useSpring(mouseX, springConfig)
  const y = useSpring(mouseY, springConfig)

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const { left, top } = containerRef.current.getBoundingClientRect()
    mouseX.set(event.clientX - left)
    mouseY.set(event.clientY - top)
  }

  const handleMouseEnter = () => {
    setOpacity(1)
  }

  const handleMouseLeave = () => {
    setOpacity(0)
  }

  const [opacity, setOpacity] = useState(0)

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`card ${className}`}
      style={{
        position: 'relative',
        overflow: 'hidden',
        cursor: onClick ? 'pointer' : 'default',
        padding: 0, // Let children handle internal padding
        ...style
      }}
    >
      {/* Spotlight Gradient */}
      <motion.div
        style={{
          position: 'absolute',
          inset: -gradientSize / 2,
          width: gradientSize,
          height: gradientSize,
          background: `radial-gradient(circle at center, ${gradientColor}, transparent 80%)`,
          left: x,
          top: y,
          opacity,
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Content Area */}
      <div style={{ position: 'relative', zIndex: 1, height: '100%', padding: 'var(--space-2)' }}>
        {children}
      </div>
    </div>
  )
}
