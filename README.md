# 🚀 AION Yield – AI-Orchestrated Money Market Protocol

[![Hackathon](https://img.shields.io/badge/Hackathon-Chainlink--Convergence-blueviolet)](https://chain.link/)
[![Network](https://img.shields.io/badge/Network-Base-blue)](https://base.org/)
[![Identity](https://img.shields.io/badge/Standard-ERC--8004-green)](https://github.com/ethereum/ERCs)
[![Payments](https://img.shields.io/badge/Protocol-x402-orange)](https://x402.org/)

**AION Yield** is a next-generation decentralized money market protocol that merges **Chainlink CRE orchestration**, **AI-driven yield optimization**, and **autonomous agent payments**. It represents the first step toward a machine-to-machine DeFi economy.

---

## 📌 Overview

AION Yield moves beyond passive lending. It utilizes autonomous AI agents to manage capital, forecast liquidation risks, and optimize cross-chain yield. Built for the **Chainlink Convergence Hackathon**, the protocol showcases the power of the **Chainlink Runtime Environment (CRE)** to orchestrate complex workflows between smart contracts, AI models, and off-chain data.

### The "AION" Innovation:

- **Autonomous Orchestration:** Chainlink CRE acts as the "Operating System" for the protocol.
- **AI-Native Rails:** Uses **x402** (HTTP 402) for machine-to-machine inference payments.
- **On-Chain Identity:** Implements **ERC-8004** for AI agent reputation and validation.

---

## 🏗️ Technical Architecture

```mermaid
flowchart TD
    User((User)) -->|Deposit/Borrow| MM[Money Market Contracts]
    MM -->|Trigger| CRE[Chainlink CRE]
    CRE -->|Orchestrate| AI[AI Agent Pool]
    AI -->|Request Inference| x402[x402 Payment Rail]
    x402 -->|Payment| AI
    AI -->|Yield Signal| CRE
    CRE -->|Execute| CCIP[Chainlink CCIP]
    CCIP -->|Move Liquidity| CrossChain[Multi-Chain Yield]
    CRE -->|Log Identity| ERC8004[ERC-8004 Registry]
```

---

## 🧩 Chainlink Service Integration

| Service                  | Purpose in AION Yield                                                          |
| :----------------------- | :----------------------------------------------------------------------------- |
| **Chainlink CRE**        | The core workflow engine orchestrating AI, CCIP, and Automation.               |
| **Chainlink CCIP**       | Secure cross-chain liquidity and collateral management across Base & Ethereum. |
| **Chainlink Functions**  | Fetching off-chain AI inference and risk scores.                               |
| **Chainlink Automation** | Decentralized triggers for liquidations and vault rebalancing.                 |
| **Chainlink Data Feeds** | Real-time pricing for interest rate models and health factor calculation.      |
| **Data Streams**         | High-frequency data for low-latency liquidation detection.                     |

---

## 💸 Machine-to-Machine Economy (x402 & ERC-8004)

### x402: Autonomous Payments

AION Yield revives the **HTTP 402 Payment Required** status code. When the protocol needs a yield prediction, the AI agent returns a 402 error; the protocol automatically settles the payment in USDC, receives the inference, and executes the strategy.

### ERC-8004: Agent Identity & Reputation

To ensure the protocol only uses high-performing AI, we utilize an ERC-8004 inspired registry:

- **Identity:** Verifiable on-chain identity for AI agents.
- **Reputation:** Historical performance scores based on previous yield predictions.
- **Staking:** Agents must stake tokens to provide signals, which are slashed for malicious/poor data.

---

## 📂 Project Structure

This is a monorepo containing the full protocol stack:

- **`smartcontract/`**: Hardhat-based Solidity environment for the Money Market core and AI registries.
- **`frontend/`**: Next.js dashboard for users to track positions and AI-driven yield.
- **`subgraph/`**: The Graph protocol indexing for historical protocol metrics.
- **`AION-Yield-ai_driven_..._readme.md`**: Detailed architectural deep-dive.
- **`aion_yield_issues_and_task_tracker.md`**: Active development roadmap and task list.

---

## 🚀 Getting Started

### Prerequisites

- Node.js v18+
- Hardhat / Foundry
- Base RPC & Testnet ETH

### Installation

1. Clone the repo:
   ```bash
   git clone https://github.com/ChainNomads/AION-Yield.git
   cd AION-Yield
   ```
2. Install dependencies (Frontend, Smart Contract, Subgraph):

   ```bash
   npm install
   cd frontend && npm install
   cd ../smartcontract && npm install
   ```

3. Setup environment variables:
   Copy `.env.example` to `.env` in both `frontend/` and `smartcontract/` directories and fill in your keys.

---

## 🗺️ Roadmap

- [x] **Phase 0:** Project architecture & repository scaffolding.
- [ ] **Phase 1:** Core Lending & Borrowing on Base.
- [ ] **Phase 2:** Chainlink CRE integration for AI orchestration.
- [ ] **Phase 3:** x402 Payment middleware implementation.
- [ ] **Phase 4:** ERC-8004 Reputation dashboard.

---

## 🤝 Team

**ChainNomads** – Building the future of autonomous finance.

---
