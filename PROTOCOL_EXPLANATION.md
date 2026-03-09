# AION Yield Protocol — Comprehensive Explanation

## What is AION Yield?

AION Yield is an **AI-orchestrated DeFi lending protocol** that combines traditional money market mechanics (supply, borrow, liquidate) with autonomous AI agents powered by **Anthropic Claude** and **Chainlink's decentralized infrastructure**. The AI continuously analyzes on-chain and off-chain market data to optimize interest rates, rebalance liquidity across protocols, and maximize risk-adjusted yields for users.

**Deployed on:** Ethereum Sepolia and Avalanche Fuji testnets.

---

## 🏔️ Avalanche Integration (The Execution Layer)

AION Yield is an AI-native DeFi automation layer built fundamentally on Avalanche's high-performance infrastructure. 

Chainlink CRE provides the **intelligence layer** that evaluates yield strategies, while Avalanche provides the **execution infrastructure**. This architecture enables autonomous agents to move liquidity across chains and protocols in real time.

**Core Integrations (MVP):**
1. **Avalanche C-Chain**: The primary smart contract container. Our Vaults and AI Agent Registries live here to leverage EVM compatibility, fast finality, and deep existing DeFi liquidity.
2. **Avalanche Warp Messaging**: Used for cross-chain AI agent coordination. For example, an AI agent on the C-Chain detects a higher yield on a specialized Subnet, and uses Warp Messaging to trigger the strategy change and liquidity movement.

**Advanced Integrations (Phase 2):**
3. **Avalanche Subnets (AION Subnet)**: A dedicated execution network for AI agents. Instead of running all high-frequency AI strategy evaluations on the C-Chain, we isolate execution to the AION Subnet for predictable, customizable gas limits and massive throughput.
4. **Avalanche Bridge**: Enables AION Yield to source and deploy liquidity from external ecosystems (like Ethereum Mainnet) directly into our Avalanche-native strategies.

---

## Protocol Architecture Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Next.js)                        │
│  Dashboard │ Markets │ Borrow │ AI Yield │ Agents │ Portfolio    │
└──────────────────────┬───────────────────────────────────────────┘
                       │ wagmi / viem
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                     SMART CONTRACTS (Solidity)                    │
│                                                                  │
│  ┌─────────────┐  ┌──────────────┐  ┌──────────────────────┐    │
│  │ LendingPool │◄─│ AIYieldEngine│◄─│ CREExecutionHook     │    │
│  │             │  │  (Policy-    │  │ (Chainlink CRE       │    │
│  │ deposit()   │  │  Protected)  │  │  Workflow Orchestrator│    │
│  │ borrow()    │  └──────┬───────┘  └──────────┬───────────┘    │
│  │ withdraw()  │         │                     │                 │
│  │ repay()     │  ┌──────▼───────┐  ┌──────────▼───────────┐    │
│  │ liquidate() │  │ Autonomous   │  │ ChainlinkFunctions   │    │
│  └──────┬──────┘  │ Allocator    │  │ Consumer             │    │
│         │         │ (Cross-Proto)│  │ (Off-chain AI calls) │    │
│         │         └──────────────┘  └──────────────────────┘    │
│         │                                                        │
│  ┌──────▼──────────────────────────────────────────────────┐     │
│  │              Chainlink ACE Policy Framework              │     │
│  │  PolicyEngine → CertifiedActionValidator + VolumeRate   │     │
│  └─────────────────────────────────────────────────────────┘     │
│                                                                  │
│  ┌──────────────┐  ┌───────────────┐  ┌────────────────────┐    │
│  │CrossChainVault│  │GovernanceCtrl │  │InterestRateModel   │    │
│  │ (CCIP Lock&  │  │(Policy mgmt) │  │(Kink-based rates)  │    │
│  │  Message)    │  └───────────────┘  └────────────────────┘    │
│  └──────────────┘                                                │
└──────────────────────────────────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                  AI ENGINE (Python / FastAPI)                     │
│  localhost:8000                                                   │
│                                                                  │
│  chain_reader.py ──► Reads on-chain reserve data via Web3        │
│  ai_strategy.py  ──► Calls Anthropic Claude for analysis         │
│  main.py         ──► FastAPI server: /analyze, /predict          │
└──────────────────────────────────────────────────────────────────┘
```

---

## Core Components — Detailed Breakdown

### 1. LendingPool (The Heart)

The LendingPool is the central contract where all user funds flow. It operates like Aave — users deposit assets to earn supply APY, and borrowers take loans against collateral.

**How Interest Works:**

The protocol uses a **kink-based interest rate model** (similar to Aave/Compound):

```
                    Borrow Rate
                         │
                    300% │                          ╱
                         │                        ╱
                         │                      ╱  ← Slope2 (penalty zone)
                    6%   │─────────────────────╱
                         │               ╱
                    2%   │─────────╱          ← Slope1 (normal zone)
                         │  ╱
                         │╱________________________
                         0%        80%       100%
                                Utilization
                              (kink point)
```

- **Below 80% utilization**: Rates increase gently (Slope1 = 4%)
- **Above 80% utilization**: Rates spike dramatically (Slope2 = 300%) to incentivize repayment
- **Supply APY** = borrowRate × utilization × (1 - reserveFactor)

**Scaled Balances (RAY Precision):**

Instead of tracking exact token amounts, the pool uses *scaled balances* with RAY (1e27) precision indices:

- When you deposit 100 USDC, the pool records `scaledSupply = 100 × 1e27 / liquidityIndex`
- As interest accrues over time, `liquidityIndex` grows (e.g., from 1.0 to 1.05)
- Your actual balance = `scaledSupply × liquidityIndex / 1e27` = 105 USDC (5% interest earned)
- This means interest compounds automatically without any transactions

**Health Factor & Liquidation:**

```
healthFactor = Σ(collateralValue × liquidationThreshold) / Σ(debtValue)
```

- If healthFactor < 1.0 → the position can be liquidated
- Liquidators can repay up to 50% of the debt and seize collateral + bonus (e.g., 5%)
- This protects the protocol from bad debt

---

### 2. AIYieldEngine (The AI Brain On-Chain)

The AIYieldEngine is the on-chain coordinator that receives AI recommendations and applies them to the protocol. It has two modes:

**Mode 1 — Rate Optimization:**
1. AI analyzes current utilization, external market rates, and risk factors
2. AI produces optimal rate parameters: `baseRate`, `slope1`, `slope2`, `optimalUtilization`
3. `receivePrediction()` stores the prediction with a confidence score
4. `submitRateRecommendation()` applies the recommendation if confidence ≥ 70%
5. Calls `LendingPool.aiAdjustRateParams()` to update the interest curve in real-time

**Mode 2 — Allocation Optimization:**
1. AI determines optimal liquidity split across protocols (AION, Aave, Morpho)
2. `submitAllocationRecommendation()` sends allocation targets to the AutonomousAllocator
3. The allocator rebalances funds across protocols to maximize yield

**Security:** Every AI action passes through the `policyCheck` modifier which enforces:
- Certificate-based authorization (EIP-712 signed by authorized signer)
- Volume/rate limits (max 10% TVL per action, max 5 actions per hour)

---

### 3. AutonomousAllocator (Cross-Protocol Yield Manager)

The AutonomousAllocator manages liquidity across multiple DeFi protocols to find the best risk-adjusted yield.

**How It Works:**
1. Receives allocation targets from AIYieldEngine (e.g., 50% AION, 30% Aave, 20% Morpho)
2. Compares current allocations vs targets
3. **Pass 1**: Withdraws from over-allocated protocols
4. **Pass 2**: Deposits into under-allocated protocols
5. Always maintains a 15% emergency buffer in the AION pool (for instant liquidity)

**Safety Mechanisms:**
- 4-hour cooldown between rebalances (prevents rapid fire)
- Per-protocol allocation caps (no single protocol gets >X%)
- Confidence gate: only auto-rebalances if AI confidence ≥ 75%
- Emergency withdrawal functions for instant protocol exit

---

### 4. CrossChainVault (CCIP Bridge)

Enables cross-chain deposits between Sepolia and Avalanche Fuji using **Chainlink CCIP**.

**Lock & Message Pattern** (not token bridging):

```
SOURCE CHAIN (e.g. Sepolia)           DESTINATION CHAIN (e.g. Fuji)
┌─────────────────────┐               ┌──────────────────────┐
│ 1. User deposits    │               │                      │
│    1000 USDC into   │               │                      │
│    CrossChainVault  │               │                      │
│                     │  CCIP Message  │                      │
│ 2. Vault locks      │──────────────►│ 4. Vault receives    │
│    tokens locally   │  (no tokens)  │    message            │
│                     │               │                      │
│ 3. Sends CCIP msg   │               │ 5. Deposits 1000     │
│    with (user,      │               │    USDC from its     │
│    token, amount)   │               │    reserves into     │
│                     │               │    LendingPool for   │
│                     │               │    user              │
└─────────────────────┘               └──────────────────────┘
```

Why message-only? Custom tokens (like our MockUSDC) aren't in CCIP's token pool whitelist. By sending only a message and having the destination vault deposit from its own reserves, we bypass this limitation.

**Token Mapping:** Each vault maps source chain tokens to their local equivalents (e.g., Sepolia MockUSDC → Fuji MockUSDC).

---

### 5. Chainlink ACE (Automated Compliance Engine)

ACE is the guardrail system that ensures AI agents can't go rogue. Every AI action must pass through these policy checks:

#### PolicyEngine (Central Router)
- Routes validation requests to registered policies
- Supports per-function policies and global policies
- Pre-validates before execution, post-records after execution

#### CertifiedActionValidatorPolicy (EIP-712 Certificates)
- Every AI action requires a signed certificate from an authorized signer
- Certificate contains: agent address, target contract, function selector, params hash, nonce, deadline
- Prevents unauthorized agents from executing actions
- Replay-protected via incremental nonces

#### VolumeRatePolicy (Rate Limits)
- **Per-action limit**: Maximum 10% of TVL per single action
- **Cumulative window limit**: Maximum 500,000 USDC per rolling window
- **Action frequency**: Maximum 5 actions per window
- **Window duration**: 1 hour (configurable per function)
- Prevents an AI agent from draining the protocol in rapid succession

---

## How Smart Contracts Interact with CRE

### What is CRE?

**Chainlink CRE (Compute Runtime Environment)** is a decentralized workflow orchestration system. It allows you to define multi-step workflows that combine on-chain data reading, off-chain computation (including AI inference), and on-chain transaction execution — all verified by Chainlink's decentralized oracle network.

### AION Yield's CRE Integration

The CRE integration happens through **CREExecutionHook.sol**, which acts as the bridge between Chainlink's off-chain compute and the on-chain protocol:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CRE WORKFLOW EXECUTION                        │
│                                                                 │
│  STEP 1: PRE-HOOK (On-Chain Data Gathering)                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │ CREExecutionHook.executePreHook(workflowType)           │    │
│  │                                                         │    │
│  │  1. Read LendingPool reserve data (supply, borrow,      │    │
│  │     rates, utilization)                                  │    │
│  │  2. Read asset prices from ChainlinkPriceOracle         │    │
│  │  3. Read AutonomousAllocator state (allocations, APYs)  │    │
│  │  4. Encode all data into preHookData                    │    │
│  │  5. Create executionId, emit PreHookExecuted event      │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  STEP 2: OFF-CHAIN COMPUTE (Chainlink DON / AI)                │
│  ┌──────────────────────▼──────────────────────────────────┐    │
│  │ Chainlink Functions DON receives preHookData             │    │
│  │                                                         │    │
│  │  1. JavaScript source code runs in DON sandbox          │    │
│  │  2. Calls external AI API (Claude) with market data     │    │
│  │  3. AI produces: rate params + allocation targets       │    │
│  │  4. Response encoded and returned to blockchain         │    │
│  └──────────────────────┬──────────────────────────────────┘    │
│                         │                                       │
│  STEP 3: POST-HOOK (On-Chain Execution)                        │
│  ┌──────────────────────▼──────────────────────────────────┐    │
│  │ CREExecutionHook.executePostHook(executionId, result)    │    │
│  │                                                         │    │
│  │  1. Decode AI result into rate params + allocations     │    │
│  │  2. Route to appropriate handler:                       │    │
│  │     - AI_RATE_ADJUSTMENT → AIYieldEngine                │    │
│  │       .submitRateRecommendation()                       │    │
│  │     - YIELD_ALLOCATION → AIYieldEngine                  │    │
│  │       .submitAllocationRecommendation()                  │    │
│  │     - LIQUIDATION_SCAN → LendingPool.liquidate()        │    │
│  │  3. ACE policies validate the action (policyCheck)      │    │
│  │  4. If valid, rates/allocations are updated on-chain    │    │
│  │  5. Emit PostHookExecuted event                         │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Workflow Types

The CREExecutionHook supports 5 workflow types:

| Workflow | Purpose | Pre-Hook Data | Post-Hook Action |
|----------|---------|---------------|------------------|
| `AI_RATE_ADJUSTMENT` | Optimize interest rates | Reserve data + prices | Update kink model params |
| `LIQUIDATION_SCAN` | Find undercollateralized positions | User positions + prices | Execute liquidations |
| `CROSS_CHAIN_REBALANCE` | Balance liquidity across chains | Cross-chain vault states | Trigger CCIP transfers |
| `RISK_MONITORING` | Continuous risk assessment | All reserve + price data | Alert or pause if needed |
| `YIELD_ALLOCATION` | Optimize cross-protocol allocation | Allocator state + APYs | Rebalance via allocator |

### ChainlinkFunctionsConsumer

This is the direct interface to Chainlink Functions for AI inference. It supports:

- **YIELD_PREDICTION**: Predict optimal yields
- **RISK_ASSESSMENT**: Evaluate position risk scores
- **RATE_OPTIMIZATION**: Recommend rate parameters
- **MARKET_ANALYSIS**: Analyze broader market conditions

The flow:
1. `sendRequest()` → submits JavaScript source code + encoded args to Chainlink DON
2. DON executes the JavaScript (which calls the AI API)
3. `fulfillRequest()` → callback with response
4. `_processResponse()` → parses result into `InferenceResult` struct and forwards to AIYieldEngine

---

## The AI Engine (Python Backend)

Running on **localhost:8000**, the AI engine is the off-chain intelligence layer:

### Architecture

```
┌───────────────────────────────────────────────────────┐
│                 AI Engine (FastAPI)                     │
│                                                       │
│  ┌─────────────┐    ┌──────────────┐                  │
│  │ chain_reader │    │ ai_strategy  │                  │
│  │              │    │              │                  │
│  │ Web3 calls   │──►│ Claude API   │                  │
│  │ to Sepolia   │    │ Analysis     │                  │
│  │ LendingPool  │    │              │                  │
│  └──────────────┘    └──────────────┘                  │
│                                                       │
│  Endpoints:                                           │
│  POST /analyze  ──► Full rate + allocation analysis    │
│  POST /predict  ──► Real-time yield prediction         │
│  GET  /reserve/{asset} ──► Raw reserve data            │
│  GET  /price/{asset}   ──► Asset price                 │
│  GET  /external-apys   ──► Aave/Compound rates         │
└───────────────────────────────────────────────────────┘
```

### What Happens When You Click "Predict and Analyze" (Agents Page)

When you click one of the inference buttons (Yield Prediction, Risk Assessment, or Market Analysis) on the **Agents page** (`localhost:3000/agents`), here is the exact flow:

#### Step-by-step:

1. **Frontend triggers `triggerInference()`**
   - Determines the endpoint: `/analyze` for Yield Prediction/Risk Assessment, `/predict` for Market Analysis
   - Sends POST request to `http://localhost:8000` with the MockUSDC address

2. **AI Engine receives the request** (`main.py`)
   - **`chain_reader.get_reserve_data()`**: Makes a Web3 RPC call to the LendingPool on Sepolia, reading:
     - Total supply and total borrow amounts
     - Current liquidity rate (supply APY) and variable borrow rate
     - Liquidity and borrow indices
     - Utilization rate (totalBorrow / totalSupply)
     - Reserve parameters (LTV, liquidation threshold, reserve factor)
   - **`chain_reader.get_asset_price()`**: Reads the Chainlink price oracle for the USD price
   - **`chain_reader.fetch_external_apys()`**: Fetches live APY data from DeFi Llama API for Aave V3 and Compound on Ethereum mainnet (for competitive benchmarking)

3. **Claude AI Analysis** (`ai_strategy.py`)
   - All gathered data is formatted into a structured prompt
   - Claude receives: current reserve state, asset price, and external protocol rates
   - Claude analyzes:
     - Current utilization vs optimal (75-85%)
     - How AION rates compare to Aave/Compound
     - Risk factors (high utilization, low liquidity, market conditions)
     - Optimal rate curve parameters
     - Best cross-protocol allocation split

4. **Claude Returns JSON Response:**
   ```json
   {
     "analysis": {
       "current_utilization": 65.5,
       "market_assessment": "Moderate demand, healthy liquidity depth",
       "competitive_position": "AION supply APY slightly below Aave V3",
       "risk_level": "medium",
       "risk_factors": ["Single asset concentration", "Testnet liquidity"]
     },
     "rate_recommendation": {
       "baseRate": 2.5,
       "rateSlope1": 4.0,
       "rateSlope2": 250,
       "optimalUtilization": 78,
       "reasoning": "Slightly higher base rate to attract suppliers while keeping competitive with Aave"
     },
     "allocation_recommendation": {
       "aion_pool_pct": 55,
       "aave_v3_pct": 30,
       "morpho_pct": 15,
       "reasoning": "Maintain majority in AION for liquidity, route 30% to Aave for higher base yield"
     },
     "predicted_apy": {
       "supply_apy": 4.2,
       "borrow_apy": 6.8,
       "confidence": 82
     }
   }
   ```

5. **Frontend Displays the Result**
   - Shows the AI recommendation in the live payment feed
   - Updates the x402 payment counter (simulating per-inference micropayments)
   - Displays the full AI response with analysis, rate recommendations, and allocation targets

#### For `/predict` (Market Analysis):
The flow is similar but Claude produces a **yield trend prediction**:
```json
{
  "predicted_supply_apy": 4.1,
  "predicted_borrow_apy": 6.9,
  "trend": "stable",
  "confidence": 78,
  "factors": ["Steady utilization at 65%", "External rates stable", "No large position changes"],
  "recommendation": "Maintain current rate parameters, monitor for utilization spike"
}
```

---

## Money Flow Diagram

```
USER DEPOSITS USDC
       │
       ▼
┌──────────────┐     Interest      ┌──────────────┐
│  LendingPool │◄──────────────────│   Borrowers   │
│              │                   │  (pay borrow  │
│  Earns       │                   │   APY)        │
│  Supply APY  │                   └──────────────┘
└──────┬───────┘
       │
       │  AI rebalances to maximize yield
       ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│  AION Pool   │  │   Aave V3    │  │   Morpho     │
│  (55%)       │  │   (30%)      │  │   (15%)      │
│  4.2% APY    │  │   5.1% APY   │  │   3.8% APY   │
└──────────────┘  └──────────────┘  └──────────────┘
       │                 │                 │
       └─────────────────┼─────────────────┘
                         │
                   Blended Yield
                   Back to User
```

---

## Contract Interactions Summary

| From | To | Function | Purpose |
|------|----|----------|---------|
| User | LendingPool | `deposit()` | Supply liquidity, earn APY |
| User | LendingPool | `borrow()` | Take loan against collateral |
| User | LendingPool | `withdraw()` | Remove supplied liquidity |
| User | LendingPool | `repay()` | Repay borrowed amount |
| User | CrossChainVault | `depositCrossChain()` | Lock tokens, send CCIP message |
| CRE | CREExecutionHook | `executePreHook()` | Gather on-chain data for AI |
| CRE | CREExecutionHook | `executePostHook()` | Apply AI recommendations |
| ChainlinkFunctions | ChainlinkFunctionsConsumer | `fulfillRequest()` | Return AI inference result |
| AIYieldEngine | LendingPool | `aiAdjustRateParams()` | Update interest rate curve |
| AIYieldEngine | AutonomousAllocator | `executeAllocation()` | Rebalance cross-protocol |
| PolicyEngine | CertifiedActionValidator | `validate()` | Check EIP-712 certificate |
| PolicyEngine | VolumeRatePolicy | `validate()` | Check rate/volume limits |
| GovernanceController | PolicyEngine | `addPolicy()` | Register new compliance policy |
| CCIP Router | CrossChainVault | `ccipReceive()` | Process cross-chain message |

---

## Deployed Contract Addresses

### Sepolia (Ethereum Testnet)

| Contract | Address |
|----------|---------|
| LendingPool | `0x87Ff17e9A8f23D02E87d6E87B5631A7eE08C0248` |
| AIYieldEngine | `0x4a8Ec2D9655600bc5d5D3460e8680251C839E61D` |
| AutonomousAllocator | `0x7C9eF492Cc14A795d8BAa6937b4cF23F258Ce6f1` |
| CrossChainVault | `0x8A9dD3A9c0Bc6Dd9931fcD75112e6f516B71a9A2` |
| CREExecutionHook | `0x17562500756BaB6757E13ce84C6D207A4D144948` |
| PolicyEngine | `0x2CfD29a609F822f734e70950a02Db066566d2faA` |
| CertifiedActionValidatorPolicy | `0x666e7bD0bFBE5B004855d67aE6271933b3Df6A54` |
| VolumeRatePolicy | `0x2bfD8ef46699094c19F30153f46e12273242Df99` |
| MockUSDC | `0x331cB2F787b2DC57855Bb30B51bE09aEF53e84C0` |

### Avalanche Fuji (Testnet)

| Contract | Address |
|----------|---------|
| LendingPool | `0x3547aD159ACAf2660bc5E26E682899D11826c068` |
| AIYieldEngine | `0x104895cc071Fb53ba9d4851c0fe1B896dCEB558A` |
| AutonomousAllocator | `0x5A6259254dA9d37081E2FAd716885ad8393a5408` |
| CrossChainVault | `0x666e7bD0bFBE5B004855d67aE6271933b3Df6A54` |
| PolicyEngine | `0x7f7787B37544675Ce556e40919Ba8B6Ca887a972` |
| CertifiedActionValidatorPolicy | `0x8DEA4bAd54d04adddC609e5BCe197757498e9b5b` |
| VolumeRatePolicy | `0x750c40739D69b5a5C59e311d7cc603bAc3137C46` |
| MockUSDC | `0xa35C19170526eB8764a995fb5298eD1156B1b379` |

---

## CRE Submission Compliance

**Requirement:** *"Your workflow should integrate at least one blockchain with an external API, system, data source, LLM, or AI agent and demonstrate a successful simulation (via the CRE CLI) or a live deployment on the CRE network."*

**How AION Yield meets this:**

1. **Blockchain + AI/LLM Integration**: CREExecutionHook connects on-chain contracts (LendingPool, AIYieldEngine) with an off-chain AI engine powered by Anthropic Claude. The CRE workflow gathers on-chain reserve data, sends it to Claude for analysis, and applies the AI recommendations back on-chain.

2. **Blockchain + External Data Source**: The AI engine fetches real-time APY data from DeFi Llama (external API) for Aave V3 and Compound, which feeds into the AI analysis for competitive rate optimization.

3. **Live Deployment**: All contracts are deployed and functional on both Sepolia and Avalanche Fuji testnets with verified cross-chain CCIP communication.

4. **Multi-Chain**: Cross-chain deposits work via Chainlink CCIP between Sepolia ↔ Avalanche Fuji.
