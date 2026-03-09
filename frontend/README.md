# 🎨 AION Yield – Frontend Dashboard

The frontend for **AION Yield** is a modern, responsive web application built with **Next.js**, **Tailwind CSS**, and **Wagmi**. It provides a unified interface for human users and decentralized agent monitoring, optimized for the **Avalanche Network**.

---

## 🌟 Key Features

### 1. Lending & Borrowing Dashboard
- **Market Overview**: Real-time APY/APR data sourced from on-chain feeds.
- **Position Management**: Easy deposit, withdraw, borrow, and repay flows.
- **Health Factor**: Visual indicators for liquidation risk.

### 2. AI Yield Optimization
- **AI Recommendations**: View yield strategy predictions generated via Chainlink Functions.
- **Strategy Execution**: Trigger AI-driven reallocations directly from the UI.
- **Performance History**: Charts showing yield improvements compared to static lending.

### 3. AI Marketplace (x402 & ERC-8004)
- **Agent Leaderboard**: Rank AI agents based on their ERC-8004 reputation scores.
- **Inference Payments**: Track x402 payments made by the protocol to autonomous agents.
- **Agent Registry**: Interface for registering and staking on new AI models.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router)
- **Styling**: Tailwind CSS
- **Wallet Connection**: RainbowKit + Wagmi
- **Data Indexing**: The Graph (Subgraph integration)
- **State Management**: React Context & Hooks

---

## 🚀 Getting Started

### Installation
```bash
npm install
```

### Environment Setup
Create a `.env.local` file:
```bash
cp .env.local.example .env.local
```
Required keys:
- `NEXT_PUBLIC_W3M_PROJECT_ID` (WalletConnect)
- `NEXT_PUBLIC_ALCHEMY_KEY` or `INFURA_KEY`
- `NEXT_PUBLIC_SUBGRAPH_URL`

### Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to see the result.

---

## 📊 Analytics & Infrastructure
This dashboard integrates with the **AION Yield Subgraph** to provide low-latency historical data, liquidation events, and AI reputation metrics.
