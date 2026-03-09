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
- [x] **Warp Messaging via Teleporter**: Cross-chain logic migrated from CCIP to Avalanche Teleporter/ICM.
- [ ] **Product Walkthrough Video**: Record a max 5-minute video demonstrating key features.

## Stage 3 & Phase 2 (Advanced)
- [ ] **Avalanche Subnet (AION Subnet)**: Set up dedicated execution framework for high-throughput AI strategy execution.
- [x] **Avalanche Warp Messaging natively**: Migrated from CCIP to native Teleporter/ICM for cross-chain messaging.
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
- [x] ~~Chainlink CCIP~~ → Avalanche Teleporter — CrossChainVault (Lock & Message pattern, Sepolia ↔ Fuji)
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
- [x] Lock & Message Teleporter pattern (no LINK fees, validator-secured)
- [x] Token mapping (source chain token → local equivalent)
- [x] Remote vault wiring (both directions)
- [x] Fuji vault funded with 100k MockUSDC for destination deposits

## Testing (COMPLETED)
- [x] Unit tests for LendingPool (deposit, borrow, withdraw, repay, liquidate)
- [x] Oracle manipulation tests
- [x] Liquidation edge case tests
- [x] Chainlink Functions mock tests
- [x] Automation simulation tests
- [x] CrossChainVault tests (13 tests — config, source deposit, receiveTeleporterMessage, end-to-end, admin)
- [x] WarpMessaging tests (37 tests — message routing, deposits, withdrawals, rate sync, liquidity, multi-chain)
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
- [x] chain_reader.py — Web3 on-chain data fetching (multi-chain: Sepolia + Fuji)
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
| CrossChainVault | `0x5a41D93Edc7016Cb2c27CC897751063a9e3dDDc3` |
| CREExecutionHook | `0x17562500756BaB6757E13ce84C6D207A4D144948` |
| PolicyEngine | `0x2CfD29a609F822f734e70950a02Db066566d2faA` |
| ChainlinkPriceOracle | `0xdBF02AeBf96D1C3E8B4E35f61C27A37cc6f601e4` |
| MockUSDC | `0x331cB2F787b2DC57855Bb30B51bE09aEF53e84C0` |

## Avalanche Fuji
| Contract | Address |
|----------|---------|
| LendingPool | `0x3547aD159ACAf2660bc5E26E682899D11826c068` |
| AIYieldEngine | `0x104895cc071Fb53ba9d4851c0fe1B896dCEB558A` |
| CrossChainVault | `0xf9f48fD24bfF611891Fa7608d5864445cf875E08` |
| MockUSDC | `0xa35C19170526eB8764a995fb5298eD1156B1b379` |

---

# KNOWN ISSUES (Resolved)

- [x] **Cross-chain "chain not supported" error** — providers.tsx imported avalanche mainnet instead of avalancheFuji testnet. Fixed.
- [x] **CCIP token transfer reverted** — Custom MockUSDC not in CCIP token pool whitelist. Fixed by rewriting CrossChainVault to Lock & Message pattern.
- [x] **CCIP "Ready for manual execution"** — Fuji vault had 0 MockUSDC reserves. Fixed by minting 100k MockUSDC to vault.
- [x] **Network switching not working** — Added appkit-network-button to Header and configured defaultNetwork/allowUnsupportedChain in AppKit.
- [x] **Hardhat v3 ESM import errors** — `import { ethers } from "hardhat"` doesn't work; must use `network.connect()` pattern.
- [x] **Chai matchers not available** — No `@nomicfoundation/hardhat-chai-matchers`; used try/catch `expectRevert()` helper.

# OPEN ISSUES

- [ ] **Chainlink Functions bridge not operational** — The Chainlink Functions path (`ChainlinkFunctionsConsumer → AIYieldEngine`) requires a funded Functions subscription + DON configuration. Currently non-functional on testnet. The AI engine (FastAPI) produces valid recommendations but there is no bridge to submit them on-chain. **Solution:** Build an executor script that calls the `/analyze` endpoint, extracts rate/allocation recommendations, and submits them directly to `AIYieldEngine.submitRateRecommendation()` / `submitAllocationRecommendation()` on-chain using a keeper wallet.

- [ ] **x402 payment not wired to AI execution flow** — The x402 payment infrastructure (`X402PaymentGateway`, `AIRevenueDistributor`) exists but is completely disconnected from `AIYieldEngine`. When an AI agent's recommendation is auto-executed via `_applyRecommendedRates()` or `_applyRecommendedAllocation()`, no x402 payment is triggered. The agent does the work but never gets paid. **Solution:** Add payment hooks inside `AIYieldEngine` so that after a successful auto-execution: (1) call `X402PaymentGateway.processInferencePayment()` to pay the agent from protocol escrow, and (2) call `AIRevenueDistributor.recordAgentRevenue()` to track earnings for epoch-based distribution (70% agent pool, 15% top agent bonus, 10% community, 5% protocol reserve).

- [ ] **AIYieldEngine not connected to AIAgentRegistry** — `receivePrediction()` accepts an `agentId` but never validates the caller against the registry. Any address can submit predictions claiming any agent ID. No reputation updates after predictions. **Solution:** Add AIAgentRegistry reference to AIYieldEngine; validate callers are registered agents; update reputation scores after prediction outcomes.

- [ ] **ChainlinkFunctionsConsumer is stub implementation** — `sendRequest()` doesn't actually call the Chainlink Functions router — it creates a mock requestId. `fulfillRequest()` has the router validation commented out (`//require(msg.sender == functionsRouter)`), meaning anyone can call it. The contract is placeholder code, not a working Chainlink Functions integration.

- [ ] **CREExecutionHook post-hooks are all stubs** — `_applyRateAdjustment()`, `_applyLiquidationResults()`, `_applyRebalanceResults()`, and `_applyRiskResults()` all just return `true` without executing anything. Only `_applyAllocationResults()` actually calls AIYieldEngine. CRE workflows complete but no actions are taken.

- [ ] **LiquidationAutomation doesn't execute liquidations** — `performUpkeep()` only emits a `LiquidationTriggered` event and stores `lastLiquidationTime`. It never calls `lendingPool.liquidate()`. Comment says "In production: execute actual liquidation". Unhealthy positions are detected but never closed.

- [ ] **AutonomousAllocator has no protocol adapters** — Contract expects `IProtocolAdapter`-compliant contracts for Aave, Morpho, etc. but no adapters are deployed or registered. `registerProtocol()` was never called in deployment. `_executeRebalance()` will revert trying to call non-existent adapters.

- [ ] **PolicyEngine never configured with policies** — `AIYieldEngine.receivePrediction()` and `AutonomousAllocator.executeAllocation()` use `policyCheck()` modifier, but no policies are registered at deployment. `GovernanceController.addPolicy()` was never called. ACE compliance framework is inert.

- [ ] **GovernanceController has no governed contracts** — `governedContracts` mapping is empty. `addGovernedContract()` was never called in setup. `queueProposal()` requires target to be governed, so no governance proposals can be created.

- [ ] **ProtocolFeeController disconnected from LendingPool** — LendingPool calculates reserve factors and mints treasury shares but never calls `ProtocolFeeController.collectFees()` or `distributeFees()`. Fee collection/distribution is broken.

- [ ] **Deployment scripts missing critical wiring** — `wire_contracts.ts` only sets 3 connections (AutonomousAllocator ↔ AIYieldEngine + MockUSDC support). Missing: AIAgentRegistry on AIYieldEngine, X402PaymentGateway integration, PolicyEngine setup, GovernanceController registration, ChainlinkFunctionsConsumer initialization, LiquidationAutomation user tracking.

- [ ] **Frontend AI inference bypasses smart contracts** — `/agents/page.tsx` calls `fetch('http://localhost:8000/analyze')` directly. Results are never submitted to on-chain contracts. Payment processing is a local simulation, not on-chain x402 settlement.

- [ ] **Frontend analytics/portfolio show mock data** — `/analytics/page.tsx` has hardcoded TVL, metrics, and cross-chain activity. `/portfolio/page.tsx` has hardcoded portfolio data and mocked AI activities. No real on-chain data queries.

# REMAINING TASKS

## Smart Contract Wiring (Critical)
- [ ] AI executor script (bridge FastAPI recommendations → on-chain AIYieldEngine)
- [ ] Wire AIAgentRegistry to AIYieldEngine (validate agents, update reputation)
- [ ] Wire x402 payment hooks into AIYieldEngine (pay agents on successful auto-execution)
- [ ] Implement CREExecutionHook post-hooks (actually execute rate/liquidation/rebalance actions)
- [ ] Implement LiquidationAutomation.performUpkeep() to call LendingPool.liquidate()
- [ ] Deploy & register protocol adapters for AutonomousAllocator (Aave V3, Morpho)
- [ ] Complete wire_contracts.ts with all missing inter-contract connections
- [ ] Configure PolicyEngine with initial policies
- [ ] Register governed contracts in GovernanceController
- [ ] Connect ProtocolFeeController to LendingPool fee flow

## Frontend (Data)
- [ ] Connect analytics page to real on-chain data
- [ ] Connect portfolio page to real on-chain data
- [ ] Wire agents page AI inference → on-chain submission
- [ ] Portfolio page — performance charts, AI prediction line

## Infrastructure
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Static analysis (Slither / MythX)
- [ ] Vercel production deployment

## Hackathon Deliverables
- [ ] CRE CLI simulation demo
- [ ] Record 5-min Hackathon product walkthrough video
- [ ] Submit Stage 2 MVP to Avalanche Build Games platform

---

**Team:** BitBand-Labs (Taiwo & Nonso)
**Networks:** Ethereum Sepolia, Avalanche Fuji
**Hackathon:** Chainlink Convergence
