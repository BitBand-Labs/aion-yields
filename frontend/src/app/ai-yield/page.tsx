'use client'

import React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { StatCard } from '@/components/ui/StatCard'
import { Badge } from '@/components/ui/Badge'
import { Cpu, TrendingUp, Zap, Clock, Shield, ArrowRight, Activity } from 'lucide-react'
import { motion } from 'framer-motion'

const activeStrategies = [
  { name: 'Stablecoin Alpha', asset: 'USDC', apy: '6.24%', staticApy: '4.10%', status: 'active', risk: 'Low' },
  { name: 'ETH Yield Chase', asset: 'ETH', apy: '3.89%', staticApy: '2.15%', status: 'active', risk: 'Medium' },
]

const recentActivity = [
  { time: '12 min ago', action: 'Rebalanced USDC from Aave to Morpho', agent: 'Agent_0x4f...2a', gain: '+0.4% APY' },
  { time: '1 hr ago', action: 'Supplied ETH to Loop strategy', agent: 'Agent_0x1b...9c', gain: '+1.2% APY' },
  { time: '4 hrs ago', action: 'Triggered preemptive withdrawal (Risk Alert)', agent: 'Agent_0x8d...3e', gain: 'Protected Asset' },
]

export default function AIYieldPage() {
  return (
    <AppShell>
      <motion.div
        initial="hidden"
        animate="visible"
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1 }
          }
        }}
      >
        <motion.div 
          variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-8)' }}
        >
          <div>
            <h2 className="heading-md" style={{ margin: '0 0 var(--space-2)', fontWeight: 700, letterSpacing: '-0.02em' }}>
              AI Yield Optimization
            </h2>
            <p className="text-secondary" style={{ margin: 0 }}>
              Orchestrated by Chainlink CRE and autonomous ERC-8004 agents
            </p>
          </div>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.98 }}
            className="btn btn-primary"
            style={{ borderRadius: 8, boxShadow: 'var(--shadow-glow)' }}
          >
            <Cpu size={16} /> Enable Auto-Optimization
          </motion.button>
        </motion.div>

        {/* Stats row */}
        <div className="grid-stats" style={{ marginBottom: 'var(--space-8)' }}>
          <StatCard
            label="Total Capital Optimized"
            value="$18.4M"
            icon={<Cpu size={40} />}
          />
          <StatCard
            label="Average Bonus Yield"
            value="+2.41%"
            change="vs static markets"
            changeType="positive"
            icon={<TrendingUp size={40} />}
          />
          <StatCard
            label="Chainlink CRE Inferences"
            value="1,248"
            change="past 24 hours"
            changeType="neutral"
            icon={<Zap size={40} />}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 'var(--space-6)' }} className="ai-grid">
          
          {/* Main Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            
            {/* Active Strategies Panel */}
            <motion.div 
              variants={{ hidden: { opacity: 0, scale: 0.98 }, visible: { opacity: 1, scale: 1 } }}
              className="card-flat" style={{ padding: 0, overflow: 'hidden' }}
            >
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Active Strategies</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                   <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--color-success)', boxShadow: '0 0 8px var(--color-success)' }} />
                   <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-success)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Live Feed</span>
                </div>
              </div>
              
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Strategy Name</th>
                    <th>Asset</th>
                    <th>Current APY</th>
                    <th>Base APY</th>
                    <th>Risk Profile</th>
                    <th style={{ textAlign: 'right' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeStrategies.map((strat, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{strat.name}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                           <span style={{ fontSize: 14 }}>{strat.asset === 'USDC' ? '🔵' : '⟠'}</span>
                           {strat.asset}
                        </div>
                      </td>
                      <td><span style={{ color: 'var(--color-success)', fontWeight: 700 }}>{strat.apy}</span></td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{strat.staticApy}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Shield size={14} style={{ color: strat.risk === 'Low' ? 'var(--color-success)' : 'var(--color-warning)' }} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{strat.risk}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Badge variant="success" dot>Active</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </motion.div>

            {/* Performance Chart Placeholder */}
            <motion.div 
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="card-flat"
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--space-8)' }}>
                <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Yield Performance</h3>
                <div style={{ display: 'flex', gap: 'var(--space-2)', background: 'var(--color-bg)', padding: 4, borderRadius: 8 }}>
                  <button className="badge" style={{ background: 'transparent', cursor: 'pointer', border: 'none', color: 'var(--color-text-secondary)' }}>1W</button>
                  <button className="badge" style={{ background: 'var(--color-surface)', cursor: 'pointer', border: 'none', fontWeight: 600, boxShadow: 'var(--shadow-subtle)' }}>1M</button>
                  <button className="badge" style={{ background: 'transparent', cursor: 'pointer', border: 'none', color: 'var(--color-text-secondary)' }}>All</button>
                </div>
              </div>

              <div style={{ height: 280, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', borderBottom: '1px solid var(--color-border)', position: 'relative', marginBottom: 24 }}>
                {/* Y-axis labels */}
                <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: 'var(--color-text-tertiary)', fontSize: 11, fontWeight: 600 }}>
                  <span>8%</span>
                  <span>6%</span>
                  <span>4%</span>
                  <span>2%</span>
                  <span>0%</span>
                </div>
                
                {/* Fake chart bars */}
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', height: '100%', paddingLeft: 40, gap: 12 }}>
                  {[40, 45, 60, 55, 75, 80, 70, 85].map((h, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '10%', height: '100%', justifyContent: 'flex-end', position: 'relative' }}>
                      <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: h + '%' }}
                        transition={{ duration: 1, delay: i * 0.1 }}
                        style={{ width: '100%', background: 'linear-gradient(to top, var(--color-primary), var(--color-primary-light))', borderTopLeftRadius: 6, borderTopRightRadius: 6, zIndex: 2 }} 
                      />
                      <motion.div 
                        initial={{ height: 0 }}
                        animate={{ height: (h * 0.6) + '%' }}
                        transition={{ duration: 1, delay: i * 0.1 + 0.2 }}
                        style={{ width: '100%', background: 'var(--color-secondary)', position: 'absolute', bottom: 0, borderTopLeftRadius: 6, borderTopRightRadius: 6, opacity: 0.3, zIndex: 1 }} 
                      />
                    </div>
                  ))}
                </div>
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'center', gap: 'var(--space-8)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 14, height: 14, background: 'var(--color-primary)', borderRadius: 4 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Optimized AI Yield</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 14, height: 14, background: 'var(--color-secondary)', borderRadius: 4, opacity: 0.5 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Base Protocol Yield</span>
                </div>
              </div>
            </motion.div>
            
          </div>

          {/* Sidebar Column */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            
            {/* Agent Activity Feed */}
            <motion.div 
              variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
              className="card" style={{ padding: '24px', position: 'relative', overflow: 'hidden' }}
            >
              {/* Subtle pattern background */}
              <div style={{ position: 'absolute', top: 0, right: 0, width: '100px', height: '100px', background: 'radial-gradient(circle, var(--color-primary-muted) 0%, transparent 70%)', opacity: 0.5 }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)' }}>
                <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Agent Activity</h3>
                <Activity size={18} style={{ color: 'var(--color-primary)' }} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
                {recentActivity.map((act, i) => (
                  <motion.div 
                    key={i} 
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.1 }}
                    style={{ display: 'flex', gap: 16, position: 'relative' }}
                  >
                    {i !== recentActivity.length - 1 && (
                      <div style={{ position: 'absolute', left: 15, top: 32, bottom: -24, width: 2, background: 'var(--color-border)', opacity: 0.5 }} />
                    )}
                    <div style={{ 
                      width: 32, height: 32, borderRadius: 10, 
                      background: 'var(--color-bg)', 
                      border: '1px solid var(--color-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', 
                      flexShrink: 0, zIndex: 1 
                    }}>
                      <Clock size={14} color="var(--color-text-tertiary)" />
                    </div>
                    <div>
                      <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--color-text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {act.time}
                      </p>
                      <p style={{ margin: '0 0 8px', fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', lineHeight: 1.4 }}>
                        {act.action}
                      </p>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12, fontWeight: 500, padding: '4px 8px', borderRadius: 6, background: 'var(--color-bg)', color: 'var(--color-text-secondary)', fontFamily: 'var(--font-mono)' }}>{act.agent}</span>
                        <Badge variant="success" style={{ padding: '3px 8px', fontSize: 11 }}>{act.gain}</Badge>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
              
              <button className="btn btn-secondary" style={{ width: '100%', marginTop: 'var(--space-8)', borderRadius: 8 }}>
                View Full Audit Logs <ArrowRight size={14} style={{ marginLeft: 6 }} />
              </button>
            </motion.div>

            {/* AI Trust Card */}
            <motion.div 
              variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              className="card-glow"
              style={{ padding: 24 }}
            >
               <h4 style={{ fontSize: 14, fontWeight: 700, margin: '0 0 12px', color: 'var(--color-primary)' }}>Protocol Assurance</h4>
               <p style={{ fontSize: 13, color: 'var(--color-text-secondary)', lineHeight: 1.6, margin: 0 }}>
                 All agentic workflows are verified by Chainlink Runtime Environment. Malicious predictions trigger instant slashing of agent stake.
               </p>
            </motion.div>

          </div>
        </div>
      </motion.div>

      <style jsx global>{`
        @media (max-width: 1024px) {
          .ai-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </AppShell>
  )
}
