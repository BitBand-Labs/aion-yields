# 🏦 AION Yield – Smart Contracts

This directory contains the core Solidity protocol for the **AION Yield** money market. The contracts are designed to run on **Base** and integrate deeply with the **Chainlink** infrastructure stack.

---

## 🛠️ Core Modules

### 1. Money Market Core
- **`LendingPool.sol`**: Manages asset deposits, borrowing, and collateralization.
- **`InterestRateModel.sol`**: Dynamic interest rate calculations (AI-influenced curves).
- **`LiquidationEngine.sol`**: Handles under-collateralized positions triggered by Chainlink Automation.

### 2. AI Agent Registry (ERC-8004)
- **`AgentRegistry.sol`**: On-chain identity and reputation system for yield-optimizing AI agents.
- **`ReputationManager.sol`**: Tracks performance and handles staking/slashing of agents.

### 3. x402 Payment Rails
- **`PaymentEscrow.sol`**: Manages machine-to-machine payments for AI inferences.
- **`USDCAdapter.sol`**: Standardized payment interface for autonomous agents.

---

## 🔗 Chainlink Integration

- **Data Feeds**: Used in the Oracle layer for real-time asset valuation.
- **Functions**: Used to bridge off-chain AI inference results into the smart contracts.
- **Automation**: Triggers periodic health factor checks and rebalancing.
- **CCIP**: Facilitates cross-chain collateral moves and unified liquidity.

---

## 🚀 Development

### Installation
```bash
npm install
```

### Environment Setup
Create a `.env` file based on `.env.example`:
```bash
cp .env.example .env
```
Ensure you have your **BASE_RPC** and **PRIVATE_KEY** configured.

### Compilation & Testing
```bash
npx hardhat compile
npx hardhat test
```

### Deployment
To deploy to Base:
```bash
npx hardhat run scripts/deploy.ts --network base
```

---

## 🔒 Security
- **Access Control**: Utilizes OpenZeppelin's `Ownable` and `AccessControl`.
- **Safety**: Mocked testing for oracle manipulation and liquidation edge cases.
- **Audits**: *Experimental Code – Not Audited.*
