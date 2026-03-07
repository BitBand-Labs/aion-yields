'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { useAccount } from 'wagmi'
import { useAppKit } from '@reown/appkit/react'
import { useTheme } from 'next-themes'
import toast, { Toaster } from 'react-hot-toast'
import { motion, useScroll, useTransform, Variants, AnimatePresence } from 'framer-motion'
import {
  ArrowRight, Shield, Zap, Network, Cpu, Database, Activity, Layers, ExternalLink, Wallet, ChevronUp, Twitter, Github
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

  // Theme logic
  const { theme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const currentTheme = mounted ? (theme === 'system' ? resolvedTheme : theme) : 'dark';
  const isLight = currentTheme === 'light';

  // Wallet Connection logic
  const { isConnected } = useAccount();
  const { open } = useAppKit();

  // Scroll to Top logic
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleLaunchApp = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!isConnected) {
      e.preventDefault();
      toast('Please connect your wallet before launching the app.', {
        icon: '⚠️',
        style: {
          borderRadius: '10px',
          background: 'var(--overlay-light)',
          color: 'var(--color-text-primary)',
          border: '1px solid var(--overlay-medium)',
        },
      });
    }
  };

  return (
    <div style={{ background: 'var(--color-bg)', minHeight: '100vh', overflow: 'hidden', color: 'var(--color-text-primary)', fontFamily: 'var(--font-inter, sans-serif)' }}>
      <Toaster position="top-center" reverseOrder={false} />
      {/* Background Gradients & Noise */}
      <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 0 }}>
        <div style={{ position: 'absolute', top: '-30%', left: '-10%', width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(14, 167, 203, 0.15) 0%, transparent 60%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-20%', width: '80vw', height: '80vw', background: 'radial-gradient(circle, rgba(14, 167, 203, 0.08) 0%, transparent 70%)', filter: 'blur(100px)' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--overlay-ultralight) 1px, transparent 1px), linear-gradient(90deg, var(--overlay-ultralight) 1px, transparent 1px)', backgroundSize: '64px 64px', opacity: 0.5, maskImage: 'radial-gradient(ellipse at center, black 40%, transparent 80%)' }} />
      </div>

      {/* Navbar */}
      <motion.nav
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8 }}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '20px 48px', borderBottom: `1px solid ${isLight ? 'rgba(14, 167, 203, 0.2)' : 'var(--overlay-light)'}`,
          background: isLight ? 'rgba(255,255,255, 0.8)' : 'rgba(11,16,28, 0.6)', 
          backdropFilter: isLight ? 'none' : 'blur(24px)',
          position: 'sticky', top: 0, zIndex: 50,
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }}>
          <img src="/assets/logo/AIONYIELD-logo-nobg.png" alt="AION Yield Logo" style={{ height: 42, width: 'auto' }} />
        </Link>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.98 }}>
            <button onClick={() => open()} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid var(--overlay-medium)', background: 'var(--overlay-light)', color: 'var(--color-text-primary)', cursor: 'pointer', fontWeight: 500, fontSize: 14, transition: 'background 0.2s', whiteSpace: 'nowrap' }}>
              {isConnected ? 'Connected' : 'Connect Wallet'}
            </button>
          </motion.div>
          <motion.div whileHover={{ scale: 1.05, boxShadow: '0 8px 20px rgba(14, 167, 203, 0.4)' }} whileTap={{ scale: 0.98 }}>
            <Link href="/dashboard" onClick={handleLaunchApp} style={{ display: 'inline-block', padding: '10px 20px', borderRadius: 8, background: '#0EA7CB', color: 'var(--color-text-primary)', textDecoration: 'none', fontWeight: 500, fontSize: 14, whiteSpace: 'nowrap' }}>
              Launch App
            </Link>
          </motion.div>
        </div>
      </motion.nav>

      {/* Hero */}
      <section style={{ position: 'relative', zIndex: 10, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 48px', overflow: 'hidden' }}>

        {/* ═══ LAYER 1: Background ═══ */}
        {/* Animated Grid Pattern */}
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
          <div style={{
            position: 'absolute', inset: 0,
            backgroundImage: 'linear-gradient(rgba(14, 167, 203, 0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(14, 167, 203, 0.06) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse at 70% 50%, black 20%, transparent 70%)',
          }} />
        </div>

        {/* Animated Gradient Glow */}
        <motion.div
          animate={{
            x: [0, 30, -20, 0],
            y: [0, -20, 15, 0],
            scale: [1, 1.1, 0.95, 1],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut' }}
          style={{
            position: 'absolute', top: '20%', right: '10%',
            width: '50vw', height: '50vw',
            background: 'radial-gradient(circle, rgba(14, 167, 203, 0.15) 0%, rgba(14, 167, 203, 0.08) 40%, transparent 70%)',
            filter: 'blur(80px)', pointerEvents: 'none', zIndex: 0,
          }}
        />

        {/* Video Background Asset */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '80%', height: '80%', opacity: 0.05, filter: 'blur(12px)', pointerEvents: 'none', zIndex: 0 }}>
          <video src="/assets/logo/logo-animation.mp4" autoPlay loop muted playsInline style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
        </div>

        {/* Floating Particles */}
        {Array.from({ length: 20 }).map((_, i) => (
          <motion.div
            key={`particle-${i}`}
            animate={{
              x: [0, Math.random() * 60 - 30, Math.random() * -40 + 20, 0],
              y: [0, Math.random() * -50 + 25, Math.random() * 40 - 20, 0],
              opacity: [0.15, 0.3, 0.1, 0.15],
            }}
            transition={{
              duration: 12 + Math.random() * 8,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: Math.random() * 5,
            }}
            style={{
              position: 'absolute',
              top: `${10 + Math.random() * 80}%`,
              left: `${40 + Math.random() * 55}%`,
              width: 3 + Math.random() * 4,
              height: 3 + Math.random() * 4,
              borderRadius: '50%',
              background: `radial-gradient(circle, ${Math.random() > 0.5 ? '#3DC5E4' : '#0EA7CB'}, transparent)`,
              boxShadow: `0 0 ${6 + Math.random() * 8}px ${Math.random() > 0.5 ? '#3DC5E4' : '#0EA7CB'}`,
              pointerEvents: 'none',
              zIndex: 1,
            }}
          />
        ))}

        {/* ═══ CONTENT GRID ═══ */}
        <motion.div
          style={{ y: yHero, opacity: opacityHero, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 48, alignItems: 'center', maxWidth: 1400, width: '100%', position: 'relative', zIndex: 2 }}
          className="hero-container"
        >
          {/* ═══ LEFT: Headlines + CTA (untouched) ═══ */}
          <motion.div style={{ opacity: 1, textAlign: 'left', position: 'relative', marginLeft: '60px' }}>
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.1 }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 16px', borderRadius: 100, background: 'rgba(14, 167, 203, 0.1)', border: '1px solid rgba(14, 167, 203, 0.2)', color: '#0EA7CB', fontSize: 14, fontWeight: 700, marginBottom: 32 }}
            >
              <Zap size={16} /> Multi-Chain Infrastructure • Chainlink CRE
            </motion.div>
            
            <motion.h1
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
              style={{ fontSize: 'clamp(48px, 6vw, 84px)', fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.04em', marginBottom: 32 }}
            >
              <span style={{ color: 'var(--overlay-high)' }}>AI-Orchestrated</span> <br />
              <span style={{ background: 'linear-gradient(90deg, #3DC5E4, #0EA7CB)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Money Market Protocol</span>
            </motion.h1>
            
            <motion.p
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              style={{ fontSize: 20, color: 'var(--overlay-half-strong)', maxWidth: 600, margin: '0 0 48px', lineHeight: 1.6 }}
            >
              Next-generation decentralized finance. Deposit assets, earn yield, and let autonomous AI agents optimize your capital and manage liquidation risks across chains.
            </motion.p>
            
            <motion.div 
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.4 }}
              style={{ display: 'flex', gap: 20 }}
            >
              <motion.div whileHover={{ scale: 1.05, boxShadow: '0 0 40px rgba(14, 167, 203, 0.5)' }} whileTap={{ scale: 0.98 }}>
                <Link href="/dashboard" onClick={handleLaunchApp} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '16px 32px', borderRadius: 12, background: '#0EA7CB', color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>
                  Start Optimizing <ArrowRight size={18} />
                </Link>
              </motion.div>
              <motion.div whileHover={{ scale: 1.05, backgroundColor: 'var(--overlay-medium-light)' }} whileTap={{ scale: 0.98 }}>
                <a href="#architecture" style={{ display: 'flex', alignItems: 'center', padding: '16px 32px', borderRadius: 12, border: '1px solid var(--overlay-medium-strong)', background: 'var(--overlay-ultralight-2)', color: 'var(--color-text-primary)', fontSize: 16, fontWeight: 600, textDecoration: 'none', backdropFilter: 'blur(10px)' }}>
                  View Architecture
                </a>
              </motion.div>
            </motion.div>
          </motion.div>

          {/* ═══ RIGHT: Layer 2 — Cycling Hero Illustrations ═══ */}
          <motion.div
            initial={{ opacity: 0, x: 50, filter: 'blur(10px)' }}
            animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
            transition={{ duration: 1.2, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ position: 'relative', width: '100%', height: 500, display: 'flex', justifyContent: 'center', alignItems: 'center' }}
          >
            {/* Gradient glow behind images */}
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.12, 0.2, 0.12] }}
              transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
                width: '120%', height: '120%',
                background: 'radial-gradient(circle, rgba(14, 167, 203, 0.2) 0%, rgba(14, 167, 203, 0.1) 40%, transparent 65%)',
                filter: 'blur(40px)', pointerEvents: 'none', zIndex: 0,
              }}
            />

            {/* Crossfading images with floating motion */}
            {[
              '/assets/illustrations/HERO-ILLUSTRATION-alt.png',
              '/assets/illustrations/HERO-ILLUSTRATION.png',
              // '/assets/illustrations/3D-ABSTRACT-GRAPHICS-nobg.png',
            ].map((src, i) => (
              <motion.div
                key={src}
                animate={{
                  opacity: [
                    i === 0 ? 1 : 0, i === 0 ? 1 : 0, // 0-6s
                    i === 1 ? 1 : 0, i === 1 ? 1 : 0, // 6-12s
                  ],
                  y: [0, -10, 0, 10, 0],
                }}
                transition={{
                  opacity: {
                    duration: 12, // 2 images * 6s
                    repeat: Infinity,
                    times: [0, 0.4, 0.5, 0.9, 1], // Crossfade timings for 2 items
                    ease: 'easeInOut',
                  },
                  y: {
                    duration: 8,
                    repeat: Infinity,
                    ease: 'easeInOut',
                  },
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  zIndex: 1,
                }}
              >
                <img
                  src={src}
                  alt="AION Yield"
                  style={{ width: '100%', height: 'auto', maxWidth: 580, objectFit: 'contain' }}
                />
              </motion.div>
            ))}
          </motion.div>
        </motion.div>
      </section>

      {/* Metrics Section (Scroll animate) */}
      <motion.section 
        initial={{ y: 50, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, margin: '-100px' }} transition={{ duration: 1, ease: [0.22, 1, 0.36, 1] }}
        style={{ maxWidth: 1200, margin: '80px auto 160px', padding: '0 24px', position: 'relative', zIndex: 10 }}
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

      {/* Feature Sections */}
      <section id="architecture" style={{ maxWidth: 1200, margin: '0 auto 160px', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        
        {/* 1️⃣ AI Yield Optimization */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1.2fr) 1fr', gap: 80, alignItems: 'center', marginBottom: 160 }}>
          <motion.div initial={{ opacity: 0, scale: 0.8, x: -50 }} whileInView={{ opacity: 1, scale: 1, x: 0 }} viewport={{ amount: 0.3 }} transition={{ duration: 0.8 }} style={{ position: 'relative' }}>
            {isLight && (
              <div style={{ position: 'absolute', inset: -40, background: 'radial-gradient(circle, rgba(14, 167, 203, 0.08) 0%, transparent 70%)', filter: 'blur(40px)', zIndex: -1 }} />
            )}
            <img src="/assets/illustrations/AI-FEATURE.png" alt="AI Yield Optimization" style={{ width: '100%', height: 'auto', borderRadius: 32, /* boxShadow: '0 40px 80px rgba(0,0,0,0.5)' */ }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
            <h2 style={{ fontSize: 48, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 24, letterSpacing: '-0.04em' }}>AI Yield Optimization</h2>
            <p style={{ fontSize: 20, color: 'var(--overlay-half-strong)', lineHeight: 1.7, marginBottom: 32 }}>
              AION is the first protocol to use verifiably autonomous AI agents to optimize your capital across diverse money markets. No more manual searching or static allocations.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                "AI vault optimization: Instant routing to highest risk-adjusted yields.",
                "Automatic rebalancing: Agents move capital proactively before you even blink.",
                "Yield prediction: Advanced ML models forecasting APY trends and liquidity depth."
              ].map((text, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 18, color: 'var(--overlay-half)', fontWeight: 500 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(14, 167, 203, 0.1)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✓</div>
                  {text}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>

        {/* 2️⃣ Cross-Chain Liquidity */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr minmax(400px, 1.2fr)', gap: 80, alignItems: 'center', marginBottom: 160 }}>
          <motion.div initial={{ opacity: 0, x: -50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
            <h2 style={{ fontSize: 48, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 24, letterSpacing: '-0.04em' }}>Cross-Chain Liquidity</h2>
            <p style={{ fontSize: 20, color: 'var(--overlay-half-strong)', lineHeight: 1.7, marginBottom: 32 }}>
              Liquidity should never be silos. AION uses Chainlink CCIP to bridge assets and orchestrate capital efficiency across the entire EVM landscape effortlessly.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                "CCIP transfers: Secure, decentralized cross-chain asset movement.",
                "Multi-chain vaults: Unified account abstraction for all your liquidity.",
                "Liquidity routing: Automated arbitrage and yield chasing across protocols."
              ].map((text, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 18, color: 'var(--overlay-half)', fontWeight: 500 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(14, 167, 203, 0.1)', color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✓</div>
                  {text}
                </li>
              ))}
            </ul>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.8, x: 50 }} whileInView={{ opacity: 1, scale: 1, x: 0 }} viewport={{ amount: 0.3 }} transition={{ duration: 0.8 }} style={{ position: 'relative' }}>
            {isLight && (
              <div style={{ position: 'absolute', inset: -40, background: 'radial-gradient(circle, rgba(14, 167, 203, 0.08) 0%, transparent 70%)', filter: 'blur(40px)', zIndex: -1 }} />
            )}
            <img src="/assets/illustrations/CROSS-CHAIN.png" alt="Cross-Chain Liquidity" style={{ width: '100%', height: 'auto', borderRadius: 32, /* boxShadow: '0 40px 80px rgba(0,0,0,0.5)' */ }} />
          </motion.div>
        </div>

        {/* 3️⃣ Autonomous Payments */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(400px, 1.2fr) 1fr', gap: 80, alignItems: 'center' }}>
          <motion.div initial={{ opacity: 0, scale: 0.8, x: -50 }} whileInView={{ opacity: 1, scale: 1, x: 0 }} viewport={{ amount: 0.3 }} transition={{ duration: 0.8 }} style={{ position: 'relative' }}>
            {isLight && (
              <div style={{ position: 'absolute', inset: -40, background: 'radial-gradient(circle, rgba(33,123,113,0.08) 0%, transparent 70%)', filter: 'blur(40px)', zIndex: -1 }} />
            )}
            <img src="/assets/illustrations/MACHINE-PAYMENTS.png" alt="Autonomous Payments" style={{ width: '100%', height: 'auto', borderRadius: 32, /* boxShadow: '0 40px 80px rgba(0,0,0,0.5)' */ }} />
          </motion.div>
          <motion.div initial={{ opacity: 0, x: 50 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
            <h2 style={{ fontSize: 48, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 24, letterSpacing: '-0.04em' }}>Autonomous Payments</h2>
            <p style={{ fontSize: 20, color: 'var(--overlay-half-strong)', lineHeight: 1.7, marginBottom: 32 }}>
              A new machine-to-machine economy is here. Set on-chain triggers and let AI agents handle settlements, payouts, and rebalancing tasks in real-time.
            </p>
            <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
              {[
                "Automated yield payouts: Native yield streaming for your positions.",
                "AI-driven rebalancing: Smart execution of capital movement workflows.",
                "Programmable payments: x402-ready machine-to-machine microtransactions."
              ].map((text, i) => (
                <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 16, fontSize: 18, color: 'var(--overlay-half)', fontWeight: 500 }}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'rgba(33,123,113,0.1)', color: '#217B71', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>✓</div>
                  {text}
                </li>
              ))}
            </ul>
          </motion.div>
        </div>
      </section>

      {/* Asymmetrical Layout - Chainlink Integration */}
      <motion.section 
        initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ duration: 1 }}
        style={{ position: 'relative', padding: '100px 0', borderTop: '1px solid var(--overlay-light)', borderBottom: '1px solid var(--overlay-light)', overflow: 'hidden' }}
      >
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', right: 0, background: 'radial-gradient(ellipse at right, rgba(14, 167, 203, 0.15) 0%, transparent 70%)', zIndex: 0 }} />
        
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(480px, 1fr) 1fr', gap: 100, alignItems: 'center', padding: '0 24px', position: 'relative', zIndex: 10 }}>
          <motion.div initial={{ x: -50, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 20px', borderRadius: 100, background: 'var(--overlay-light)', color: 'var(--color-text-primary)', fontSize: 13, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 32, border: '1px solid var(--overlay-medium)' }}>
              POWERED BY CHAINLINK
            </div>
            <h2 style={{ fontSize: 56, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 20, lineHeight: 1.05, letterSpacing: '-0.04em' }}>
              The ultimate oracle <br/>& interoperability.
            </h2>
            <p style={{ fontSize: 20, color: 'var(--overlay-half-strong)', lineHeight: 1.7, marginBottom: 32 }}>
              AION leverages the full suite of Chainlink services to ensure institutional-grade security, cross-chain composability, and verifiable AI workflows without compromising decentralization.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
              {[
                { icon: <Layers size={28} />, title: "Chainlink CRE (Runtime)", desc: "Orchestrating multi-step workflows securely across chains." },
                { icon: <Network size={28} />, title: "Cross-Chain Composability", desc: "Sourcing liquidity via CCIP to chase highest global yields." },
                { icon: <Cpu size={28} />, title: "Functions & Automation", desc: "Fetching off-chain AI ML inferences with zero-downtime execution." }
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(14, 167, 203, 0.15)', color: '#3DC5E4', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid rgba(14, 167, 203, 0.3)' }}>
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
            style={{ 
              position: 'relative', 
              height: 600, 
              borderRadius: 40, 
              background: isLight 
                ? 'linear-gradient(135deg, rgba(14, 167, 203, 0.02) 0%, rgba(255,255,255,0.01) 100%)' 
                : 'transparent',
              border: isLight ? '1px solid rgba(0,0,0,0.05)' : 'none',
              overflow: 'hidden', 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center' 
            }}
          >
            {/* Theme-aware background inside card */}
            <div style={{ position: 'absolute', inset: 0, background: isLight ? 'var(--color-bg)' : '#080C14' }} />
            
            {/* SVG Grid lines */}
            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(var(--overlay-ultralight-2) 1px, transparent 1px), linear-gradient(90deg, var(--overlay-ultralight-2) 1px, transparent 1px)', backgroundSize: '80px 80px', opacity: 1 }} />
            
            {/* Rotating rings */}
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 60, repeat: Infinity, ease: "linear" }} style={{ position: 'absolute', width: 500, height: 500, border: '1px solid rgba(14, 167, 203, 0.3)', borderRadius: '50%', boxShadow: '0 0 40px rgba(14, 167, 203, 0.1)' }} />
            <motion.div animate={{ rotate: -360 }} transition={{ duration: 80, repeat: Infinity, ease: "linear" }} style={{ position: 'absolute', width: 340, height: 340, border: '1px dashed var(--overlay-medium-strong)', borderRadius: '50%' }} />
            
            {/* Premium center node */}
            <motion.div animate={{ y: [-15, 15, -15] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} style={{ position: 'relative', padding: 32, borderRadius: 32, background: 'var(--overlay-light)', backdropFilter: 'blur(32px)', border: '1px solid var(--overlay-medium)', boxShadow: '0 30px 60px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
              <div style={{ width: 80, height: 80, borderRadius: 20, background: 'linear-gradient(135deg, #0EA7CB, #3DC5E4)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 60px rgba(14, 167, 203, 0.8)' }}>
                 <Network size={40} color="#fff" />
              </div>
              <div style={{ textAlign: 'center' }}>
                <p style={{ margin: 0, fontSize: 13, color: isLight ? 'var(--color-primary)' : 'var(--overlay-half)', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>Decentralized Inference</p>
                <p style={{ margin: '6px 0 0', fontSize: 24, fontWeight: 700, color: 'var(--color-text-primary)', letterSpacing: '-0.02em' }}>CRE Verified</p>
              </div>
            </motion.div>

            {/* Satellites */}
            <motion.div style={{ position: 'absolute', width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 0 24px #fff' }} animate={{ x: [0, 250, 0, -250, 0], y: [-250, 0, 250, 0, -250] }} transition={{ duration: 10, repeat: Infinity, ease: "linear" }} />
            <motion.div style={{ position: 'absolute', width: 12, height: 12, borderRadius: '50%', background: '#0EA7CB', boxShadow: '0 0 20px #0EA7CB' }} animate={{ x: [0, -170, 0, 170, 0], y: [170, 0, -170, 0, 170] }} transition={{ duration: 8, repeat: Infinity, ease: "linear" }} />
          </motion.div>
        </div>
      </motion.section>

      {/* AI Economy - Layered Cards */}
      <section style={{ maxWidth: 1200, margin: '120px auto', padding: '0 24px', position: 'relative', zIndex: 10 }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <h2 style={{ fontSize: 56, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 24, letterSpacing: '-0.04em' }}>The Agentic Economy</h2>
          <p style={{ fontSize: 22, color: 'var(--overlay-half-strong)', maxWidth: 700, margin: '0 auto', lineHeight: 1.6 }}>
            A new paradigm for machine-to-machine value exchange. Treat AI models as sophisticated economic agents.
          </p>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 40 }}>
          <motion.div 
            initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} whileHover={{ y: -16, transition: { duration: 0.3 } }}
            style={{ position: 'relative', padding: 40, borderRadius: 40, background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid var(--overlay-medium-light)', overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.3)' }}
          >
            <div style={{ position: 'absolute', top: -150, right: -150, width: 400, height: 400, background: 'radial-gradient(circle, rgba(14, 167, 203, 0.2) 0%, transparent 60%)', filter: 'blur(60px)' }} />
            <div style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 20px', borderRadius: 100, background: 'rgba(14, 167, 203, 0.1)', color: '#0EA7CB', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 24 }}>HTTP 402 STANDARD</div>
            <h3 style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 24, letterSpacing: '-0.02em' }}>x402 Inference Payments</h3>
            <p style={{ color: 'var(--overlay-half)', fontSize: 18, lineHeight: 1.7 }}>
              A crypto-native HTTP payment standard resurrecting the HTTP 402 "Payment Required" code. When our protocol queries an AI model, it natively settles the microtransaction instantly via USDC.
            </p>
          </motion.div>

          <motion.div 
            initial={{ opacity: 0, y: 50 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: '-50px' }} whileHover={{ y: -16, transition: { duration: 0.3 } }}
            style={{ position: 'relative', padding: 40, borderRadius: 40, background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid var(--overlay-medium-light)', overflow: 'hidden', boxShadow: '0 40px 80px rgba(0,0,0,0.3)' }}
          >
            <div style={{ position: 'absolute', top: -150, left: -150, width: 400, height: 400, background: 'radial-gradient(circle, rgba(247,184,8,0.15) 0%, transparent 60%)', filter: 'blur(60px)' }} />
            <div style={{ display: 'inline-flex', alignItems: 'center', padding: '8px 20px', borderRadius: 100, background: 'rgba(247,184,8,0.1)', color: '#F7B808', fontSize: 13, fontWeight: 700, letterSpacing: '0.05em', marginBottom: 24 }}>REPUTATION STANDARD</div>
            <h3 style={{ fontSize: 36, fontWeight: 800, color: 'var(--color-text-primary)', marginBottom: 24, letterSpacing: '-0.02em' }}>ERC-8004 Agent Identity</h3>
            <p style={{ color: 'var(--overlay-half)', fontSize: 18, lineHeight: 1.7 }}>
              A transparent on-chain registry gives AI agents an immutable reputation. Models state collateral slashed upon malicious predictions, guaranteeing institutional-grade trust and scale.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ background: '#02050A', borderTop: '1px solid var(--overlay-medium-light)', position: 'relative', zIndex: 10 }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '40px 48px 30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 32, marginBottom: 32 }}>
            {/* Left: Brand + Desc */}
            <div style={{ flex: '1 1 300px' }}>
              <div style={{ marginBottom: 16 }}>
                <img src="/assets/logo/AIONYIELD-logo-nobg.png" alt="AION Yield Logo" style={{ height: 40, width: 'auto' }} />
              </div>
              <p style={{ color: isLight ? 'var(--color-primary)' : 'var(--overlay-half)', fontSize: 16, lineHeight: 1.6, maxWidth: 400 }}>
                Autonomous AI agents optimizing cross-chain capital allocation. Built for the future of decentralized money markets.
              </p>
            </div>

            {/* Right: Socials */}
            <div style={{ display: 'flex', gap: 24 }}>
              <motion.a 
                whileHover={{ y: -4, color: 'var(--color-text-primary)' }} 
                href="https://twitter.com/AIONYield" target="_blank" rel="noopener noreferrer" 
                style={{ color: 'var(--overlay-half)', transition: 'color 0.2s' }}
              >
                <Twitter size={24} />
              </motion.a>
              <motion.a 
                whileHover={{ y: -4, color: 'var(--color-text-primary)' }} 
                href="https://github.com/ChainNomads/AION-Yield" target="_blank" rel="noopener noreferrer" 
                style={{ color: 'var(--overlay-half)', transition: 'color 0.2s' }}
              >
                <Github size={24} />
              </motion.a>
              <motion.a 
                whileHover={{ y: -4, color: 'var(--color-text-primary)' }} 
                href="#" 
                style={{ color: 'var(--overlay-half)', transition: 'color 0.2s' }}
              >
                <ExternalLink size={24} />
              </motion.a>
            </div>
          </div>

          <div style={{ width: '100%', height: 1, background: 'var(--overlay-light)', marginBottom: 24 }} />
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
            <p style={{ color: isLight ? 'rgba(14, 167, 203, 0.6)' : 'rgba(255,255,255,0.3)', fontSize: 14, margin: 0 }}>
              © {new Date().getFullYear()} AION Yield Protocol. Built for Chainlink Convergence.
            </p>
            <div style={{ display: 'flex', gap: 32 }}>
              <Link href="/terms" style={{ color: isLight ? 'var(--color-primary)' : 'rgba(255,255,255,0.3)', textDecoration: 'none', fontSize: 14 }}>Terms</Link>
              <Link href="/privacy" style={{ color: isLight ? 'var(--color-primary)' : 'rgba(255,255,255,0.3)', textDecoration: 'none', fontSize: 14 }}>Privacy</Link>
            </div>
          </div>
        </div>
      </footer>
      <AnimatePresence>
        {showScrollTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.5, y: 20 }}
            whileHover={{ scale: 1.1, backgroundColor: '#0C8EA9' }}
            whileTap={{ scale: 0.9 }}
            onClick={scrollToTop}
            style={{
              position: 'fixed',
              bottom: '40px',
              right: '40px',
              width: '50px',
              height: '50px',
              borderRadius: '50%',
              background: '#0EA7CB',
              color: 'white',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
              boxShadow: '0 8px 32px rgba(14,167,203,0.3)',
              backdropFilter: 'blur(8px)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'rgba(255,255,255,0.1)'
            }}
          >
            <ChevronUp size={24} />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
