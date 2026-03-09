# AION Yield – Development Issues & Task Tracker

> Tracks development tasks, milestones, and known issues for **AION Yield** — an AI-Orchestrated Money Market Protocol built for the **Chainlink Convergence Hackathon**.

---

# High Priority Milestones

## Phase 0 – Project Setup (COMPLETED)
- [x] Define protocol architecture
- [x] Select Sepolia + Avalanche Fuji as deployment targets
- [x] Define Chainlink service integration scope (CRE, Functions, Automation, CCIP, Data Feeds, ACE)
- [x] Define AI + x402 + ERC-8004 integration architecture
- [x] Monorepo setup (smartcontract, frontend, ai-engine, doc)
- [x] Realign documentation for Avalanche Build Games Stage 2 (MVP)
- [ ] CI/CD pipeline (GitHub Actions)

---

# 🏔️ Avalanche Build Games (Hackathon Goals)

## Stage 2: MVP (Deadline: March 9)
- [x] **Avalanche C-Chain Integration**: Deploy core contracts to Fuji C-Chain.
- [x] **Technical Documentation**: Detailed architecture and README on GitHub.
- [ ] **Functional Prototype**: Live frontend interacting with Fuji contracts.
- [ ] **Warp Messaging via CCIP**: Ensure cross-chain logic demonstrates multi-chain awareness via C-Chain messaging.
- [ ] **Product Walkthrough Video**: Record a max 5-minute video demonstrating key features.

## Stage 3 & Phase 2 (Advanced)
- [ ] **Avalanche Subnet (AION Subnet)**: Set up dedicated execution framework for high-throughput AI strategy execution.
- [ ] **Avalanche Warp Messaging natively**: Move from CCIP abstraction to native Warp Messaging for subnet-to-C-chain communication.
- [ ] **Avalanche Bridge**: Integrate for external Ethereum liquidity sourcing.

---

# SMART CONTRACTS (Core Protocol)

## Money Market Core (COMPLETED)
- [x] LendingPool contract (deposit, borrow, withdraw, repay, liquidate)
- [x] Interest Rate Model (kink-based, AI-adjustable)
- [x] Collateral management + Health Factor calculations
- [x] Liquidation Engine with 50% close factor + bonus
- [x] Governance-controlled parameters

## Chainlink Integration (COMPLETED)
- [x] Chainlink Data Feeds — ChainlinkPriceOracle with fallback logic
- [x] Chainlink Automation — LiquidationAutomation (checkUpkeep/performUpkeep)
- [x] Chainlink Functions — ChainlinkFunctionsConsumer (AI inference bridge)
- [x] Chainlink CRE — CREExecutionHook (pre/post hook orchestration, 5 workflow types)
- [x] Chainlink CCIP — CrossChainVault (Lock & Message pattern, Sepolia ↔ Fuji)
- [x] Chainlink ACE — PolicyEngine + CertifiedActionValidator + VolumeRatePolicy

## AI Agent Registry (ERC-8004 Inspired) (COMPLETED)
- [x] Agent Identity Registry contract
- [x] Agent Reputation Scoring contract
- [x] Agent Staking & Slashing logic
- [x] Agent Selection Algorithm (top-N ranking)
- [x] Governance-controlled agent whitelist

## x402 Payment Integration (COMPLETED)
- [x] AI Payment Escrow contract
- [x] Payment settlement logic (USDC)
- [x] AI agent revenue distribution contract
- [x] Event emission for AI inference payments

## AI Engine — On-Chain (COMPLETED)
- [x] AIYieldEngine — receives predictions, applies rate recommendations
- [x] AutonomousAllocator — cross-protocol yield optimization (AION/Aave/Morpho)
- [x] Policy-protected AI actions (policyCheck modifier → ACE)

## Cross-Chain (COMPLETED)
- [x] CrossChainVault deployed on Sepolia and Fuji
- [x] Lock & Message CCIP pattern (bypasses token pool whitelist)
- [x] Token mapping (source chain token → local equivalent)
- [x] Remote vault wiring (both directions)
- [x] Fuji vault funded with 100k MockUSDC for destination deposits

## Testing (COMPLETED)
- [x] Unit tests for LendingPool (deposit, borrow, withdraw, repay, liquidate)
- [x] Oracle manipulation tests
- [x] Liquidation edge case tests
- [x] Chainlink Functions mock tests
- [x] Automation simulation tests
- [x] CrossChainVault tests (14 tests — config, source deposit, ccipReceive, end-to-end, admin)
- [ ] Static analysis (Slither / MythX)

---

# FRONTEND (Dashboard)

## Core UI (COMPLETED)
- [x] Next.js 15 project setup
- [x] Wallet connection (Reown AppKit / wagmi v2)
- [x] Network switching (Sepolia ↔ Avalanche Fuji) with appkit-network-button
- [x] Lending dashboard — supply, borrow, withdraw, repay
- [x] Markets page — asset listings with APY
- [x] Borrow dashboard — collateral, health factor
- [x] Position health visualization

## AI Yield Dashboard (COMPLETED)
- [x] AI recommended allocation UI
- [x] AI risk score display
- [x] Yield optimization visualizations
- [x] AI agent leaderboard (ERC-8004 reputation)
- [x] Agents page — trigger inference (Yield Prediction, Risk Assessment, Market Analysis)
- [x] x402 payment counter (simulated micropayments per inference)

## Portfolio Page
- [x] Portfolio page skeleton
- [ ] Net Worth + Performance charts
- [ ] AI Prediction Line in performance graphs
- [ ] Projected Value calculation (12 months)
- [ ] Live Strategy Feed (AI Activity Timeline)

## Premium UI (COMPLETED)
- [x] Framer Motion page transitions + staggered entrance animations
- [x] Studio Grade UI (Zinc/Neutral theme, 8pt grid, Cyan-Blue accent)
- [x] Dark/Light mode with system preference detection
- [x] Responsive design across all pages

---

# AI ENGINE (Python Backend) (COMPLETED)

- [x] FastAPI server (main.py) — /analyze, /predict, /reserve, /price, /external-apys
- [x] chain_reader.py — Web3 on-chain data fetching from Sepolia LendingPool
- [x] ai_strategy.py — Claude-powered rate + allocation analysis
- [x] External APY fetching (DeFi Llama — Aave V3, Compound)
- [x] CORS configured for frontend (localhost:3000, Vercel)

---

# DOCUMENTATION (COMPLETED)

- [x] README.md — hackathon pitch with mermaid diagrams + Chainlink code links
- [x] PROTOCOL_EXPLANATION.md — comprehensive protocol breakdown
- [x] Smart contract API docs (doc/smart-contract-api.md)
- [x] Chainlink CRE workflow documentation (doc/chainlink-cre-workflows.md)
- [x] AI architecture whitepaper (doc/ai-architecture-whitepaper.md)
- [x] x402 integration guide (doc/x402-integration-guide.md)
- [x] ERC-8004 registry specification (doc/erc8004-registry-spec.md)
- [x] Frontend developer guide (doc/frontend-developer-guide.md)
- [x] Deployment guide (doc/deployment-guide.md)

---

# DEPLOYED CONTRACTS

## Sepolia
| Contract | Address |
|----------|---------|
| LendingPool | `0x87Ff17e9A8f23D02E87d6E87B5631A7eE08C0248` |
| AIYieldEngine | `0x4a8Ec2D9655600bc5d5D3460e8680251C839E61D` |
| AutonomousAllocator | `0x7C9eF492Cc14A795d8BAa6937b4cF23F258Ce6f1` |
| CrossChainVault | `0x8A9dD3A9c0Bc6Dd9931fcD75112e6f516B71a9A2` |
| CREExecutionHook | `0x17562500756BaB6757E13ce84C6D207A4D144948` |
| PolicyEngine | `0x2CfD29a609F822f734e70950a02Db066566d2faA` |
| ChainlinkPriceOracle | `0xdBF02AeBf96D1C3E8B4E35f61C27A37cc6f601e4` |
| MockUSDC | `0x331cB2F787b2DC57855Bb30B51bE09aEF53e84C0` |

## Avalanche Fuji
| Contract | Address |
|----------|---------|
| LendingPool | `0x3547aD159ACAf2660bc5E26E682899D11826c068` |
| AIYieldEngine | `0x104895cc071Fb53ba9d4851c0fe1B896dCEB558A` |
| CrossChainVault | `0x666e7bD0bFBE5B004855d67aE6271933b3Df6A54` |
| MockUSDC | `0xa35C19170526eB8764a995fb5298eD1156B1b379` |

---

# KNOWN ISSUES (Resolved)

- [x] **Cross-chain "chain not supported" error** — providers.tsx imported avalanche mainnet instead of avalancheFuji testnet. Fixed.
- [x] **CCIP token transfer reverted** — Custom MockUSDC not in CCIP token pool whitelist. Fixed by rewriting CrossChainVault to Lock & Message pattern.
- [x] **CCIP "Ready for manual execution"** — Fuji vault had 0 MockUSDC reserves. Fixed by minting 100k MockUSDC to vault.
- [x] **Network switching not working** — Added appkit-network-button to Header and configured defaultNetwork/allowUnsupportedChain in AppKit.
- [x] **Hardhat v3 ESM import errors** — `import { ethers } from "hardhat"` doesn't work; must use `network.connect()` pattern.
- [x] **Chai matchers not available** — No `@nomicfoundation/hardhat-chai-matchers`; used try/catch `expectRevert()` helper.

# REMAINING TASKS

- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Static analysis (Slither / MythX)
- [ ] Portfolio page — performance charts, AI prediction line
- [ ] CRE CLI simulation demo
- [ ] Vercel production deployment
- [ ] Record 5-min Hackathon product walkthrough video
- [ ] Submit Stage 2 MVP to Avalanche Build Games platform

---

**Team:** ChainNomads (Taiwo & Nonso)
**Networks:** Ethereum Sepolia, Avalanche Fuji
**Hackathon:** Chainlink Convergence
