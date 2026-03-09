# Deployment Guide: Avalanche Fuji (Stage 2 MVP) & Sepolia

This guide provides instructions for deploying the **AION Yield** smart contract suite to testnet environments.

## 📋 Prerequisites
- **Node.js**: v18+
- **Hardhat**: Core development environment.
- **Wallets**: A deployer wallet funded with Sepolia ETH and Avalanche AVAX.
- **Chainlink**: LINK tokens for Functions and CCIP subscriptions.

---

## ⚙️ Environment Configuration (`.env`)
Create a `.env` file in the `smartcontract/` directory:
```env
PRIVATE_KEY=your_deployer_private_key
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/...
AVALANCHE_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
ETHERSCAN_API_KEY=...
SNOWTRACE_API_KEY=...
```

---

## 🛠️ Deployment Steps

### 1. Module Deployment
Deploy the core protocol and integration contracts:
```bash
npx hardhat run scripts/deploy_full.ts --network sepolia
npx hardhat run scripts/deploy_full.ts --network avalanche
```

### 2. Contract Wiring
Link the addresses of deployed contracts (e.g., pointing the LendingPool to the PriceOracle).
```bash
npx hardhat run scripts/wire_contracts.ts --network sepolia
```

### 3. Cross-Chain Setup (Warp Messaging & CCIP)
Enable communication between Sepolia and Avalanche. For Stage 2, emphasis is on demonstrating cross-chain awareness via Avalanche C-Chain messaging.
```bash
npx hardhat run scripts/setup_crosschain.ts --network avalanche
npx hardhat run scripts/setup_crosschain.ts --network sepolia
```

---

## ✅ Verification
Verify contracts on Etherscan/Snowtrace for transparency:
```bash
npx hardhat verify --network sepolia DEPLOYED_ADDRESS "Arg1" "Arg2"
```

---

## 📦 Post-Deployment Checklist
- [ ] Whitelist AI Agents in `AIAgentRegistry`.
- [ ] Fund the `X402PaymentGateway` escrow.
- [ ] Activate Chainlink Automation for liquidations.
- [ ] Update the frontend `useContracts` hook with the new addresses.
