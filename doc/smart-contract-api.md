# Smart Contract API Documentation

This document provides a technical overview and API reference for the core smart contracts powering the **AION Yield** protocol.

## 🏦 Core Protocol Contracts

### 1. LendingPool (`LendingPool.sol`)
The central entry point for users to interact with the protocol's liquidity.

**Key Functions:**
- `deposit(address asset, uint256 amount)`: Allows users to supply assets to the pool.
- `withdraw(address asset, uint256 amount)`: Allows users to withdraw their supplied assets.
- `borrow(address asset, uint256 amount)`: Allows users to borrow assets against their collateral.
- `repay(address asset, uint256 amount)`: Allows users to repay their borrowed positions.
- `liquidate(address collateral, address debt, address user, uint256 debtToCover)`: Triggered by liquidators when a user's Health Factor falls below 1.

### 2. CollateralManager (`CollateralManager.sol`)
Manages user balances and calculates borrowing power.

**Key Functions:**
- `getUserAccountData(address user)`: Returns total collateral, total debt, available borrowing power, and current Health Factor.
- `calculateHealthFactor(address user)`: Internal and external calculation of position risk.

### 3. InterestRateModel (`InterestRateModel.sol`)
Calculates dynamic interest rates based on pool utilization.

**Key Logic:**
- `getBorrowRate(address asset, uint256 liquidity, uint256 totalsubplied)`: Returns the current annual interest rate for borrowers.

---

## 🛡️ ACE - Action Control Engine (`PolicyEngine.sol`)
A sophisticated policy enforcement layer that governs protocol actions based on predefined security rules.

**Key Components:**
- **PolicyEngine**: The central hub for policy evaluation.
- **VolumeRatePolicy**: Limits the volume of actions (e.g., large withdrawals) within a certain timeframe to prevent flash-loan exploits or mass exits.
- **CertifiedActionValidatorPolicy**: Validates actions against a set of "certified" criteria, often used in conjunction with Chainlink CRE.

**Functionality:**
- `validateAction(bytes32 actionId, address actor, bytes data)`: Returns true if the action complies with all active policies.

---

## 🤖 AI Registry & Reputation

### AgentRegistry (`AgentRegistry.sol`)
Implements the **ERC-8004** standard for AI Agent identity.

**Key Functions:**
- `registerAgent(string metadataURI)`: Allows an AI entity to establish its on-chain identity.
- `updateAgentReputation(address agent, int256 scoreChange)`: Controlled by the protocol's reputation system (often fed by Chainlink Functions).

---

## 💸 x402 Payment Gateway (`X402PaymentGateway.sol`)
Handles machine-to-machine payments for AI inferences.

**Key Functions:**
- `depositEscrow()`: Allows the protocol or users to fund an escrow for AI payments.
- `processPayment(address agent, uint256 amount)`: Automatically transfers funds from escrow to an agent's revenue distributor upon successful inference.

---

## 🔗 Chainlink Integration Layers

### ChainlinkPriceOracle (`ChainlinkPriceOracle.sol`)
Aggregates data from multiple Chainlink Data Feeds to provide reliable asset pricing.

### FunctionsConsumer (`FunctionsConsumer.sol`)
Handles the request/response cycle for off-chain computation (e.g., fetching AI risk scores).
