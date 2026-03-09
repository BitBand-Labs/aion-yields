# AION Yield — AI-Orchestrated DeFi Lending Protocol

**AION Yield** is a decentralized money market protocol where AI agents autonomously optimize interest rates, rebalance liquidity across protocols, and maximize risk-adjusted yields — all orchestrated by **Chainlink CRE** and secured by on-chain compliance policies.

> **The Problem:** DeFi lending is reactive. Capital sits idle in static pools while market conditions shift faster than any human can respond. Rate parameters are set manually, liquidity stays fragmented across chains, and there's no autonomous loop to continuously optimize yield.
>
> **AION's Solution:** We built an autonomous "Analyze → Validate → Execute" loop. Chainlink CRE reads on-chain state, routes it to an AI engine (Anthropic Claude), validates the AI's recommendations through on-chain compliance policies (ACE), and applies optimized rate parameters and cross-protocol allocations — all without manual intervention. The result: a self-optimizing lending protocol that continuously adapts to market conditions across multiple chains.

[![Hackathon](https://img.shields.io/badge/Hackathon-Chainlink--Convergence-blueviolet)](https://chain.link/)
[![Network](https://img.shields.io/badge/Networks-Sepolia%20%7C%20Fuji-blue)]()
[![Chainlink](https://img.shields.io/badge/Powered%20By-Chainlink%20CRE-375BD2)](https://chain.link/)
[![AI](https://img.shields.io/badge/AI-Anthropic%20Claude-orange)](https://anthropic.com/)

**Live Deployment:** Ethereum Sepolia + Avalanche Fuji testnets

---

## Architecture

```mermaid
graph TD
    User((User)) -->|deposit / borrow / withdraw| LP[LendingPool]
    User -->|cross-chain deposit| CCV[CrossChainVault]

    subgraph "Chainlink CRE Workflow"
        CRE[CREExecutionHook] -->|1. executePreHook| DataGather[Gather On-Chain Data]
        DataGather -->|reserve data + prices| CF[ChainlinkFunctions Consumer]
        CF -->|2. sendRequest to DON| DON[Chainlink DON]
        DON -->|3. AI inference via Claude| CF
        CF -->|4. fulfillRequest| CRE
        CRE -->|5. executePostHook| AIEngine[AIYieldEngine]
    end

    subgraph "AI Engine - Off-Chain"
        PY[FastAPI Server] -->|Web3 RPC| LP
        PY -->|Claude API| Claude[Anthropic Claude]
        PY -->|DeFi Llama| ExtData[External APY Data]
    end

    subgraph "On-Chain Compliance - ACE"
        AIEngine -->|policyCheck modifier| PE[PolicyEngine]
        PE --> CAV[CertifiedActionValidator]
        PE --> VRP[VolumeRatePolicy]
    end

    AIEngine -->|aiAdjustRateParams| LP
    AIEngine -->|executeAllocation| AA[AutonomousAllocator]

    subgraph "Chainlink CCIP"
        CCV -->|Lock & Message| CCIP[CCIP Router]
        CCIP -->|ccipReceive| CCV2[CrossChainVault - Dest]
        CCV2 -->|deposit for user| LP2[LendingPool - Dest]
    end

    LA[LiquidationAutomation] -->|checkUpkeep / performUpkeep| LP
    Oracle[ChainlinkPriceOracle] -->|getAssetPrice| LP
```

---

## Chainlink Integration

AION Yield uses **six Chainlink services** as the backbone of its autonomous operation. Every link below points to the exact contract and function where the integration lives.

### CRE — Compute Runtime Environment (Core Orchestrator)

The CRE workflow is the autonomous loop that ties everything together: gather on-chain data → run AI inference off-chain → apply results on-chain.

| Function | What It Does |
|----------|-------------|
| [`executePreHook()`](smartcontract/contracts/chainlink/CREExecutionHook.sol#L214) | Reads LendingPool reserves, prices, and allocator state; encodes it as `preHookData` for off-chain compute |
| [`executePostHook()`](smartcontract/contracts/chainlink/CREExecutionHook.sol#L279) | Decodes AI results, routes to AIYieldEngine for rate adjustment or allocation rebalance |

**5 Workflow Types:** AI Rate Adjustment, Liquidation Scan, Cross-Chain Rebalance, Risk Monitoring, Yield Allocation

### CCIP — Cross-Chain Interoperability Protocol

Enables cross-chain deposits between Sepolia and Avalanche Fuji using a **Lock & Message** pattern (custom tokens aren't in CCIP token pools, so we lock on source and deposit from reserves on destination).

| Function | What It Does |
|----------|-------------|
| [`depositCrossChain()`](smartcontract/contracts/chainlink/CrossChainVault.sol#L94) | Locks user tokens on source chain, sends CCIP message with `(user, token, amount)` |
| [`_ccipReceive()`](smartcontract/contracts/chainlink/CrossChainVault.sol#L158) | Receives CCIP message on destination, maps token, deposits from vault reserves into LendingPool for user |

### Chainlink Functions — Off-Chain AI Inference

Secure bridge between on-chain contracts and the Python AI engine running Anthropic Claude.

| Function | What It Does |
|----------|-------------|
| [`sendRequest()`](smartcontract/contracts/chainlink/ChainlinkFunctionsConsumer.sol#L146) | Submits JavaScript source + encoded market data to Chainlink DON for execution |
| [`fulfillRequest()`](smartcontract/contracts/chainlink/ChainlinkFunctionsConsumer.sol#L198) | Callback with AI inference result; parses into `InferenceResult` and forwards to AIYieldEngine |

### Chainlink Automation — Liquidation Watchdog

Decentralized upkeep that monitors positions and triggers liquidations when health factors drop below 1.0.

| Function | What It Does |
|----------|-------------|
| [`checkUpkeep()`](smartcontract/contracts/chainlink/LiquidationAutomation.sol#L82) | Scans monitored positions for undercollateralization |
| [`performUpkeep()`](smartcontract/contracts/chainlink/LiquidationAutomation.sol#L135) | Executes liquidation on unhealthy positions |

### Chainlink Data Feeds — Price Oracle

Multi-source price data with staleness checks and fallback logic.

| Function | What It Does |
|----------|-------------|
| [`getAssetPrice()`](smartcontract/contracts/chainlink/ChainlinkPriceOracle.sol#L110) | Fetches price from Chainlink AggregatorV3Interface with validity checks |

### ACE — Automated Compliance Engine (AI Guardrails)

On-chain policy framework that validates every AI action before execution. Prevents rogue agents from draining or manipulating the protocol.

| Function | What It Does |
|----------|-------------|
| [`PolicyEngine.validateAction()`](smartcontract/contracts/ace/PolicyEngine.sol#L168) | Central router — loops through all registered policies for a given target+selector |
| [`CertifiedActionValidatorPolicy.submitCertificate()`](smartcontract/contracts/ace/CertifiedActionValidatorPolicy.sol#L135) | Registers EIP-712 signed certificates authorizing specific AI actions |
| [`CertifiedActionValidatorPolicy.validate()`](smartcontract/contracts/ace/CertifiedActionValidatorPolicy.sol#L191) | Verifies the action has a valid, non-expired, non-replayed certificate from an authorized signer |
| [`VolumeRatePolicy.validate()`](smartcontract/contracts/ace/VolumeRatePolicy.sol#L148) | Enforces per-action (10% TVL max), cumulative (500k USDC/window), and frequency (5 actions/hour) limits |
| [`VolumeRatePolicy.postExecutionUpdate()`](smartcontract/contracts/ace/VolumeRatePolicy.sol#L208) | Updates rolling window state after successful execution |

**Policy types:** Certificate validation (stateless, signature check) + Volume/rate limits (stateful, sliding window)

---

## CRE Workflow — End-to-End Flow

This is how the autonomous optimization loop works:

```mermaid
sequenceDiagram
    participant CRE as Chainlink CRE
    participant Hook as CREExecutionHook
    participant Pool as LendingPool
    participant Oracle as PriceOracle
    participant DON as Chainlink Functions DON
    participant AI as Claude AI Engine
    participant ACE as PolicyEngine (ACE)
    participant Engine as AIYieldEngine

    CRE->>Hook: executePreHook(AI_RATE_ADJUSTMENT)
    Hook->>Pool: getReserveData() — supply, borrow, rates
    Hook->>Oracle: getAssetPrice() — current prices
    Hook-->>CRE: preHookData (encoded market state)

    CRE->>DON: sendRequest(source, args)
    DON->>AI: HTTP call with market data
    AI->>AI: Claude analyzes utilization, external rates, risk
    AI-->>DON: JSON response (rate params + allocations)
    DON-->>CRE: fulfillRequest(response)

    CRE->>Hook: executePostHook(executionId, result)
    Hook->>Engine: submitRateRecommendation(baseRate, slope1, slope2, optimal)
    Engine->>ACE: policyCheck — validate certificate + volume limits
    ACE->>ACE: CertifiedActionValidator.validate()
    ACE->>ACE: VolumeRatePolicy.validate()
    ACE-->>Engine: ✓ Approved
    Engine->>Pool: aiAdjustRateParams() — update interest curve
```

---

## On-Chain Compliance — ACE (Automated Compliance Engine)

Every AI action passes through ACE before execution. This prevents rogue AI agents from draining or manipulating the protocol.

| Contract | Key Function | Purpose |
|----------|-------------|---------|
| [`PolicyEngine`](smartcontract/contracts/ace/PolicyEngine.sol#L168) | `validateAction()` | Routes validation to registered policies |
| [`CertifiedActionValidatorPolicy`](smartcontract/contracts/ace/CertifiedActionValidatorPolicy.sol#L191) | `validate()` | Requires EIP-712 signed certificate from authorized signer |
| [`VolumeRatePolicy`](smartcontract/contracts/ace/VolumeRatePolicy.sol#L148) | `validate()` | Enforces per-action (10% TVL), cumulative (500k USDC/window), and frequency (5 actions/hour) limits |

---

## AI Engine (Off-Chain)

A Python FastAPI server that reads on-chain data and uses Anthropic Claude to produce rate and allocation recommendations.

```mermaid
flowchart LR
    subgraph "AI Engine — localhost:8000"
        CR[chain_reader.py] -->|Web3 RPC to Sepolia| Data[Reserve Data + Prices]
        CR -->|DeFi Llama API| ExtAPY[Aave/Compound APYs]
        Data --> AS[ai_strategy.py]
        ExtAPY --> AS
        AS -->|Anthropic Claude API| Rec[Rate + Allocation Recommendations]
    end

    FE[Frontend] -->|POST /analyze| AS
    FE -->|POST /predict| AS
```

**What Claude Analyzes:**
- Current utilization vs optimal target (75-85%)
- AION rates vs Aave V3 and Compound (competitive benchmarking)
- Risk factors: concentration, liquidity depth, market volatility
- Optimal interest curve parameters: `baseRate`, `slope1`, `slope2`, `optimalUtilization`
- Cross-protocol allocation split: AION pool vs Aave vs Morpho

**Key files:**
- [`ai_strategy.py`](ai-engine/ai_strategy.py) — Claude prompt engineering and response parsing
- [`chain_reader.py`](ai-engine/chain_reader.py) — Web3 on-chain data fetching
- [`main.py`](ai-engine/main.py) — FastAPI endpoints (`/analyze`, `/predict`, `/reserve`, `/price`)

---

## Cross-Chain Deposits (CCIP)

```mermaid
sequenceDiagram
    participant User
    participant SrcVault as CrossChainVault (Sepolia)
    participant CCIP as Chainlink CCIP Router
    participant DstVault as CrossChainVault (Fuji)
    participant DstPool as LendingPool (Fuji)

    User->>SrcVault: depositCrossChain(token, amount, fujiSelector)
    SrcVault->>SrcVault: Lock tokens + track lockedBalance
    SrcVault->>CCIP: ccipSend(message: user, token, amount)
    Note over CCIP: Message only — no tokens bridged
    CCIP->>DstVault: ccipReceive(message)
    DstVault->>DstVault: Map source token → local token
    DstVault->>DstPool: deposit(localToken, amount, user)
    Note over DstPool: User earns supply APY on Fuji
```

**Why Lock & Message?** Custom tokens (MockUSDC) aren't in CCIP's token pool whitelist. We lock on source, send a message, and the destination vault deposits from its own pre-funded reserves.

---

## Interest Rate Model

The protocol uses a **kink-based interest rate model** (similar to Aave/Compound) that the AI continuously optimizes:

```
Borrow Rate
     │
300% │                          ╱
     │                        ╱
     │                      ╱  ← Slope2 (penalty zone — AI tunes this)
 6%  │─────────────────────╱
     │               ╱
 2%  │─────────╱          ← Slope1 (normal zone — AI tunes this)
     │  ╱
     │╱________________________
     0%        80%       100%
            Utilization
          (AI-optimized kink)
```

- **Supply APY** = borrowRate × utilization × (1 - reserveFactor)
- **Health Factor** = Σ(collateral × liquidationThreshold) / Σ(debt) — liquidated if < 1.0

---

## Project Structure

```
├── smartcontract/           # Hardhat v3, Solidity contracts
│   ├── contracts/
│   │   ├── chainlink/       # CRE, CCIP, Functions, Automation, Price Feeds
│   │   ├── core/            # LendingPool, InterestRateModel, Governance
│   │   ├── ace/             # PolicyEngine, CertifiedAction, VolumeRate
│   │   ├── ai/              # AIYieldEngine, AutonomousAllocator, AgentRegistry
│   │   └── payments/        # X402 Payment Gateway
│   ├── test/                # Hardhat tests (LendingPool, CrossChain, Liquidation)
│   └── scripts/             # Deploy and configuration scripts
├── frontend/                # Next.js 15, Framer Motion, Wagmi, Reown AppKit
├── ai-engine/               # FastAPI, Python, Anthropic Claude
│   ├── main.py              # API server
│   ├── ai_strategy.py       # Claude-powered analysis
│   └── chain_reader.py      # On-chain data reader
└── doc/                     # Technical documentation
```

---

## Deployed Addresses

### Sepolia (Ethereum Testnet)

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

### Avalanche Fuji (Testnet)

| Contract | Address |
|----------|---------|
| LendingPool | `0x3547aD159ACAf2660bc5E26E682899D11826c068` |
| AIYieldEngine | `0x104895cc071Fb53ba9d4851c0fe1B896dCEB558A` |
| CrossChainVault | `0x666e7bD0bFBE5B004855d67aE6271933b3Df6A54` |
| MockUSDC | `0xa35C19170526eB8764a995fb5298eD1156B1b379` |

---

## Getting Started

```bash
# Clone
git clone https://github.com/ChainNomads/AION-Yield.git && cd AION-Yield

# Smart Contracts
cd smartcontract && npm install
cp .env.example .env  # Add RPC URLs + private key
npx hardhat compile

# AI Engine
cd ai-engine && pip install -r requirements.txt
export ANTHROPIC_API_KEY=your_key
uvicorn main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend && npm install && npm run dev
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity, Hardhat v3 |
| Chainlink | CRE, CCIP, Functions, Automation, Data Feeds |
| AI | Anthropic Claude (claude-sonnet-4-20250514) |
| Frontend | Next.js 15, Framer Motion, Wagmi v2, Reown AppKit |
| Backend | FastAPI, Python, Web3.py |
| Networks | Ethereum Sepolia, Avalanche Fuji |

---

## Team: ChainNomads
