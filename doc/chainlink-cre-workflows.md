# Chainlink CRE Workflow Documentation

Chainlink **CRE (Chainlink Runtime Environment)** is the orchestration layer of **AION Yield**. it enables the protocol to execute complex, multi-step workflows that span across multiple blockchains, off-chain AI models, and external APIs.

## 🌀 Concept: The Unified Execution Layer
In AION Yield, CRE serves as the "brain," coordinating between:
1. **Ethereum/Base/Avalanche**: Smart contract state.
2. **AI Engine**: Strategy and risk analysis.
3. **Chainlink CCIP**: Cross-chain liquidity movement.
4. **x402 Payments**: Autonomous machine-to-machine settlements.

---

## 🏗️ Core Workflows

### 1. AI-Driven Yield Reallocation
This workflow is triggered when a significant yield opportunity is detected or on a periodic schedule (via Chainlink Automation).

**Sequence:**
1. **Trigger**: `LendingPool` or a specialized `Rebalancer` contract emits a `RebalanceTargeted` event.
2. **Analysis**: Chainlink Functions calls the **AI Engine** (`/analyze` endpoint).
3. **Payment**: CRE verifies the `HTTP 402` status and triggers an on-chain payment via the **x402 Payment Gateway**.
4. **Result**: AI Engine returns the optimal allocation percentages.
5. **Execution**: CRE calls `LendingPool.reallocate(targets, amounts)`.

### 2. Autonomous Liquidation Prevention
A proactive workflow aimed at protecting user positions before they hit the liquidation threshold.

**Sequence:**
1. **Monitoring**: Data Streams provide high-frequency price data.
2. **Risk Check**: CRE calls the AI Engine (`/predict` endpoint) to forecast if a user's health factor will drop below 1 in the next N blocks.
3. **Action**: If risk is high, CRE can automatically trigger a partial repayment using idle liquidity or move collateral from a safer chain via **CCIP**.

### 3. Cross-Chain Liquidity Routing
Moves capital between chains to capture higher APY while maintaining protocol solvency.

**Sequence:**
1. **Signal**: AI Engine identifies a 2% APY spread between Base and Avalanche.
2. **Initiation**: CRE calls the `CCIPAdapter.initiateTransfer(amount, targetChain)`.
3. **Crossing**: CCIP securely moves the assets.
4. **Finalization**: CRE executes the deposit on the destination chain's `LendingPool`.

---

## 🛠️ Security & Policies (ACE)
All CRE workflows are subject to the **Action Control Engine (ACE)**. 

- **Policy Check**: Before any CRE-initiated action is finalized, the `PolicyEngine` validates it against `VolumeRatePolicy` (to prevent bridge draining) and `CertifiedActionValidatorPolicy`.

---

## 📊 Monitoring workflows
Users and developers can monitor these workflows in real-time via the **Analytics Dashboard** on the AION Yield frontend, which indexes CRE execution events and displays them in the "System Performance" and "Live Strategy Feed" sections.
