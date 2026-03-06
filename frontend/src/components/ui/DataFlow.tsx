'use client'

import React from 'react'
import { motion } from 'framer-motion'

export function DataFlow() {
  return (
    <div style={{ position: 'relative', width: '100%', height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
      <svg width="100%" height="100%" viewBox="0 0 400 160" preserveAspectRatio="xMidYMid meet">
        {/* Nodes */}
        <rect x="40" y="60" width="80" height="40" rx="8" fill="var(--color-bg)" stroke="var(--color-border)" />
        <text x="80" y="85" fontSize="10" textAnchor="middle" fill="var(--color-text-secondary)" fontWeight="600">AI AGENT</text>
        
        <circle cx="200" cy="80" r="24" fill="var(--color-primary-muted)" stroke="var(--color-primary)" strokeWidth="2" />
        <path d="M192 72 L208 88 M192 88 L208 72" stroke="var(--color-primary)" strokeWidth="2" />
        <text x="200" y="120" fontSize="10" textAnchor="middle" fill="var(--color-primary)" fontWeight="700">CRE</text>

        <rect x="280" y="60" width="80" height="40" rx="8" fill="var(--color-bg)" stroke="var(--color-border)" />
        <text x="320" y="85" fontSize="10" textAnchor="middle" fill="var(--color-text-secondary)" fontWeight="600">MARKET</text>

        {/* Beams */}
        <path d="M120 80 Q160 80 176 80" fill="none" stroke="var(--color-border)" strokeWidth="1" strokeDasharray="4 4" />
        <path d="M224 80 Q240 80 280 80" fill="none" stroke="var(--color-border)" strokeWidth="1" strokeDasharray="4 4" />

        {/* Animated Particles */}
        <motion.circle
          r="3"
          fill="var(--color-primary)"
          initial={{ cx: 120, cy: 80, opacity: 0 }}
          animate={{ cx: [120, 176], opacity: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        />
        <motion.circle
          r="3"
          fill="#10b981"
          initial={{ cx: 224, cy: 80, opacity: 0 }}
          animate={{ cx: [224, 280], opacity: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 1 }}
        />
        
        {/* Glow Effects */}
        <defs>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
            <feMerge>
              <feMergeNode in="coloredBlur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
      </svg>
      
      <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Real-time Capital Orchestration
        </span>
      </div>
    </div>
  )
}
