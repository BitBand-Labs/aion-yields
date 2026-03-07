'use client'

import React from 'react'
import { AppShell } from '@/components/layout/AppShell'
import { Bell, Shield, Wallet, Monitor, Sliders, Globe, ShieldCheck, Key } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTheme } from 'next-themes'

export default function SettingsPage() {
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'dark';
  const isLight = currentTheme === 'light';

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
        style={{ maxWidth: 840 }}
      >
        <motion.div variants={{ hidden: { opacity: 0, y: 10 }, visible: { opacity: 1, y: 0 } }}>
          <h2 className="heading-md" style={{ margin: '0 0 var(--space-2)', fontWeight: 700, letterSpacing: '-0.02em' }}>
            Account Settings
          </h2>
          <p className="text-secondary" style={{ marginBottom: 'var(--space-8)' }}>
            Manage your account preferences, security, and AI agent permissions.
          </p>
        </motion.div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 'var(--space-8)' }} className="settings-grid">
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* General Preferences */}
            <motion.div 
              variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
              className="card-flat" style={{ padding: 0, overflow: 'hidden' }}
            >
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Monitor size={18} style={{ color: 'var(--color-primary)' }} />
                <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Regional & Display</h3>
              </div>
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                  <div>
                    <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 14 }}>System Currency</p>
                    <p className="text-caption" style={{ margin: 0, fontSize: 12 }}>Display balances and conversions in your native fiat.</p>
                  </div>
                  <select className="input" style={{ width: 140, height: 42, cursor: 'pointer', fontWeight: 600 }}>
                    <option value="usd">USD ($)</option>
                    <option value="eur">EUR (€)</option>
                    <option value="gbp">GBP (£)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 14 }}>Default Language</p>
                    <p className="text-caption" style={{ margin: 0, fontSize: 12 }}>Choose your preferred interface language.</p>
                  </div>
                  <select className="input" style={{ width: 140, height: 42, cursor: 'pointer', fontWeight: 600 }}>
                    <option value="en">English</option>
                    <option value="es">Español</option>
                    <option value="fr">Français</option>
                  </select>
                </div>
              </div>
            </motion.div>

            {/* AI Yield Preferences */}
            <motion.div 
              variants={{ hidden: { opacity: 0, x: -20 }, visible: { opacity: 1, x: 0 } }}
              className="card-flat" style={{ padding: 0, overflow: 'hidden' }}
            >
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Sliders size={18} style={{ color: 'var(--color-accent)' }} />
                <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>AI Core Parameters</h3>
              </div>
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                   <div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                         <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>Global Risk Tolerance</p>
                         <span style={{ fontWeight: 700, color: 'var(--color-primary)' }}>40%</span>
                      </div>
                      <input type="range" min="0" max="100" defaultValue="40" className="slider" style={{ width: '100%' }} />
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
                         <span className="text-caption" style={{ fontSize: 10, fontWeight: 700 }}>CONSERVATIVE</span>
                         <span className="text-caption" style={{ fontSize: 10, fontWeight: 700 }}>AGGRESSIVE</span>
                      </div>
                   </div>

                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderRadius: 12, background: 'var(--color-surface-hover)' }}>
                    <div>
                      <p style={{ margin: '0 0 4px', fontWeight: 600, fontSize: 14 }}>Autonomous Rebalancing</p>
                      <p className="text-caption" style={{ margin: 0, fontSize: 11 }}>Allow agents to optimize yield without manual approval.</p>
                    </div>
                    <label className="switch">
                      <input type="checkbox" defaultChecked />
                      <span className="slider-round"></span>
                    </label>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
             {/* Security Snapshot (Premium) */}
             <motion.div 
               variants={{ hidden: { opacity: 0, scale: 0.95 }, visible: { opacity: 1, scale: 1 } }}
               className="card-glow" 
               style={{ 
                 padding: '32px 24px', 
                 textAlign: 'center', 
                 background: isLight ? 'var(--color-bg)' : 'var(--color-surface-dark)', 
                 color: isLight ? 'var(--color-primary)' : 'var(--color-text-primary)',
                 border: isLight ? '1px solid var(--color-border-hover)' : 'none'
               }}
             >
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(52, 211, 153, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-success)', margin: '0 auto 200px'.replace('200px', '20px') }}>
                   <ShieldCheck size={32} />
                </div>
                <h4 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700 }}>Security Score: 92/100</h4>
                <p style={{ fontSize: 13, color: isLight ? 'var(--color-primary)' : 'var(--overlay-half-strong)', lineHeight: 1.6, margin: '0 0 24px', opacity: isLight ? 0.8 : 1 }}>Your account is protected with Hardware Wallet authentication and CCIP Guardian.</p>
                <button className="btn btn-primary" style={{ width: '100%', borderRadius: 12 }}>
                   <Key size={16} /> Enhance Security
                </button>
             </motion.div>

             {/* Connected Wallets */}
            <motion.div 
              variants={{ hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 } }}
              className="card-flat" style={{ padding: 0, overflow: 'hidden' }}
            >
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
                <Wallet size={18} style={{ color: 'var(--color-text-tertiary)' }} />
                <h3 className="heading-sm" style={{ margin: 0, fontWeight: 700 }}>Connectivity</h3>
              </div>
              <div style={{ padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 16, borderBottom: '1px solid var(--color-surface-hover)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-success)', boxShadow: '0 0 8px var(--color-success)' }} />
                    <div>
                      <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13 }}>Primary Ledger</p>
                      <p className="text-caption" style={{ margin: 0, fontFamily: 'var(--font-mono)', fontSize: 11 }}>0x71C...976F</p>
                    </div>
                  </div>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }}>Update</button>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--color-border)' }} />
                    <div>
                      <p style={{ margin: '0 0 2px', fontWeight: 600, fontSize: 13 }}>Smart Account</p>
                      <p className="text-caption" style={{ margin: 0, fontSize: 11 }}>Multi-sig inactive</p>
                    </div>
                  </div>
                  <button className="btn btn-sm btn-secondary" style={{ borderRadius: 6, fontSize: 11 }}>Setup</button>
                </div>
              </div>
            </motion.div>
          </div>

        </div>
      </motion.div>
    </AppShell>
  )
}
