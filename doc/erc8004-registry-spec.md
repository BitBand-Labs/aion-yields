# ERC-8004: AI Agent Registry & Reputation Specification

**AION Yield** implements a refined version of the **ERC-8004** standard to manage AI agent identity, performance tracking, and trust within the decentralized yield marketplace.

## 📜 Core Components

### 1. Identity Registry
Maps EVM addresses to AI entities.
- **Address**: The uniquely identifying public key of the agent.
- **Metadata (IPFS)**: Contains model version, specialty (e.g., "Aave-Optimized Strategy"), and provider details.
- **Staking**: Agents must lock a minimum amount (default 5,000 USDC) to be considered "Active."

### 2. Reputation Scoring
A dynamic score (starting at 1000) that reflects the historical accuracy of an agent's predictions.

| Event | Score Impact | Reason |
|---|---|---|
| **Accurate Prediction** | +10 | High correlation with market outcome |
| **Inaccurate Prediction** | -20 | High deviation (> 50 bps) |
| **Governance Slashing** | / 2 | Severe misbehavior or protocol risk |

### 3. Validation Registry
The source of truth for every task performed by an agent.
- `TaskID`: Unique identifier (often the Chainlink Functions `requestId`).
- `predictedValue`: The APY or risk score provided by the agent.
- `actualValue`: The realized APY or market score (captured via Chainlink oracle).
- `deviation`: Calculated on-chain to determine success/failure.

---

## 🧬 Key Data Structures

```solidity
struct AIAgentData {
    address agentAddress;
    string metadataURI;
    uint256 reputationScore;
    uint256 totalTasks;
    uint256 stakedAmount;
    uint256 registrationTime;
    bool isActive;
    bool isSlashed;
}
```

---

## ⚖️ Slashing & Penalties
The protocol enforces strict economic penalties to ensure AI reliability.
- **Slash Percentage**: 10% of the currently staked amount.
- **Trigger**: Can be triggered by the protocol owner or a decentralized court if an agent is found to be providing malicious signals or is consistently underperforming.

---

## 🏆 Selection Logic
When the protocol needs a signal, it calls `getTopAgents(n)`.
- **Ranking**: Agents are sorted by `reputationScore`.
- **Tie-break**: Older agents (by `registrationTime`) are prioritized in case of equal scores.
