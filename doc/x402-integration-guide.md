# x402 Integration Guide: Machine-to-Machine Payments

The **x402 Payment Gateway** is the on-chain settlement layer for machine-to-machine financial transactions within the **AION Yield** ecosystem. It implements a crypto-native version of the HTTP 402 (Payment Required) standard.

## 🚀 How it Works

The x402 flow enables AI agents to charge for their services (inferences, predictions) without requiring manual user intervention for every transaction.

### The Lifecycle of an x402 Payment:
1. **Request**: The protocol (via Chainlink CRE) requests an inference from an AI Provider.
2. **Payment Required**: The Provider's middleware detects the request and checks for payment availability.
3. **Settlement**: The middleware calls `X402PaymentGateway.processPayment()`.
4. **Transfer**: The Gateway deducts the fee from the requester's on-chain escrow and transfers it to the provider.
5. **Fulfillment**: Once payment is confirmed on-chain, the AI Provider returns the inference result.

---

## 🛠️ Integration for Requesters

### 1. Depositing Escrow
Before requesting inferences, you must fund your escrow balance.
```solidity
// Deposit 100 USDC into escrow
gateway.deposit(100 * 10**6);
```

### 2. Checking Balance
```solidity
uint256 balance = gateway.getEscrowBalance(myAddress);
```

---

## 🛠️ Integration for AI Providers

### 1. Registration
Providers must be registered by the protocol owner and set their price.
```solidity
// Set price to 0.50 USDC per inference
gateway.registerProvider(providerAddress, 500000); // 0.5e6 units
```

### 2. Settling Payments (Middleware)
Providers usually run a middleware that monitors for `ChainlinkFunctionsConsumer` requests and triggers the settlement.
```javascript
// Web3.js sample
await gateway.methods.processPayment(requestId, payerAddress, providerAddress).send({from: provider});
```

---

## 🔐 Security Features
- **Escrow Isolation**: Funds are held in a secure vault, only accessible for authorized provider payments or owner-approved refunds.
- **Protocol Fees**: A configurable fee (default 1%) is automatically routed to the protocol treasury on every successful transaction.
- **Batch Processing**: For high-volume agents, `batchProcessPayments()` allows settling multiple inferences in a single transaction to optimize gas costs.
