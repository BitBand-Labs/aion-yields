'use client'

import React from 'react'
import Link from 'next/link'
import { motion, useScroll, useTransform, Variants } from 'framer-motion'
import {
  ArrowRight, Shield, Zap, Network, Cpu, Database, Activity, Layers, ExternalLink
} from 'lucide-react'

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.2 }
  }
}

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: [0.22, 1, 0.36, 1] } }
}

export default function LandingPage() {
  const { scrollYProgress } = useScroll();
  const yHero = useTransform(scrollYProgress, [0, 1], [0, 300]);
  const opacityHero = useTransform(scrollYProgress, [0, 0.2], [1, 0]);

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', overflow: 'hidden', color: 'var(--color-text-primary)', fontFamily: 'var(--font-inter, sans-serif)' }}>
      {/* Background Gradients & Noise */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-30%', left: '-10%', width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(8,71,247,0.15) 0%, transparent 60%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-20%', width: '80vw', height: '80vw', background: 'radial-gradient(circle, rgba(138,166,249,0.08) 0%, transparent 70%)', filter: 'blur(100px)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--overlay-ultralight) 1px, transparent 1px), linear-gradient(90deg, var(--overlay-ultralight) 1px, transparent 1px)', backgroundSize: '64px 64px', opacity: 0.5, maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)' }} />
      </div>

      {/* Navbar */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8 }}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 48px', borderBottom: '1px solid var(--overlay-light)',
          background: 'rgba(11,16,28, 0.6)', backdropFilter: 'blur(24px)',
          position: 'sticky', top: 0, zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, #0847F7, #396CF9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>
            AI
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em' }}>AION Yield</span>
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
             <Link href="/dashboard" style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--overlay-medium)', background: 'var(--overlay-light)', color: 'var(--color-text-primary)', textDecoration: 'none', fontWeight: 500, fontSize: 14, transition: 'background 0.2s' }}>
                Connect Wallet
             </Link>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05, boxShadow: '0 8px 20px rgba(8,71,247,0.4)' }} whileTap={{ scale: 0.98 }}>
             <Link href="/dashboard" style={{ padding: '10px 20px', borderRadius: 8, background: '#0847F7', color: 'var(--color-text-primary)', textDecoration: 'none', fontWeight: 500, fontSize: 14 }}>
                Launch App
             </Link>
          </motion.div>
        </div>
      </motion.nav>

      {/* Hero */}
      <section style={{ position: 'relative', zIndex: 10, minHeight: '90vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 24px' }}>
        <motion.div style={{ y: yHero, opacity: opacityHero, textAlign: 'center', maxWidth: 1000, position: 'relative' }}>
          
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.1 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 100, background: 'rgba(8,71,247,0.1)', border: '1px solid rgba(8,71,247,0.2)', color: '#8AA6F9', fontSize: 14, fontWeight: 500, marginBottom: 32 }}
          >
            <Zap size={16} /> Base Network • Chainlink CRE
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ fontSize: 'clamp(56px, 7vw, 96px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.04em', marginBottom: 32 }}
          >
            <span style={{ color: 'var(--overlay-high)' }}>AI-Orchestrated</span> <br />
            <span style={{ background: 'linear-gradient(90deg, #8AA6F9, #0847F7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Money Market Protocol</span>
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
            style={{ fontSize: 22, color: 'var(--overlay-half-strong)', maxWidth: 700, margin: '0 auto 48px', lineHeight: 1.6 }}
          >
            Next-generation decentralized finance. Deposit assets, earn yield, and let autonomous AI agents optimize your capital and manage liquidation risks across chains.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4 }}
            style={{ display: 'flex', gap: 20, justifyContent: 'center' }}
          >
            <motion.div whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(8,71,247,0.5)' }} whileTap={{ scale: 0.98 }}>
              <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '18px 36px', borderRadius: 12, background: '#0847F7', color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>
                Start Optimizing <ArrowRight size={18} />
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05, backgroundColor: 'var(--overlay-medium-light)' }} whileTap={{ scale: 0.98 }}>
              <a href="#architecture" style={{ display: 'flex', alignItems: 'center', padding: '18px 36px', borderRadius: 12, border: '1px solid var(--overlay-medium-strong)', background: 'var(--overlay-ultralight-2)', color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 600, textDecoration: 'none', backdropFilter: 'blur(10px)' }}>
                View Architecture
              </a>
            </motion.div>
          </motion.div>

        </motion.div>

        {/* Floating UI Morph Animations */}
      </section>

      {/* Metrics Section (Scroll animate) */}
      <motion.section 
        initial={{ y: 50, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        style={{ maxWidth: 1200, margin: '0 auto 160px', padding: '0 24px', position: 'relative', zIndex: 10 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, background: 'var(--overlay-ultralight)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 32, padding: 48, boxShadow: '0 40px 80px rgba(0,0,0,0.3)' }}>
          {[
            { label: 'Total Value Locked', value: '$24.8M' },
            { label: 'Total Borrowed', value: '$14.2M' },
            { label: 'AI Inferences', value: '14K+' },
            { label: 'Markets Supported', value: '12 Assets' }
          ].map((stat, i) => (
            <motion.div key={i} whileHover={{ y: -5 }} style={{ textAlign: 'center', position: 'relative' }}>
              {i > 0 && <div style={{ position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 1, background: 'linear-gradient(to bottom, transparent, var(--overlay-medium), transparent)' }} />}
              <p style={{ color: 'var(--overlay-half)', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', marginBottom: 12, letterSpacing: '0.05em' }}>{stat.label}</p>
              <p style={{ fontSize: 44, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.03em', lineHeight: 1.1 }}>{stat.value}</p>
            </motion.div>
          ))}
        </div>
      </motion.section>

      {/* Product Architecture */}
      <section id="architecture" style={{ maxWidth: 1200, margin: '0 auto 160px', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} style={{ textAlign: 'center', marginBottom: 80 }}>
          <h2 style={{ fontSize: 56, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 24, letterSpacing: '-0.04em' }}>Autonomous Capital</h2>
          <p style={{ fontSize: 22, color: 'var(--overlay-half-strong)', maxWidth: 700, margin: '0 auto', lineHeight: 1.6 }}>
            A machine-to-machine DeFi economy powered entirely by verifiable smart contracts and AI agents doing the heavy lifting.
          </p>
        </motion.div>

        <motion.div variants={containerVariants} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-100px' }} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
          {[
            { icon: <Database size={32} />, title: "Smart Deposits", desc: "Interact with gasless, abstracted accounts. Capital is instantly routed to the safest base layer yields.", color: "#8AA6F9", bg: 'rgba(138,166,249,0.05)' },
            { icon: <Activity size={32} />, title: "AI Assessment", desc: "Machine learning models analyze on-chain liquidity depth and external risk signals 24/7.", color: "#4A21C2", bg: 'rgba(74,33,194,0.1)' },
            { icon: <Zap size={32} />, title: "Auto Rebalancing", desc: "Agents preemptively rebalance portfolios via Chainlink CCIP before market cascades occur.", color: "#217B71", bg: 'rgba(33,123,113,0.1)' }
          ].map((item, i) => (
            <motion.div 
              key={i} variants={itemVariants}
              whileHover={{ y: -16, scale: 1.02, boxShadow: '0 40px 80px rgba(0,0,0,0.4)', backgroundColor: 'var(--overlay-light)' }}
              style={{ padding: 48, borderRadius: 32, background: 'linear-gradient(180deg, var(--overlay-ultralight) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid var(--overlay-light)', backdropFilter: 'blur(20px)', transition: 'background-color 0.4s ease' }}
            >
              <div style={{ width: 80, height: 80, borderRadius: 24, background: item.bg, color: item.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 36, border: `1px solid ${item.color}40`, boxShadow: `inset 0 0 20px ${item.color}20, 0 8px 16px rgba(0,0,0,0.2)` }}>
                {item.icon}
              </div>
              <h3 style={{ fontSize: 28, fontWeight: 700, color: 'var(--color-text-primary)', marginBottom: 16, letterSpacing: '-0.02em' }}>{item.title}</h3>
              <p style={{ color: 'var(--overlay-half)', lineHeight: 1.7, fontSize: 17 }}>{item.desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </section>

      {/* Asymmetrical Layout - Chainlink Integration */}
      <motion.section 
        initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1 }}
        style={{ position: 'relative', padding: '160px 0', borderTop: '1px solid var(--overlay-light)', borderBottom: '1px solid var(--overlay-light)', overflow: 'hidden' }}
      >
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', right: 0, background: 'radial-gradient(ellipse at right, rgba(8,71,247,0.15) 0%, transparent 70%)', zIndex: 0 }} />
        
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(480px, 1fr) 1fr', gap: 100, alignItems: 'center', padding: '0 24px', position: 'relative', zIndex: 10 }}>
          <motion.div initial={{ x: -50, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 20px', borderRadius: 100, background: 'var(--overlay-light)', color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 32, border: '1px solid var(--overlay-medium)' }}>
              POWERED BY CHAINLINK
            </div>
            <h2 style={{ fontSize: 56, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 24, lineHeight: 1.05, letterSpacing: '-0.04em' }}>
              The ultimate oracle <br/>& interoperability.
            </h2>
            <p style={{ fontSize: 20, color: 'var(--overlay-half-strong)', lineHeight: 1.7, marginBottom: 48 }}>
              AION leverages the full suite of Chainlink services to ensure institutional-grade security, cross-chain composability, and verifiable AI workflows without compromising decentralization.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
              {[
                { icon: <Layers size={28} />, title: "Chainlink CRE (Runtime)", desc: "Orchestrating multi-step workflows securely across chains." },
                { icon: <Network size={28} />, title: "Cross-Chain Composability", desc: "Sourcing liquidity via CCIP to chase highest global yields." },
                { icon: <Cpu size={28} />, title: "Functions & Automation", desc: "Fetching off-chain AI ML inferences with zero-downtime execution." }
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(8,71,247,0.15)', color: '#8AA6F9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(8,71,247,0.3)' }}>
                    {item.icon}
                  </div>
                  <div>
                    <h4 style={{ fontSize: 20, fontWeight: 600, color: 'var(--color-text-primary)', margin: '0 0 10px' }}>{item.title}</h4>
                    <p style={{ margin: 0, color: 'var(--overlay-half)', fontSize: 17, lineHeight: 1.6 }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 1 }}
            style={{ position: 'relative', height: 720, borderRadius: 40, background: 'linear-gradient(135deg, var(--overlay-ultralight-2) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid var(--overlay-medium-light)', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            {/* Dark background inside card */}
            <div style={{ position: 'absolute', inset: 0, background: '#080C14' }} />
            
            {/* SVG Grid lines */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--overlay-ultralight-2) 1px, transparent 1px), linear-gradient(90deg, var(--overlay-ultralight-2) 1px, transparent 1px)', backgroundSize: '80px 80px', opacity: 1 }} />
            
            {/* Rotating rings */}
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: "linear" }} style={{ position: 'absolute', width: 500, height: 500, border: '1px solid rgba(8,71,247,0.3)', borderRadius: '50%', boxShadow: '0 0 40px rgba(8,71,247,0.1)' }} />
            <motion.div animate={{ rotate: -360 }} transition={{ duration: 80, repeat: Infinity, ease: "linear" }} style={{ position: 'absolute', width: 340, height: 340, border: '1px dashed var(--overlay-medium-strong)', borderRadius: '50%' }} />
            
            {/* Premium center node */}
            <motion.div animate={{ y: [-15, 15, -15] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} style={{ position: 'relative', padding: 32, borderRadius: 32, background: 'var(--overlay-light)', backdropFilter: 'blur(32px)', border: '1px solid var(--overlay-medium)', boxShadow: '0 30px 60px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 80, height: 80, borderRadius: 20, background: 'linear-gradient(135deg, #0847F7, #396CF9)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 60px rgba(8,71,247,0.8)' }}>
                 <Network size={40} color="#fff" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--overlay-half)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Decentralized Inference</p>
                <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>CRE Verified</p>
              </div>
            </motion.div>

            {/* Satellites */}
            <motion.div style={{ position: 'absolute', width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 0 24px #fff' }} animate={{ x: [0, 250, 0, -250, 0], y: [-250, 0, 250, 0, -250] }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} />
            <motion.div style={{ position: 'absolute', width: 12, height: 12, borderRadius: '50%', background: '#0847F7', boxShadow: '0 0 20px #0847F7' }} animate={{ x: [0, -170, 0, 170, 0], y: [170, 0, -170, 0, 170] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }} />
          </motion.div>
        </div>
      </motion.section>

      {/* AI Economy - Layered Cards */}
      <section style={{ maxWidth: 1200, margin: '160px auto', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        <div style={{ textAlign: 'center', marginBottom: 100 }}>
          <h2 style={{ fontSize: 56, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 24, letterSpacing: '-0.04em' }}>The Agentic Economy</h2>
          <p style={{ fontSize: 22, color: 'var(--overlay-half-strong)', maxWidth: 700, margin: '0 auto', lineHeight: 1.6 }}>
            A new paradigm for machine-to-machine value exchange. Treat AI models as sophisticated economic agents.
          </p>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 40 }}>
          <motion.div 
            initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} whileHover={{ y: -16, transition: { duration: 0.3 } }}
            style={{ position: 'relative', padding: 56, borderRadius: 40, background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid var(--overlay-medium-light)', overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.3)' }}
          >
            <div style={{ position: 'absolute', top: -150, right: -150, width: 400, height: 400, background: 'radial-gradient(circle, rgba(138,166,249,0.2) 0%, transparent 60%)', filter: 'blur(60px)' }} />
            <div style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 20px', borderRadius: 100, background: 'rgba(138,166,249,0.1)', color: '#8AA6F9', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 32 }}>HTTP 402 STANDARD</div>
            <h3 style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 24, letterSpacing: '-0.02em' }}>x402 Inference Payments</h3>
            <p style={{ color: 'var(--overlay-half)', fontSize: 18, lineHeight: 1.7 }}>
              A crypto-native HTTP payment standard resurrecting the HTTP 402 "Payment Required" code. When our protocol queries an AI model, it natively settles the microtransaction instantly via USDC.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} whileHover={{ y: -16, transition: { duration: 0.3 } }}
            style={{ position: 'relative', padding: 56, borderRadius: 40, background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid var(--overlay-medium-light)', overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.3)' }}
          >
            <div style={{ position: 'absolute', top: -150, left: -150, width: 400, height: 400, background: 'radial-gradient(circle, rgba(247,184,8,0.15) 0%, transparent 60%)', filter: 'blur(60px)' }} />
            <div style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 20px', borderRadius: 100, background: 'rgba(247,184,8,0.1)', color: '#F7B808', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 32 }}>REPUTATION STANDARD</div>
            <h3 style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 24, letterSpacing: '-0.02em' }}>ERC-8004 Agent Identity</h3>
            <p style={{ color: 'var(--overlay-half)', fontSize: 18, lineHeight: 1.7 }}>
              A transparent on-chain registry gives AI agents an immutable reputation. Models state collateral slashed upon malicious predictions, guaranteeing institutional-grade trust and scale.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#02050A', paddingTop: 100, paddingBottom: 60, borderTop: '1px solid var(--overlay-medium-light)', position: 'relative', zIndex: 10 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 32 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: 'linear-gradient(135deg, #0847F7, #396CF9)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16 }}>AI</div>
            <span style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>AION Yield</span>
          </div>
          <p style={{ color: 'var(--overlay-half)', fontSize: 18, maxWidth: 500, marginBottom: 48, lineHeight: 1.6 }}>
            Built for the Chainlink Convergence Hackathon. Setting the standard for AI-driven DeFi.
          </p>
          <div style={{ display: 'flex', gap: 40, marginBottom: 80 }}>
            <motion.a whileHover={{ color: 'var(--color-text-primary)' }} href="#" style={{ color: 'var(--overlay-half)', textDecoration: 'none', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, transition: 'color 0.2s' }}>
              Documentation <ExternalLink size={16} />
            </motion.a>
            <motion.a whileHover={{ color: 'var(--color-text-primary)' }} href="https://github.com/ChainNomads/AION-Yield" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--overlay-half)', textDecoration: 'none', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, transition: 'color 0.2s' }}>
              GitHub <ExternalLink size={16} />
            </motion.a>
            <motion.a whileHover={{ color: 'var(--color-text-primary)' }} href="#" style={{ color: 'var(--overlay-half)', textDecoration: 'none', fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, transition: 'color 0.2s' }}>
              Base Explorer <ExternalLink size={16} />
            </motion.a>
          </div>
          <div style={{ width: '100%', height: 1, background: 'var(--overlay-light)', marginBottom: 40 }} />
          <p style={{ color: 'rgba(255,255,255,0.3)', fontSize: 15, margin: 0 }}>
            © {new Date().getFullYear()} AION Yield Protocol. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
