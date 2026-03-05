'use client'

import React, { ReactNode } from 'react'
import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { base, baseSepolia } from '@reown/appkit/networks'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

const projectId = process.env.NEXT_PUBLIC_PROJECT_ID || 'b56816460394348a735c02450371424c'

const metadata = {
  name: 'AionYield',
  description: 'AI-Orchestrated Money Market Protocol on Base',
  url: 'https://aionyield.vercel.app',
  icons: ['https://assets.reown.com/reown-profile-pic.png']
}

const networks = [base, baseSepolia]

const wagmiAdapter = new WagmiAdapter({
  networks,
  projectId,
  ssr: true
})

createAppKit({
  adapters: [wagmiAdapter],
  networks: [base, baseSepolia],
  projectId,
  metadata,
  features: {
    analytics: true
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#375BD2',
    '--w3m-color-mix': '#0B101C',
    '--w3m-color-mix-strength': 20,
    '--w3m-border-radius-master': '2px',
  }
})

export function Web3Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  )
}
