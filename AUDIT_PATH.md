# Audit Path

## 1. Scope Map from Protocol Walkthrough

### Critical Contracts by Custody Level

**HIGH CUSTODY** — directly holds or moves user funds:
| Contract | Why |
|----------|-----|
| AionVault | Holds all idle USDC. Controls all transfers to/from strategies. Mints/burns shares. |
| StrategyBase / StrategyAave | Holds claims on external protocol funds (aTokens). Executes deposits/withdrawals to external DeFi. |
| CrossChainVault | Locks tokens for cross-chain transfers. Holds lockedBalance per token. |
| X402PaymentGateway | Holds USDC escrow balances for AI agent payments. |

**MEDIUM CUSTODY** — can trigger fund movement but does not hold funds:
| Contract | Why |
|----------|-----|
| AutonomousAllocator | Calls vault.updateDebt() and vault.processReport(). Controls when and how much capital moves. |
| AIYieldEngine | Can trigger allocation execution and harvests. Gateway between AI recommendations and fund movement. |
| CREExecutionHook | Delivers off-chain results that trigger allocations and harvests. |
| AIRevenueDistributor | Distributes revenue to agents. Holds claimable balances. |

**LOW CUSTODY** — configuration and governance only:
| Contract | Why |
|----------|-----|
| GovernanceController | Timelock governance. Can call arbitrary targets via proposals. |
| PolicyEngine | Validates actions but does not hold or move funds. |
| CertifiedActionValidatorPolicy | Validates signatures. No fund interaction. |
| VolumeRatePolicy | Rate limiting. No fund interaction. |
| RiskManager | Risk scoring. No fund interaction. |
| StrategyRegistry | Strategy directory. No fund interaction. |
| WithdrawalQueue | Withdrawal ordering. No fund interaction. |
| SlippageController | Slippage validation. No fund interaction. |
| ProtocolFeeController | Fee configuration. No fund interaction (fees minted as shares in vault). |
| AIAgentRegistry | Agent registration and staking. Holds agent stakes. |
| ChainlinkPriceOracle | Price feeds. No fund interaction. |

### Critical Flows by TVL Exposure

| Flow | TVL Exposure | Frequency |
|------|-------------|-----------|
| Deposit → Vault | 100% of deposit | Per user action |
| Allocation (updateDebt) | Up to 40% of TVL per strategy | Per AI recommendation (cooldown: 4h) |
| Harvest (processReport) | Affects share price for all holders | Per harvest cycle |
| Withdrawal | Up to 100% of user's shares | Per user action |
| Cross-chain deposit | Per-message amount | Per cross-chain user action |
| Fee minting | Dilutes all shareholders | Per harvest |

### Scope Applied
- No scope.txt or out-of-scope.txt files found
- All contracts included in analysis
- Deprecated lending contracts excluded (LendingPool, InterestRateModel, LiquidationAutomation)

---

## 2. Money Storage and Custody Checkpoints

### Checkpoint 1: AionVault — Idle Balance
- **Stored as:** USDC ERC20 balance of vault contract (`totalIdle`)
- **Who can trigger movement:**
  - Depositor: via `withdraw()` / `redeem()` (burns shares, receives assets)
  - Allocator: via `updateDebt()` (deploys idle to strategy)
  - Owner: via `updateDebt()` (same authority as allocator)
- **Preconditions:** Withdraw requires sufficient shares. updateDebt requires strategy is active, maxDebt not exceeded, 40% allocation cap respected, minimumTotalIdle maintained.
- **Postconditions:** `totalIdle + totalDebt == totalAssets()` must hold. Share supply adjusts proportionally.
- **Invariant:** `IERC20(asset).balanceOf(vault) >= totalIdle`

### Checkpoint 2: Strategy Contracts — Deployed Capital
- **Stored as:** aTokens (Aave), LP tokens (Curve), etc. held by strategy contract
- **Who can trigger movement:**
  - Vault only: via `deposit()`, `withdraw()`, `emergencyWithdraw()`
  - Strategy cannot self-initiate transfers back to vault
- **Preconditions:** Caller must be vault address (enforced by `onlyVault` modifier)
- **Postconditions:** `strategy.totalAssets()` must accurately reflect deployed + idle balance
- **Invariant:** Strategy's `asset` must match vault's `asset`

### Checkpoint 3: CrossChainVault — Locked Tokens
- **Stored as:** `lockedBalance[token]` mapping
- **Who can trigger movement:**
  - Teleporter message (MSG_WITHDRAW from remote chain)
  - Owner (emergency functions if any)
- **Preconditions:** Valid Teleporter message from registered remote vault on supported chain
- **Postconditions:** `lockedBalance[token]` decreases by withdrawn amount
- **Invariant:** `IERC20(token).balanceOf(crossChainVault) >= sum(lockedBalance[token])`

### Checkpoint 4: X402PaymentGateway — Escrow Balances
- **Stored as:** `escrowBalances[payer]` mapping
- **Who can trigger movement:**
  - Payer: via `withdraw()` (retrieves unused escrow)
  - Owner/authorized: via `processPayment()` (pays provider)
- **Preconditions:** Sufficient escrow balance for payment
- **Postconditions:** `escrowBalances[payer] -= amount`
- **Invariant:** `sum(escrowBalances) + sum(pending) <= IERC20(paymentToken).balanceOf(gateway)`

### Checkpoint 5: AIAgentRegistry — Agent Stakes
- **Stored as:** `agents[agent].stakedAmount`
- **Who can trigger movement:**
  - Agent: via `deregisterAgent()` (returns stake)
  - Owner: via `slashAgent()` (reduces stake, tokens stay in contract)
- **Preconditions:** Agent must be active to deregister. Slash requires owner.
- **Postconditions:** Stake returned on deregister. Slash reduces stakedAmount.
- **Invariant:** `sum(stakedAmounts) <= stakingToken.balanceOf(registry)`

---

## 3. Money Flow Pipelines

### Pipeline 1: Deposit → Allocate → Earn → Harvest → Withdraw

```
User USDC
  │ [Trust boundary: user approves ERC20]
  ▼
AionVault.deposit()
  │ transfers USDC to vault
  │ mints shares to user
  │ totalIdle += amount
  │ [Trust boundary: allocator role]
  ▼
AionVault.updateDebt()  ← called by AutonomousAllocator
  │ transfers USDC to strategy
  │ totalIdle -= amount, totalDebt += amount
  │ [Trust boundary: vault → strategy]
  ▼
StrategyAave.deposit()
  │ approves Aave pool
  │ calls aavePool.supply()
  │ [Trust boundary: strategy → external protocol]
  ▼
Aave V3 Pool
  │ holds USDC, issues aTokens
  │ aToken balance grows over time (yield)
  ▼
AionVault.processReport()  ← called by Allocator
  │ reads strategy.totalAssets()
  │ calculates gain = totalAssets - currentDebt
  │ mints fee shares to feeRecipient
  │ updates debt accounting
  │ [No fund movement — accounting only]
  ▼
AionVault.withdraw()  ← called by user
  │ burns shares
  │ if totalIdle insufficient:
  │   calls strategy.withdraw() → aavePool.withdraw()
  │   USDC returns to vault
  │ transfers USDC to user
  ▼
User receives USDC + yield - fees
```

**Failure modes at each boundary:**
- User → Vault: Insufficient approval or balance. DepositLimitExceeded.
- Vault → Strategy: Strategy not active. MaxDebt exceeded. 40% allocation cap breached. MinimumTotalIdle violated.
- Strategy → Aave: Aave pool paused. Supply cap reached. Approval failure.
- Harvest: Strategy reports inflated totalAssets (see vulnerability section). Stale lastReport timestamp manipulation.
- Withdraw: Aave insufficient liquidity (utilization too high). Strategy returns less than requested (slippage).

### Pipeline 2: Cross-Chain Deposit

```
User USDC (Source Chain)
  │ [Trust boundary: user approves CrossChainVault]
  ▼
CrossChainVault.depositCrossChain()
  │ locks tokens in contract
  │ lockedBalance[token] += amount
  │ [Trust boundary: Teleporter bridge]
  ▼
Avalanche Teleporter
  │ delivers message to destination chain
  │ [Trust boundary: remote vault address validation]
  ▼
CrossChainVault.receiveTeleporterMessage() (Destination)
  │ validates source chain and sender
  │ maps token to local equivalent
  │ deposits into local AionVault
  ▼
AionVault.deposit() (Destination)
  │ mints shares to receiver
```

**Failure modes:**
- Source → Teleporter: Message delivery failure (tokens locked but no shares minted)
- Teleporter → Destination: Spoofed source chain ID or sender address
- Token mapping: Incorrect mapping leads to wrong asset deposited
- No atomic guarantee: Source lock and destination mint are not atomic

### Pipeline 3: AI Agent Payment

```
Protocol USDC
  │ [Trust boundary: protocol approves gateway]
  ▼
X402PaymentGateway.deposit()
  │ escrowBalances[payer] += amount
  ▼
X402PaymentGateway.processPayment()  ← called by authorized
  │ escrowBalances[payer] -= price
  │ transfers (price - fee) to provider
  │ transfers fee to feeRecipient
  ▼
AIRevenueDistributor.depositRevenue()
  │ epochTotalRevenue[currentEpoch] += amount
  ▼
AIRevenueDistributor.finalizeEpoch()  ← called by owner
  │ distributes: 70% agents, 15% top agents, 10% community, 5% reserve
  │ updates claimableBalance[agent]
  ▼
AIRevenueDistributor.claimRevenue()  ← called by agent
  │ transfers claimable to agent
```

---

## 4. Vulnerability-Focused Test Tracks

### 4.1 Unauthorized Transaction

**Attack hypothesis:** An unauthorized address calls `updateDebt()` or `processReport()` to move vault funds.

**Preconditions:** Attacker must be set as `allocator` or `owner`, OR access control is bypassed.

**Target functions:**
- `AionVault.updateDebt()` — modifier: `onlyAllocatorOrOwner`
- `AionVault.processReport()` — modifier: `onlyAllocatorOrOwner`
- `AionVault.addStrategy()` / `revokeStrategy()` — modifier: `onlyOwner`
- `AutonomousAllocator.executeStrategyAllocation()` — checks `msg.sender == aiYieldEngine || msg.sender == owner()`
- `AIYieldEngine.submitAllocationRecommendation()` — checks `authorizedCallers[msg.sender] || msg.sender == owner()`

**Expected safe behavior:** Only designated roles can trigger fund movement. PolicyEngine provides additional validation layer.

**Red flags:**
- `setAllocator()` has no timelock — owner can change allocator instantly
- `AIYieldEngine.setAuthorizedCaller()` has no timelock — new callers can be added instantly
- If PolicyEngine is disabled (`engineActive = false`), all policy checks are bypassed
- `GovernanceController.emergencyAction()` bypasses timelock — guardian can call arbitrary contracts

---

### 4.2 Transaction Manipulation

**Attack hypothesis:** Attacker manipulates strategy's reported `totalAssets()` to inflate gains or deflate losses during `processReport()`.

**Preconditions:** Attacker controls or can influence strategy contract, OR can manipulate external protocol state (flash loan).

**Target functions:**
- `AionVault.processReport()` — reads `IStrategy(strategy).totalAssets()`
- `StrategyBase.totalAssets()` — returns `_totalInvested() + asset.balanceOf(this)`
- `StrategyAave._totalInvested()` — returns `aToken.balanceOf(this)`

**Attack scenario:**
1. Attacker flash-loans USDC
2. Supplies to Aave, receives aTokens
3. Transfers aTokens to StrategyAave contract
4. Triggers `processReport()` — vault sees inflated totalAssets
5. Vault mints excess fee shares or miscalculates debt
6. Attacker retrieves aTokens

**Expected safe behavior:** Strategy's `totalAssets()` should only reflect legitimately deployed capital, not donated tokens.

**Red flags:**
- `StrategyBase.totalAssets()` includes `IERC20(asset).balanceOf(address(this))` — direct donations to strategy inflate reported assets
- `StrategyAave._totalInvested()` returns raw aToken balance — donations of aTokens inflate reported assets
- No mechanism to distinguish between earned yield and donated tokens
- `processReport()` has no flash loan guard (no block.number check)

---

### 4.3 Logic / Business Mismatch

**Attack hypothesis:** Fee calculation diverges from documented behavior, resulting in incorrect fee extraction.

**Preconditions:** None — this is a logic correctness issue.

**Target functions:**
- `AionVault.processReport()` — fee calculation block

**Specific concerns:**

1. **Management fee time-weighting:** Fee is calculated as `currentDebt * managementFee * duration / (MAX_BPS * SECONDS_PER_YEAR)`. If `lastReport` is never updated (first report), duration could be very large, extracting excessive fees.

2. **Fee share minting dilution:** Fees are minted as new shares to feeRecipient. This dilutes all existing shareholders. If fees are calculated on inflated `totalAssets()`, dilution is amplified.

3. **Loss handling:** When strategy reports a loss, `totalDebt` and `currentDebt` decrease. But the vault does not burn any shares — loss is socialized across all shareholders via reduced share price. This is correct for the design but should be verified.

4. **Share price manipulation on first deposit:** If vault has 0 shares and attacker deposits 1 wei, then donates tokens directly to inflate share price, subsequent depositors get fewer shares. Classic ERC4626 inflation attack.

5. **Withdrawal fee absence:** The spec mentions a withdrawal fee when pulling from strategies, but the current implementation does not charge one. This means strategy exit costs (slippage, gas) are socialized.

---

### 4.4 Reentrancy

**Attack hypothesis:** Reentrant call during deposit/withdraw/updateDebt manipulates vault state.

**Preconditions:** Malicious token or strategy contract that calls back into vault during transfer.

**Target functions:**
- `AionVault.deposit()` — transfers ERC20 then mints shares
- `AionVault.withdraw()` — burns shares then transfers ERC20
- `AionVault.updateDebt()` — transfers to/from strategy
- `StrategyBase.deposit()` / `withdraw()` — interacts with external protocols

**Expected safe behavior:** ReentrancyGuardUpgradeable on vault prevents reentrant calls.

**Red flags:**
- Verify `nonReentrant` modifier is on ALL state-changing functions that move funds
- `updateDebt()` calls `IStrategy(strategy).withdraw()` which calls external protocol — if strategy does not have reentrancy guard, attacker-controlled strategy could reenter vault
- `_withdrawFromStrategies()` iterates strategies and calls `withdraw()` on each — if one strategy reenters, vault state may be inconsistent for subsequent strategy calls
- Cross-contract reentrancy: Vault → Strategy → External Protocol → callback to Vault (different function, same nonReentrant slot)

---

### 4.5 Reordering (Front-running / MEV)

**Attack hypothesis:** MEV bot observes pending allocation or harvest transaction and front-runs to extract value.

**Preconditions:** Public mempool visibility of allocation/harvest transactions.

**Target functions:**
- `AutonomousAllocator.executeStrategyAllocation()` — visible allocation targets
- `AionVault.processReport()` — visible harvest about to increase share price
- `AionVault.deposit()` / `withdraw()` — share price changes

**Attack scenarios:**

1. **Harvest sandwich:** Bot sees `processReport()` pending that will increase share price. Bot deposits before harvest (gets shares at old price), waits for harvest (share price increases), withdraws after (gets more assets). Profit = share of the harvested yield.

2. **Allocation front-run:** Bot sees allocation to StrategyAave pending. Bot supplies to Aave first, reducing available APY. Not directly profitable but reduces protocol yield.

3. **Withdrawal sandwich:** Bot sees large withdrawal that will pull from strategies (causing slippage on external protocol). Bot positions to profit from the slippage.

**Red flags:**
- No deposit/withdrawal fee to discourage sandwich attacks
- `processReport()` and `executeStrategyAllocation()` are not protected against front-running
- No minimum deposit duration (can deposit and withdraw in same block)
- Share price jumps discretely at harvest rather than accruing continuously

---

## 5. Prioritized Audit Workflow

### Phase 1: Storage and Accounting (Highest Impact)

1. **AionVault share accounting**
   - Verify `totalAssets() == totalIdle + totalDebt` invariant holds across all paths
   - Verify `IERC20(asset).balanceOf(vault) >= totalIdle` after every operation
   - Check ERC4626 inflation attack protection (first depositor attack)
   - Verify fee share minting does not break share price calculation

2. **AionVault.processReport() fee calculation**
   - Verify management fee time-weighting with edge cases (first report, zero duration, max duration)
   - Verify performance fee only charges on actual gains (not on donated tokens)
   - Verify loss handling reduces debt correctly without creating underflow

3. **AionVault.updateDebt() fund transfer**
   - Verify debt increase: correct amount transferred, totalIdle/totalDebt updated atomically
   - Verify debt decrease: strategy.withdraw() return value handled (actual may differ from requested)
   - Verify 40% allocation cap cannot be bypassed with multiple small calls
   - Verify minimumTotalIdle is enforced before transfer, not after

### Phase 2: Flow Edges and Trust Boundaries

4. **Strategy.totalAssets() manipulation**
   - Can donated tokens inflate totalAssets()?
   - Can flash-loaned aTokens be sent to strategy before processReport()?
   - Does _totalInvested() accurately track only vault-deployed capital?

5. **AutonomousAllocator access control chain**
   - Verify only AIYieldEngine or owner can call executeStrategyAllocation()
   - Verify cooldown cannot be bypassed (timestamp manipulation)
   - Verify confidence threshold is enforced when autonomous mode is enabled

6. **PolicyEngine bypass paths**
   - Can owner disable PolicyEngine and execute without policy checks?
   - Can governanceController add a permissive policy that approves everything?
   - What happens if PolicyEngine.validateAction() reverts instead of returning false?

7. **Withdrawal path completeness**
   - What if strategy.withdraw() returns less than requested? Does vault handle the shortfall?
   - What if all strategies are paused/empty and totalIdle is insufficient?
   - Does _withdrawFromStrategies() correctly update totalIdle and totalDebt for partial withdrawals?

### Phase 3: Cross-Contract Orchestration

8. **CREExecutionHook → AIYieldEngine → AutonomousAllocator → AionVault**
   - Can a malicious CRE result cause unexpected state changes?
   - What if decoded allocation data contains invalid strategy addresses?
   - What if allocation arrays have mismatched lengths?

9. **CrossChainVault message handling**
   - Can spoofed Teleporter messages unlock tokens?
   - What if deposit succeeds on destination but source lock already happened (no rollback)?
   - Token mapping correctness — can wrong token be deposited?

10. **X402PaymentGateway → AIRevenueDistributor**
    - Can payments be processed for non-existent providers?
    - Can epoch finalization be called multiple times for same epoch?
    - Can agents claim more than their allocated revenue?

### Phase 4: Integration Assumptions

11. **Aave V3 assumptions**
    - What if Aave pool is paused during vault withdrawal? User funds stuck.
    - What if aToken rebases or has non-standard behavior?
    - What if Aave's withdraw returns less than requested?

12. **Chainlink assumptions**
    - What if Chainlink Functions returns malformed data?
    - What if price oracle returns stale or zero price?
    - What if CRE workflow delivers duplicate results?

13. **EIP-712 certificate validation**
    - Can certificates be replayed across chains (domain separator check)?
    - Can expired certificates still be used (deadline check)?
    - What if signer key is compromised — how fast can it be revoked?

---

## 6. High-Probability Bug Shortlist

### Bug 1: ERC4626 Inflation Attack (First Depositor)
**Probability: HIGH**

**Why likely:** AionVault uses standard ERC4626 without explicit inflation attack mitigation (no virtual shares/assets offset). First depositor can deposit 1 wei, donate tokens directly to vault (increasing totalAssets but not totalSupply), then all subsequent depositors get fewer shares.

**Evidence to collect:**
- Check if `_decimalsOffset()` is overridden to add virtual shares
- Check if there's a minimum deposit amount
- Check if `totalAssets()` can be inflated by direct token transfer to vault
- Note: `totalAssets()` returns `totalIdle + totalDebt`, so direct transfers to vault address would NOT increase totalAssets. Check if vault's `_deposit` or ERC4626 base updates `totalIdle` on raw balance.

### Bug 2: Strategy totalAssets() Donation Attack
**Probability: HIGH**

**Why likely:** `StrategyBase.totalAssets()` includes raw `asset.balanceOf(address(this))`. Anyone can send tokens directly to the strategy contract to inflate its reported assets. When `processReport()` is called, the vault sees an artificial gain, mints excess fee shares (diluting users), and increases currentDebt to an inflated value.

**Evidence to collect:**
- Read `StrategyBase.totalAssets()` implementation
- Read `StrategyAave._totalInvested()` implementation
- Test: send 1000 USDC directly to StrategyAave, call processReport(), check if gain is recorded
- Check if fee shares are minted on the inflated gain

### Bug 3: Harvest Sandwich Attack (No Deposit Cooldown)
**Probability: MEDIUM-HIGH**

**Why likely:** No minimum deposit duration or deposit fee. An attacker can deposit immediately before a `processReport()` transaction (visible in mempool), capture a share of the yield as share price increases, then withdraw immediately after. This extracts yield from long-term depositors.

**Evidence to collect:**
- Check if deposit has any cooldown or fee
- Check if processReport() is protected from front-running
- Check if there's a withdrawal fee that would make sandwich unprofitable

### Bug 4: Allocator Role Change Without Timelock
**Probability: MEDIUM**

**Why likely:** `AionVault.setAllocator()` is `onlyOwner` with no timelock. If owner key is compromised, attacker can set a malicious allocator that drains vault via `updateDebt()` to attacker-controlled "strategy."

**Evidence to collect:**
- Check `setAllocator()` for timelock or delay
- Check `addStrategy()` for timelock or delay
- Verify if a malicious strategy could be added and funded in a single transaction

### Bug 5: processReport() Management Fee on First Report
**Probability: MEDIUM**

**Why likely:** Management fee is calculated as `currentDebt * managementFee * (block.timestamp - lastReport) / (MAX_BPS * SECONDS_PER_YEAR)`. If `lastReport` is set to `block.timestamp` at strategy activation, first report should be correct. But if there's a gap between activation and first debt deployment, the duration might be calculated from activation time rather than when debt was actually deployed.

**Evidence to collect:**
- Check when `lastReport` is initialized in `addStrategy()`
- Check when `lastReport` is updated (only in processReport or also in updateDebt)
- Test: add strategy, wait 1 year, deploy debt, immediately call processReport — is management fee charged for the full year?

### Bug 6: Cross-Chain Lock Without Guaranteed Mint
**Probability: MEDIUM**

**Why likely:** `CrossChainVault.depositCrossChain()` locks tokens on the source chain and sends a Teleporter message. If the message fails to deliver or destination processing reverts, tokens are locked with no automatic unlock mechanism.

**Evidence to collect:**
- Check if there's a timeout/refund mechanism for failed cross-chain deposits
- Check if Teleporter guarantees delivery or has retry logic
- Check if locked tokens can be manually released by owner

### Bug 7: PolicyEngine Disable Path
**Probability: LOW-MEDIUM**

**Why likely:** Multiple paths exist to disable policy enforcement:
1. `PolicyEngine.setEngineActive(false)` — governance can disable globally
2. `PolicyProtected.setPolicyEnforcement(false)` — each contract can disable independently
3. `GovernanceController.emergencyAction()` — guardian can call either of the above

If any of these are executed (legitimately or via compromise), all AI actions proceed without compliance checks.

**Evidence to collect:**
- Check who can call `setEngineActive()`
- Check who can call `setPolicyEnforcement()`
- Check if guardian's `emergencyAction()` is logged/monitored
- Check if there are events emitted when policy enforcement is toggled

---

## 7. Scope Applied

- No `scope.txt` file found — all contracts analyzed without restriction
- No `out-of-scope.txt` file found — nothing excluded
- Deprecated contracts (LendingPool, InterestRateModel, LiquidationAutomation, AToken, VariableDebtToken) were excluded as they belong to the pre-pivot lending architecture
