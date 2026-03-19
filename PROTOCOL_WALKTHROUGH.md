# Protocol Walkthrough

## 1. Actors

### Depositor (User)
Deposits assets (USDC, ETH, etc.) into ERC4626 vaults. Receives vault shares representing their proportional claim on vault assets. Withdraws by burning shares. Wants maximized risk-adjusted yield without managing strategies manually.

### AI Agent (Off-chain)
Analyzes DeFi markets via DefiLlama and protocol APIs. Produces yield predictions and allocation recommendations. Registered on-chain via AIAgentRegistry with staked collateral. Earns revenue through X402PaymentGateway for successful predictions.

### Autonomous Allocator
On-chain executor that receives AI recommendations and calls vault functions to move capital between strategies. Enforces cooldown periods and confidence thresholds before executing.

### Vault Owner (Protocol Admin)
Adds/removes strategies, sets deposit limits, configures fees, and manages the allocator role. Cannot bypass timelock for non-emergency changes.

### Guardian
Emergency role within GovernanceController. Can pause the protocol and execute emergency actions without timelock delay. Cannot unpause (only owner can).

### Chainlink CRE (Compute Runtime Environment)
Off-chain orchestration layer. Triggers pre-hooks to gather on-chain state, sends data to AI models, and delivers results back via post-hooks. Acts as the bridge between off-chain AI and on-chain execution.

### Strategy Contracts
Deploy vault capital into external DeFi protocols (Aave, Curve, Pendle, etc.). Report profits and losses back to the vault. Each strategy is a separate contract implementing the IStrategy interface.

---

## 2. Primary User Flows (Money-First)

### Flow 1: Deposit

**Where money starts:** User's wallet (USDC)

**Path:**
1. User calls `AionVault.deposit(amount, receiver)`
2. Vault transfers USDC from user to itself
3. Vault mints shares to receiver based on current share price
4. Vault increments `totalIdle` by deposited amount

**Where money ends:** Vault contract (idle balance)

**Who controls funds at each step:**
- Step 1-2: User authorizes transfer (ERC20 approval required)
- Step 3-4: Vault contract holds funds. No individual can withdraw without burning shares.

---

### Flow 2: AI-Driven Capital Allocation

**Where money starts:** Vault idle balance (`totalIdle`)

**Path:**
1. CREExecutionHook.executePreHook() gathers vault state (TVL, strategy debts, idle balance)
2. Data sent to Chainlink Functions → AI model analyzes off-chain
3. AI performs strategy simulation: evaluates APY, liquidity depth, expected slippage, gas costs, and protocol risk score. If expected slippage or risk exceeds limits, the recommendation is rejected before reaching on-chain.
4. AI returns allocation recommendation (strategies + target debts + confidence)
5. CREExecutionHook.executePostHook() delivers result to AIYieldEngine.submitAllocationRecommendation()
6. PolicyEngine validates the action:
   - CertifiedActionValidatorPolicy checks EIP-712 signature
   - VolumeRatePolicy checks rate limits and volume caps
7. If confidence >= threshold: AIYieldEngine calls AutonomousAllocator.executeStrategyAllocation()
8. AutonomousAllocator validates each strategy:
   - Queries StrategyRegistry: `strategyRegistry.isApproved(strategy)` — rejects if strategy is not governance-approved
   - Queries RiskManager: `riskManager.isApproved(strategy)` — rejects if strategy fails risk assessment
   - Checks rebalance cooldown and minimum confidence threshold
9. For each approved strategy, allocator calls AionVault.updateDebt(strategy, targetDebt)
10. Vault enforces allocation cap: `targetDebt <= 40% of totalAssets` (maxStrategyAllocationBps)
11. Vault transfers USDC to strategy contract, calls strategy.deposit()
12. Strategy's _deployFunds() sends USDC to external protocol (e.g., aavePool.supply()). If the strategy involves token swaps, SlippageController.enforceSlippage() is called to prevent excessive slippage.

**Where money ends:** External DeFi protocol (e.g., Aave lending pool)

**Who controls funds at each step:**
- Steps 1-7: No fund movement. Data, simulation, and authorization only.
- Step 8: Allocator validates against StrategyRegistry and RiskManager. Cannot access funds directly.
- Step 9-10: Vault controls the transfer. Enforces allocation caps and minimum idle reserve.
- Step 11-12: Strategy deploys to external protocol. Strategy contract holds the claim (e.g., aTokens).

---

### Flow 3: Yield Accrual and Harvest

**Where money starts:** External DeFi protocol (accrued interest/fees)

**Path:**
1. External protocol accrues yield (e.g., Aave aToken balance grows)
2. Allocator or AI triggers AionVault.processReport(strategy)
3. Vault calls strategy.totalAssets() to get current value
4. Vault compares totalAssets vs recorded currentDebt
5. **Strategy health check:** Vault verifies the reported gain or loss is within safe bounds:
   - If gain > `maxProfitPerHarvestBps` of currentDebt → reverts (prevents inflated/manipulated reports)
   - If loss > `maxLossPerHarvestBps` of currentDebt → reverts (requires governance review)
6. If gain: Vault calculates performance fee (15% of profit) and management fee (2% annual on debt, time-weighted)
7. Vault mints fee shares to feeRecipient
8. Vault updates totalDebt and strategy's currentDebt to reflect new reality

**Where money ends:** Yield stays in strategy (reinvested). Fee shares created for feeRecipient.

**Who controls funds at each step:**
- Steps 1-5: No fund movement. Accounting and health validation only.
- Step 7: Fee shares minted to feeRecipient (ProtocolFeeController). No asset transfer occurs — the fee is dilutive to other shareholders.
- Step 8: Accounting update only.

---

### Flow 4: User Withdrawal

**Where money starts:** Vault idle balance and/or strategy contracts

**Path:**
1. User calls AionVault.withdraw(assets, receiver, owner)
2. **Withdrawals are always allowed, even when the vault is paused.** This ensures users can always exit, even during emergencies. Only deposits and allocations are blocked when paused.
3. Vault calculates shares to burn via convertToShares(assets)
4. If `assets <= totalIdle`: Vault transfers from idle balance directly
5. If `assets > totalIdle`:
   - Vault calls `_withdrawFromStrategies(deficit)`
   - **WithdrawalQueue determines the unwind order.** If a WithdrawalQueue is configured, the vault queries it for a deterministic strategy ordering (e.g., most liquid first, lowest-performing first). Otherwise, falls back to iterating activeStrategies.
   - For each strategy in the queue: calls strategy.withdraw(amount) until deficit is covered
   - Strategy pulls funds from external protocol (e.g., Aave withdraw)
   - Funds return to vault, increasing totalIdle
6. Vault burns user's shares
7. Vault transfers assets to receiver

**Where money ends:** User's wallet

**Who controls funds at each step:**
- Step 1-3: User initiates. Must own shares or have allowance.
- Step 4-5: Vault controls movement. WithdrawalQueue determines strategy ordering. User cannot choose which strategies to pull from.
- Step 6-7: Vault transfers to user. Transaction is atomic.

---

### Flow 5: Cross-Chain Deposit

**Where money starts:** User's wallet on source chain (e.g., Ethereum)

**Path:**
1. User calls CrossChainVault.depositCrossChain(destinationChainID, receiver, token, amount)
2. CrossChainVault locks tokens: `lockedBalance[token] += amount`
3. Teleporter sends MSG_DEPOSIT message to destination chain
4. Destination CrossChainVault receives message
5. Destination maps token to local equivalent
6. Destination calls local AionVault.deposit() on behalf of user
7. Vault shares minted to receiver on destination chain

**Where money ends:** Locked in source CrossChainVault, share exposure on destination chain

**Who controls funds at each step:**
- Step 2: Source CrossChainVault locks tokens. User cannot retrieve without cross-chain withdrawal.
- Step 3-4: Avalanche Teleporter handles message delivery. Trustless bridge.
- Step 6-7: Destination vault controls deposit. Receiver gets shares.

---

### Flow 6: AI Agent Revenue Cycle

**Where money starts:** Protocol escrow in X402PaymentGateway

**Path:**
1. Protocol deposits USDC to X402PaymentGateway.deposit()
2. AI agent provides prediction via Chainlink Functions
3. X402PaymentGateway.processInferencePayment() settles:
   - Deducts from payer's escrow
   - Transfers (price - 1% fee) to AI agent
   - Transfers 1% fee to protocol feeRecipient
4. AIRevenueDistributor.recordAgentRevenue(agent, amount) tracks contribution
5. At epoch end (7 days): AIRevenueDistributor.finalizeEpoch() distributes:
   - 70% to agents (pro-rata by contribution)
   - 15% bonus to top agents (weighted by reputation)
   - 10% to community pool
   - 5% to protocol reserve
6. Agent calls AIRevenueDistributor.claimRevenue()

**Where money ends:** Agent's wallet, community pool, protocol reserve

**Who controls funds at each step:**
- Step 1: Payer deposits voluntarily
- Step 3: Gateway processes payment atomically. No manual approval needed.
- Step 5: Owner finalizes distribution. Funds move to claimable balances.
- Step 6: Agent claims voluntarily.

---

## 3. Contract Orchestration

### Deposit Flow
| Contract | Role | Why it exists in this flow |
|----------|------|---------------------------|
| AionVault | Receives USDC, mints shares, tracks idle balance | Central custody point for all user funds |

### Allocation Flow
| Contract | Role | Why it exists in this flow |
|----------|------|---------------------------|
| CREExecutionHook | Gathers vault state, delivers AI results | Bridges off-chain Chainlink CRE and on-chain contracts |
| ChainlinkFunctionsConsumer | Sends requests to Chainlink DON, receives AI inference results | Executes off-chain AI models securely |
| AIYieldEngine | Stores predictions, validates confidence, triggers execution | Decision layer between AI output and fund movement |
| PolicyEngine | Validates all AI actions against compliance policies | Prevents unauthorized or excessive capital movement |
| CertifiedActionValidatorPolicy | Requires EIP-712 signatures for AI actions | Cryptographic proof that action was pre-approved |
| VolumeRatePolicy | Enforces rate limits and volume caps | Prevents single action from moving too much capital |
| AutonomousAllocator | Validates against StrategyRegistry + RiskManager, then calls vault.updateDebt() | Separation of concerns: AI decides, allocator validates and executes |
| StrategyRegistry | Confirms each strategy is governance-approved before capital flows | Prevents malicious or unvetted strategies from receiving funds |
| RiskManager | Confirms each strategy passes risk assessment before capital flows | Rejects strategies with excessive risk scores or missing audits |
| SlippageController | Enforces max slippage during strategy swap operations | Prevents MEV bots or illiquid markets from draining vault value |
| AionVault | Transfers funds to strategies, enforces allocation caps, updates debt accounting | Sole authority over fund movement |
| StrategyAave (or other) | Deploys received funds to external protocol | Encapsulates protocol-specific logic |

### Harvest Flow
| Contract | Role | Why it exists in this flow |
|----------|------|---------------------------|
| AutonomousAllocator | Triggers vault.processReport() | Initiates harvest cycle |
| AionVault | Health-checks reported gain/loss, computes fees, mints fee shares, updates debt | Accounting authority with safety bounds |
| StrategyAave | Reports totalAssets() for comparison | Source of truth for deployed capital value |

### Withdrawal Flow
| Contract | Role | Why it exists in this flow |
|----------|------|---------------------------|
| AionVault | Burns shares, transfers assets, pulls from strategies if needed | Central custody and accounting |
| WithdrawalQueue | Defines which strategies to pull from first | Optimizes withdrawal cost (most liquid first) |
| StrategyAave | Withdraws from Aave when vault needs liquidity | Frees capital from external protocol |

### Governance Flow
| Contract | Role | Why it exists in this flow |
|----------|------|---------------------------|
| GovernanceController | Queues proposals with timelock, executes after delay | Prevents instant parameter changes |
| PolicyEngine | Managed by governance for adding/removing policies | Dynamic compliance management |
| RiskManager | Assesses strategy risk, approves/flags strategies | Guards against deploying to risky protocols |
| StrategyRegistry | Tracks approved strategies and categories | Central directory of available strategies |

---

## 4. State Progression

### Before User Deposits
- `totalIdle = 0`, `totalDebt = 0`, `totalSupply = 0` (no shares)
- Strategies registered but no capital deployed
- AI agents registered and staked

### After User Deposits
- `totalIdle += depositAmount`
- `totalSupply += mintedShares`
- Share price: `totalAssets() / totalSupply` (initially ~1:1)

### After Allocation Executes
- `totalIdle -= deployedAmount`
- `totalDebt += deployedAmount`
- `strategy.currentDebt += deployedAmount`
- External protocol holds the capital (e.g., aToken minted)

### After Harvest Reports
- If gain: `totalDebt += gain - fees`, `strategy.currentDebt += gain - fees`, fee shares minted
- If loss: `totalDebt -= loss`, `strategy.currentDebt -= loss`
- Share price changes (up for gains, down for losses)
- `strategy.lastReport = block.timestamp`

### After User Withdraws
- `totalIdle -= withdrawnAmount` (or totalDebt decreases if pulling from strategies)
- `totalSupply -= burnedShares`
- User holds underlying assets

---

## 5. External Integrations

### Aave V3 (Lending)
- **Why:** Primary yield source for stable lending strategies
- **When invoked:** StrategyAave.deposit() calls aavePool.supply(); StrategyAave.withdraw() calls aavePool.withdraw()
- **Assumptions:** Aave V3 Pool is non-malicious, aToken balance accurately reflects accrued interest, withdrawals are always possible (sufficient liquidity)

### Chainlink Functions / CRE
- **Why:** Executes off-chain AI models and delivers results on-chain
- **When invoked:** CREExecutionHook pre/post hooks, ChainlinkFunctionsConsumer request/fulfill cycle
- **Assumptions:** DON delivers results faithfully, DON is not compromised, response format matches expected ABI encoding

### Chainlink Data Feeds (Price Oracle)
- **Why:** Provides asset prices for risk assessment and portfolio valuation
- **When invoked:** ChainlinkPriceOracle.getAssetPrice() called during risk checks
- **Assumptions:** Price feeds are timely (staleness check enforced), fallback feed exists for critical assets

### Avalanche Teleporter (ICM)
- **Why:** Cross-chain message passing for multi-chain vault deposits/withdrawals
- **When invoked:** CrossChainVault sends/receives messages for deposits, withdrawals, yield sync
- **Assumptions:** Teleporter delivers messages correctly, destination chain processes messages atomically, token mappings are accurate

### OpenZeppelin Upgradeable Contracts
- **Why:** ERC4626, ERC20, Ownable, ReentrancyGuard patterns
- **When invoked:** Vault initialization, all deposit/withdraw/transfer operations
- **Assumptions:** Standard library is correct and audited

### EIP-712 (Typed Structured Data)
- **Why:** Cryptographic signing for AI action certificates
- **When invoked:** CertifiedActionValidatorPolicy.submitCertificate() and validate()
- **Assumptions:** Signing key is not compromised, domain separator correctly identifies the contract

---

## 6. Full Protocol Walkthrough

### Scenario: Alice deposits 10,000 USDC, AI allocates to Aave, yield accrues, Alice withdraws with profit

**Day 0 — Setup**

The protocol owner has:
- Deployed AionVault with USDC as the underlying asset
- Added StrategyAave with maxDebt of 500,000 USDC
- Set allocator to AutonomousAllocator address
- Registered an AI agent (AgentX) in AIAgentRegistry with 1,000 token stake
- Configured CRE workflows for YIELD_ALLOCATION and STRATEGY_HARVEST
- Set VolumeRatePolicy: max 10% TVL per action, max 5 rebalances per hour

**Day 1 — Alice Deposits**

Alice approves AionVault to spend 10,000 USDC, then calls:
```
vault.deposit(10_000e6, alice)
```

Vault state after:
- `totalIdle = 10,000`
- `totalDebt = 0`
- `totalSupply = 10,000 shares` (1:1 ratio, first depositor)
- Alice holds 10,000 shares

**Day 1 — AI Analyzes and Allocates**

CRE triggers the YIELD_ALLOCATION workflow:

1. `CREExecutionHook.executePreHook()` returns vault address, allocator address, engine address
2. Off-chain: Chainlink DON runs AI model. Model sees:
   - Aave USDC supply APY: 4.2%
   - Vault has 10,000 USDC idle
   - StrategyAave risk score: low (audited, high TVL)
3. AI recommends: allocate 6,000 USDC to StrategyAave (60%), keep 4,000 idle (40% reserve)
4. AI confidence: 92%

CRE delivers result:

1. `CREExecutionHook.executePostHook()` decodes recommendation
2. Calls `AIYieldEngine.submitAllocationRecommendation(USDC, [StrategyAave], [6000e6], 92, proofHash)`
3. PolicyEngine validates:
   - CertifiedActionValidatorPolicy: Valid EIP-712 signature from authorized signer
   - VolumeRatePolicy: 6,000 < 10% of TVL cap, action 1/5 this hour
4. Confidence 92% >= 70% threshold -> auto-execute
5. AIYieldEngine calls `AutonomousAllocator.executeStrategyAllocation([StrategyAave], [6000e6], 92, proofHash)`
6. Allocator validates: StrategyRegistry.isApproved(StrategyAave) -> true, RiskManager.isApproved(StrategyAave) -> true
7. Allocator checks: cooldown passed, confidence 92% >= 75% min
8. Allocator calls `vault.updateDebt(StrategyAave, 6000e6)`
9. Vault enforces: targetDebt 6000 <= 40% of 10,000 TVL -> passes (60% but within maxDebt)
10. Vault transfers 6,000 USDC to StrategyAave
11. StrategyAave calls `aavePool.supply(USDC, 6000e6, address(this), 0)`
12. StrategyAave receives 6,000 aUSDC

Vault state after:
- `totalIdle = 4,000`
- `totalDebt = 6,000`
- `strategy[StrategyAave].currentDebt = 6,000`
- External: StrategyAave holds 6,000 aUSDC in Aave

**Day 8 — Yield Has Accrued**

Aave borrowers have paid interest. StrategyAave's aUSDC balance has grown from 6,000 to 6,050 (0.83% weekly yield ≈ 4.2% APY).

CRE triggers the STRATEGY_HARVEST workflow:

1. `CREExecutionHook.executePreHook()` for STRATEGY_HARVEST
2. AI determines StrategyAave should be harvested
3. `CREExecutionHook.executePostHook()` calls `AIYieldEngine.triggerBatchHarvest([StrategyAave])`
4. AIYieldEngine calls `vault.processReport(StrategyAave)`

Vault processes the report:

1. `StrategyAave.totalAssets() = 6,050` (6,000 aUSDC + 50 accrued interest)
2. `currentDebt = 6,000` -> gain = 50 USDC
3. Health check: gain of 50 on 6,000 debt = 0.83%. If maxProfitPerHarvestBps is set to 1000 (10%), this passes.
4. Performance fee: `50 * 1500 / 10000 = 7.5 USDC`
5. Management fee: `6000 * 200 / 10000 * 7 days / 365 days ~ 2.3 USDC`
6. Total fees: 9.8 USDC
7. Fee shares minted: `convertToShares(9.8) ~ 9.8 shares` to feeRecipient
8. Strategy debt updated: `currentDebt = 6,000 + 50 - 9.8 = 6,040.2`
9. `totalDebt = 6,040.2`

Vault state after:
- `totalIdle = 4,000`
- `totalDebt = 6,040.2`
- `totalAssets() = 10,040.2`
- `totalSupply = 10,009.8` (original 10,000 + 9.8 fee shares)
- Share price: `10,040.2 / 10,009.8 ≈ 1.00304` (share price increased)
- Alice's 10,000 shares now worth: `10,000 * 1.00304 = 10,030.4 USDC`

**Day 10 — Alice Withdraws**

Alice calls:
```
vault.withdraw(10_030e6, alice, alice)
```

1. Shares to burn: `convertToShares(10,030) ~ 9,969.7 shares`
2. Withdrawal is allowed even if vault is paused (users can always exit)
3. `totalIdle = 4,000` < 10,030 needed -> must pull from strategies
4. Deficit: `10,030 - 4,000 = 6,030`
5. Vault calls `_withdrawFromStrategies(6,030)`:
   - WithdrawalQueue returns `[StrategyAave]` as the unwind order
   - Calls `StrategyAave.withdraw(6,030)`
   - StrategyAave calls `aavePool.withdraw(USDC, 6,030, address(this))`
   - 6,030 USDC returned to vault
6. `totalIdle = 4,000 + 6,030 = 10,030`
7. Burns 9,969.7 of Alice's shares
8. Transfers 10,030 USDC to Alice

Alice's profit: 30 USDC (after fees) on 10,000 USDC in 10 days.

Vault state after:
- `totalIdle ≈ 0`
- `totalDebt ≈ 10.2` (remaining in Aave)
- `totalSupply ≈ 40.1` (fee shares + Alice's remaining ~30.3 shares)
- feeRecipient holds 9.8 shares representing their earned fees

**The protocol has reached a stable end state.** All accounting is consistent, fees have been properly allocated, and the user received their principal plus yield minus protocol fees.

---

## 7. Strategy Registry Validation

Before a strategy can receive capital, it must be registered and approved by governance in `StrategyRegistry`.

When the AI recommends an allocation, `AutonomousAllocator.executeStrategyAllocation()` queries `StrategyRegistry.isApproved(strategy)` for each strategy in the recommendation. If the strategy is inactive or not registered, the entire allocation is rejected.

Strategy metadata stored in the registry:
- `address strategy` — contract address
- `string name` — human-readable name
- `StrategyCategory category` — LENDING, LIQUIDITY_PROVISION, BASIS_TRADE, YIELD_TRADING, PEG_ARBITRAGE, LENDING_ARBITRAGE, PRIVATE_DEAL
- `address asset` — underlying asset (read from strategy contract on registration)
- `uint256 riskScore` — 0-10000, lower = safer
- `uint256 registeredAt` — registration timestamp
- `bool isApproved` — governance approval status

Governance can revoke or re-approve strategies at any time via `revokeStrategy()` / `approveStrategy()`.

---

## 8. Strategy Simulation (Pre-Allocation)

Before an AI recommendation reaches on-chain execution, the AI system performs a simulation using external market data off-chain.

Simulation inputs include:
- Strategy APY (from DefiLlama, protocol APIs)
- Liquidity depth (can the pool absorb the allocation without excessive slippage?)
- Expected slippage (price impact of entering/exiting the position)
- Gas cost estimates
- Protocol risk score (audit history, TVL stability, exploit count)

If expected slippage or liquidity risk exceeds protocol limits, the recommendation is rejected before it reaches `AIYieldEngine.submitAllocationRecommendation()`. This is enforced off-chain by the AI model within the Chainlink CRE workflow.

---

## 9. Slippage Protection

Strategies that involve token swaps must respect slippage limits enforced by `SlippageController`.

`SlippageController` provides:
- `defaultSlippageBps` — global default (0.5%)
- Per-strategy overrides via `setStrategySlippage()`
- `getMinOutput(strategy, expectedOutput)` — calculates minimum acceptable output
- `enforceSlippage(strategy, expectedOutput, actualOutput)` — reverts if slippage exceeds tolerance

`StrategyBase` stores a `slippageController` address. Concrete strategies that involve swaps (Curve LP, Pendle yield trading, basis trades) call `enforceSlippage()` after executing trades. For direct lending strategies like StrategyAave (no swaps), slippage protection is not needed.

---

## 10. Strategy Allocation Caps

The vault enforces a maximum allocation per strategy via `maxStrategyAllocationBps` (default 40%).

When `AionVault.updateDebt()` increases a strategy's debt, it checks:
```
(targetDebt * BPS) / totalAssets() <= maxStrategyAllocationBps
```

If exceeded, the transaction reverts with `MaxAllocationExceeded()`. This prevents excessive concentration in any single strategy.

---

## 11. Withdrawal Queue

When idle liquidity is insufficient for withdrawals, `AionVault._withdrawFromStrategies()` unwinds strategies in a deterministic order defined by `WithdrawalQueue`.

If a WithdrawalQueue is configured, the vault queries `WithdrawalQueue.getQueue(address(this))` to get the ordered list of strategies. The AI/allocator can update this ordering to optimize for:
- Lowest slippage strategies first
- Most liquid strategies first
- Lowest-performing strategies first (preserve high-yield positions)

If no WithdrawalQueue is set, the vault falls back to iterating `activeStrategies` in their insertion order.

---

## 12. Strategy Health Checks

Before accepting a harvest report, `AionVault.processReport()` verifies that the reported profit or loss is within safe bounds.

Configurable limits:
- `maxProfitPerHarvestBps` — maximum profit as % of currentDebt (e.g., 1000 = 10%)
- `maxLossPerHarvestBps` — maximum loss as % of currentDebt (e.g., 500 = 5%)

If a strategy reports gain exceeding `maxProfitPerHarvestBps`, the transaction reverts with `HealthCheckFailed_MaxProfit()`. If loss exceeds `maxLossPerHarvestBps`, it reverts with `HealthCheckFailed_MaxLoss()`.

This prevents manipulated or faulty strategy accounting from corrupting vault share prices. Governance must review and either adjust the health check bounds or investigate the strategy before retrying.

---

## 13. Risk Manager

`RiskManager` continuously evaluates protocol risk exposure and is queried by `AutonomousAllocator` before every allocation.

Risk assessment per strategy includes:
- `riskScore` (0-10000, lower = safer)
- `maxAllocationBps` (per-strategy allocation cap based on risk)
- `hasAudit` and `auditCount`
- `tvlStabilityScore` (0-10000)
- `incidentCount` (historical exploits)

Auto-approval rule: `riskScore <= maxAcceptableRisk && hasAudit == true`

If a strategy is not risk-approved, the allocator rejects the allocation with `"Strategy not risk-approved"`. The risk assessor role (AI or governance) can update assessments via `assessStrategy()`. Governance can flag strategies immediately via `flagStrategy()`.

---

## 14. Emergency Pause

Governance or the guardian can pause the protocol via `AionVault.pause()` or `GovernanceController.pauseProtocol()`.

**Paused operations:**
- Deposits (`_deposit()` has `whenNotPaused` modifier)
- Strategy allocations (`updateDebt()` has `whenNotPaused` modifier)

**Allowed operations during pause:**
- Withdrawals (users can always exit — `_withdraw()` has no pause check)
- Emergency strategy exits

Only the owner can unpause. The guardian can pause but cannot unpause, ensuring a compromised guardian cannot toggle the protocol freely.

---

## 15. Strategy Failure Handling

If a strategy becomes unsafe or loses funds:

1. RiskManager flags the strategy via `flagStrategy(strategy, reason)`
2. Governance revokes the strategy in StrategyRegistry via `revokeStrategy(strategy)`
3. Owner calls `AionVault.emergencyWithdrawStrategy(strategy)`
   - Vault calls `IStrategy(strategy).emergencyWithdraw()`
   - Strategy pulls all funds from the external protocol regardless of loss
   - Strategy deactivates itself (`isActive = false`)
   - Recovered funds return to vault idle balance
   - Strategy's currentDebt is set to zero

---

## 16. Strategy Migration

When a strategy must be replaced (e.g., newer version, better parameters), the vault migrates capital without users needing to withdraw.

Owner calls `AionVault.migrateStrategy(oldStrategy, newStrategy)`:
1. Vault calls `oldStrategy.withdraw(debtToMigrate)` — pulls all capital from old strategy
2. Old strategy's currentDebt is zeroed, totalDebt reduced
3. Vault deploys recovered funds to new strategy via `safeTransfer` + `newStrategy.deposit()`
4. New strategy's currentDebt increases, totalDebt restored

The new strategy must already be added to the vault with sufficient maxDebt.

---

## 17. Keeper / Automation System

Certain protocol operations must be triggered periodically:

- **Harvest execution** — CRE triggers `STRATEGY_HARVEST` workflow, AI determines which strategies to harvest, `AIYieldEngine.triggerBatchHarvest()` calls `vault.processReport()` per strategy
- **Strategy rebalancing** — CRE triggers `YIELD_ALLOCATION` workflow, AI recommends new target debts, `AutonomousAllocator.executeStrategyAllocation()` adjusts positions
- **Risk monitoring** — CRE triggers `RISK_MONITORING` workflow, gathers on-chain state and AI evaluates protocol health

Automation is handled by Chainlink CRE workflows with configurable minimum intervals per workflow type. AI agents and protocol keepers can also trigger these operations.

---

## 18. Protocol Fee Distribution

Protocol fees collected during harvest are minted as vault shares to the fee recipient (ProtocolFeeController).

ProtocolFeeController then distributes collected fees:
- Treasury: 50% (configurable)
- Insurance Fund: 30%
- Development Fund: 20%

Per-vault and per-strategy fee overrides are supported. The fee controller also serves as the global fee configuration store, allowing governance to adjust default performance fees (15%) and management fees (1% annual) across all vaults.

---

## 19. Full System Lifecycle

The complete system lifecycle with all safeguards:

```
User Deposit
    |
Vault Mint Shares
    |
AI Strategy Simulation (off-chain)
    |
Policy Validation (CertifiedAction + VolumeRate)
    |
StrategyRegistry + RiskManager Validation
    |
Strategy Allocation (with allocation caps)
    |
Yield Accrual (external protocols)
    |
Harvest + Health Check + Fee Assessment
    |
Risk Monitoring (continuous)
    |
User Withdrawal (via WithdrawalQueue, always allowed)
```

Emergency paths:
- `emergencyWithdrawStrategy()` — pull all funds from a compromised strategy
- `migrateStrategy()` — move capital from old strategy to new
- `pause()` — block deposits and allocations while allowing withdrawals

---

## 20. Scope Applied

- No `scope.txt` file found — all contracts analyzed
- No `out-of-scope.txt` file found — nothing excluded
- Deprecated contracts (LendingPool, InterestRateModel, LiquidationAutomation, AToken, VariableDebtToken) were excluded from analysis as they belong to the pre-pivot lending architecture and are marked for removal
