// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC4626Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC4626Upgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IStrategy} from "../interfaces/IStrategy.sol";

/**
 * @title AionVault
 * @author ChainNomads (AION Finance)
 * @notice ERC4626 yield vault with tranche-based risk segmentation.
 *
 * @dev Users choose a risk tier (Senior or Junior) when depositing.
 *      All tranches share the same capital pool and strategies, but
 *      yield and losses are distributed differently:
 *
 *      TRANCHE SYSTEM:
 *      - Senior (low risk): receives base yield, absorbs losses last
 *      - Junior (high risk): receives boosted yield (2x multiplier),
 *        absorbs losses first (waterfall)
 *
 *      ACCOUNTING INVARIANT:
 *      totalIdle + totalDebt = seniorAssets + juniorAssets + accruedProtocolFees
 *
 *      LOSS WATERFALL:
 *      Loss → Junior first → Senior only if Junior is depleted
 *
 *      YIELD DISTRIBUTION:
 *      Yield is split by weighted share:
 *        seniorWeight = seniorAssets * 1x
 *        juniorWeight = juniorAssets * 2x
 *        each tranche gets: totalYield * (weight / totalWeight)
 *
 *      ARCHITECTURE:
 *      ┌─────────────────────────────────────────────────────────┐
 *      │                     AionVault                           │
 *      │                                                         │
 *      │  totalPool = totalIdle + totalDebt                      │
 *      │           = senior + junior + accruedFees               │
 *      │                                                         │
 *      │  ┌───────────────┐  ┌───────────────┐  ┌──────────┐   │
 *      │  │ Senior Tranche│  │ Junior Tranche│  │ Protocol │   │
 *      │  │ (Low Risk)    │  │ (High Risk)   │  │ Fees     │   │
 *      │  │ 1x yield      │  │ 2x yield      │  │          │   │
 *      │  │ Last loss     │  │ First loss    │  │          │   │
 *      │  └───────────────┘  └───────────────┘  └──────────┘   │
 *      │                                                         │
 *      │  ┌──────────┐   ┌──────────────────────────┐           │
 *      │  │ Idle      │   │ Strategy Debt             │           │
 *      │  │ Reserve   │   │  ├ Strategy A: $2M        │           │
 *      │  │ (buffer%) │   │  ├ Strategy B: $1M        │           │
 *      │  └──────────┘   │  └ Strategy C: $500k      │           │
 *      │                  └──────────────────────────┘           │
 *      └─────────────────────────────────────────────────────────┘
 */
contract AionVault is
    ERC4626Upgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    using Math for uint256;

    // ============================================================
    //                        ENUMS
    // ============================================================

    enum VaultType {
        STABLE,     // Stablecoins (USDC, USDT, DAI) — conservative defaults
        VOLATILE    // Volatile assets (ETH, AVAX, BTC) — aggressive defaults
    }

    // ============================================================
    //                        CONSTANTS
    // ============================================================

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_PERFORMANCE_FEE = 5_000;  // 50%
    uint256 public constant MAX_MANAGEMENT_FEE = 500;     // 5%
    uint256 public constant MAX_STRATEGIES = 20;
    uint256 public constant SECONDS_PER_YEAR = 31_556_952; // 365.2425 days
    uint8 public constant MIN_ASSET_DECIMALS = 6;
    uint8 public constant MAX_ASSET_DECIMALS = 18;

    uint8 public constant SENIOR_TRANCHE = 0;
    uint8 public constant JUNIOR_TRANCHE = 1;
    uint256 public constant YIELD_PRECISION = 1e18;

    // ============================================================
    //                        STRUCTS
    // ============================================================

    struct StrategyParams {
        uint256 activation;     // Timestamp when strategy was added
        uint256 lastReport;     // Timestamp of last harvest report
        uint256 currentDebt;    // Amount of assets currently allocated
        uint256 maxDebt;        // Maximum debt the strategy can hold
        uint256 totalGain;      // Cumulative profit reported
        uint256 totalLoss;      // Cumulative loss reported
    }

    struct Tranche {
        uint256 totalAssets;      // Total asset value belonging to this tranche
        uint256 totalShares;      // Total shares issued for this tranche
        uint256 yieldMultiplier;  // Yield weight: 1e18 = 1x, 2e18 = 2x
    }

    // ============================================================
    //                        STORAGE
    // ============================================================

    /// @dev Strategy parameters indexed by strategy address
    mapping(address => StrategyParams) internal _strategies;

    /// @dev Ordered list of active strategies
    address[] public activeStrategies;

    /// @dev Total assets deployed across all strategies
    uint256 public totalDebt;

    /// @dev Total assets sitting idle in the vault (liquid reserve)
    uint256 public totalIdle;

    /// @dev Maximum total assets the vault will accept
    uint256 public depositLimit;

    /// @dev Minimum idle assets to keep in vault for instant withdrawals
    uint256 public minimumTotalIdle;

    /// @dev Performance fee in BPS (charged on strategy profits)
    uint256 public performanceFee;

    /// @dev Management fee in BPS (annual fee on total debt)
    uint256 public managementFee;

    /// @dev Address that receives protocol fees
    address public feeRecipient;

    /// @dev Whether deposits/allocations are paused
    bool public paused;

    /// @dev Role authorized to call processReport and updateDebt
    address public allocator;

    /// @dev Maximum allocation to any single strategy (BPS of totalAssets)
    uint256 public maxStrategyAllocationBps;

    /// @dev Withdrawal queue contract for deterministic strategy unwind order
    address public withdrawalQueue;

    /// @dev Maximum profit a strategy can report per harvest (BPS of currentDebt)
    uint256 public maxProfitPerHarvestBps;

    /// @dev Maximum loss a strategy can report per harvest (BPS of currentDebt)
    uint256 public maxLossPerHarvestBps;

    /// @dev Vault type: STABLE (0) or VOLATILE (1)
    VaultType public vaultType;

    // --- Tranche Storage ---

    /// @dev Tranche data: 0 = Senior, 1 = Junior
    mapping(uint8 => Tranche) public tranches;

    /// @dev User shares per tranche: user => trancheId => shares
    mapping(address => mapping(uint8 => uint256)) public userShares;

    /// @dev Liquidity buffer as BPS of totalAssets (kept idle for instant withdrawals)
    uint256 public liquidityBufferBps;

    /// @dev Protocol fees accrued but not yet claimed
    uint256 public accruedProtocolFees;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event StrategyAdded(address indexed strategy, uint256 maxDebt);
    event StrategyRemoved(address indexed strategy);
    event StrategyMaxDebtUpdated(address indexed strategy, uint256 oldMaxDebt, uint256 newMaxDebt);
    event DebtUpdated(address indexed strategy, uint256 oldDebt, uint256 newDebt);
    event StrategyReported(
        address indexed strategy,
        uint256 gain,
        uint256 loss,
        uint256 currentDebt,
        uint256 protocolFees,
        uint256 totalFees
    );
    event DepositLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event MinimumTotalIdleUpdated(uint256 oldIdle, uint256 newIdle);
    event VaultPaused(address indexed caller);
    event VaultUnpaused(address indexed caller);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event PerformanceFeeUpdated(uint256 oldFee, uint256 newFee);
    event ManagementFeeUpdated(uint256 oldFee, uint256 newFee);
    event AllocatorUpdated(address indexed oldAllocator, address indexed newAllocator);
    event WithdrawalQueueUpdated(address indexed queue);
    event EmergencyWithdrawalExecuted(address indexed strategy, uint256 recovered);
    event StrategyMigrated(address indexed oldStrategy, address indexed newStrategy, uint256 migratedDebt);

    // Tranche events
    event TrancheDeposit(address indexed user, uint8 indexed trancheId, uint256 assets, uint256 shares, address receiver);
    event TrancheWithdraw(address indexed user, uint8 indexed trancheId, uint256 assets, uint256 shares, address receiver);
    event YieldDistributed(uint256 totalYield, uint256 seniorYield, uint256 juniorYield);
    event LossAbsorbed(uint256 totalLoss, uint256 juniorLoss, uint256 seniorLoss);
    event ProtocolFeesClaimed(address indexed recipient, uint256 amount);
    event LiquidityBufferUpdated(uint256 oldBps, uint256 newBps);
    event IdleRebalanced(uint256 currentIdle, uint256 targetIdle);

    // ============================================================
    //                        ERRORS
    // ============================================================

    error VaultPausedError();
    error StrategyAlreadyActive();
    error StrategyNotActive();
    error TooManyStrategies();
    error DepositLimitExceeded();
    error InvalidFee();
    error ZeroAddress();
    error NotAllocator();
    error StrategyDebtExceedsMax();
    error MaxAllocationExceeded();
    error AssetMismatch();
    error VaultMismatch();
    error InvalidAssetDecimals();
    error HealthCheckFailed_MaxProfit();
    error HealthCheckFailed_MaxLoss();

    // Tranche errors
    error InvalidTranche();
    error InsufficientShares();
    error ZeroAmount();
    error UseTrancheDeposit();
    error UseTrancheWithdraw();

    // ============================================================
    //                       MODIFIERS
    // ============================================================

    modifier whenNotPaused() {
        if (paused) revert VaultPausedError();
        _;
    }

    modifier onlyAllocator() {
        if (msg.sender != allocator && msg.sender != owner()) revert NotAllocator();
        _;
    }

    modifier validTranche(uint8 trancheId) {
        if (trancheId > JUNIOR_TRANCHE) revert InvalidTranche();
        _;
    }

    // ============================================================
    //                     INITIALIZER
    // ============================================================

    /**
     * @notice Initialize the vault with tranche system.
     * @param asset_ The underlying ERC20 asset
     * @param name_ Vault share token name (e.g. "AION Stable Vault - USDC")
     * @param symbol_ Vault share token symbol (e.g. "aionUSDC")
     * @param feeRecipient_ Address to receive protocol fees
     * @param depositLimit_ Maximum total assets accepted
     * @param vaultType_ Vault type: STABLE (0) or VOLATILE (1)
     */
    function initialize(
        IERC20Upgradeable asset_,
        string memory name_,
        string memory symbol_,
        address feeRecipient_,
        uint256 depositLimit_,
        VaultType vaultType_
    ) external initializer {
        if (address(asset_) == address(0) || feeRecipient_ == address(0))
            revert ZeroAddress();

        uint8 assetDecimals = ERC20Upgradeable(address(asset_)).decimals();
        if (assetDecimals < MIN_ASSET_DECIMALS || assetDecimals > MAX_ASSET_DECIMALS)
            revert InvalidAssetDecimals();

        __ERC4626_init(asset_);
        __ERC20_init(name_, symbol_);
        __Ownable_init();
        __ReentrancyGuard_init();

        feeRecipient = feeRecipient_;
        depositLimit = depositLimit_;
        vaultType = vaultType_;

        // --- Tranche multipliers ---
        tranches[SENIOR_TRANCHE].yieldMultiplier = 1e18;  // 1x yield
        tranches[JUNIOR_TRANCHE].yieldMultiplier = 2e18;  // 2x yield

        // --- Type-specific defaults ---
        if (vaultType_ == VaultType.STABLE) {
            performanceFee = 1000;              // 10%
            managementFee = 200;                // 2% annual
            maxStrategyAllocationBps = 3000;    // 30% max per strategy
            maxProfitPerHarvestBps = 500;       // 5% max profit per harvest
            maxLossPerHarvestBps = 100;         // 1% max loss per harvest
            liquidityBufferBps = 1500;          // 15% idle buffer
        } else {
            performanceFee = 2000;              // 20%
            managementFee = 200;                // 2% annual
            maxStrategyAllocationBps = 5000;    // 50% max per strategy
            maxProfitPerHarvestBps = 3000;      // 30% max profit per harvest
            maxLossPerHarvestBps = 1000;        // 10% max loss per harvest
            liquidityBufferBps = 1000;          // 10% idle buffer
        }
    }

    // ============================================================
    //           ERC4626 OVERRIDES (Disabled — Use Tranches)
    // ============================================================

    /**
     * @notice Total assets managed by the vault = idle + deployed across strategies.
     */
    function totalAssets() public view override returns (uint256) {
        return totalIdle + totalDebt;
    }

    /**
     * @notice Maximum deposit capacity remaining.
     */
    function maxDeposit(address) public view override returns (uint256) {
        if (paused) return 0;
        uint256 total = totalAssets();
        if (total >= depositLimit) return 0;
        return depositLimit - total;
    }

    /**
     * @dev Standard ERC4626 deposit is disabled. Use depositTranche() instead.
     */
    function deposit(uint256, address) public pure override returns (uint256) {
        revert UseTrancheDeposit();
    }

    /**
     * @dev Standard ERC4626 mint is disabled. Use depositTranche() instead.
     */
    function mint(uint256, address) public pure override returns (uint256) {
        revert UseTrancheDeposit();
    }

    /**
     * @dev Standard ERC4626 withdraw is disabled. Use withdrawTranche() instead.
     */
    function withdraw(uint256, address, address) public pure override returns (uint256) {
        revert UseTrancheWithdraw();
    }

    /**
     * @dev Standard ERC4626 redeem is disabled. Use withdrawTranche() instead.
     */
    function redeem(uint256, address, address) public pure override returns (uint256) {
        revert UseTrancheWithdraw();
    }

    // ============================================================
    //                  TRANCHE DEPOSIT / WITHDRAW
    // ============================================================

    /**
     * @notice Deposit assets into a specific tranche.
     * @param assets Amount of underlying tokens to deposit
     * @param trancheId 0 = Senior (low risk), 1 = Junior (high risk)
     * @param receiver Address that receives the tranche shares
     * @return shares The number of tranche shares minted
     */
    function depositTranche(
        uint256 assets,
        uint8 trancheId,
        address receiver
    ) external whenNotPaused nonReentrant validTranche(trancheId) returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        uint256 newTotal = totalAssets() + assets;
        if (newTotal > depositLimit) revert DepositLimitExceeded();

        Tranche storage tranche = tranches[trancheId];

        // Calculate shares (1:1 on first deposit, proportional after)
        if (tranche.totalShares == 0 || tranche.totalAssets == 0) {
            shares = assets;
        } else {
            shares = (assets * tranche.totalShares) / tranche.totalAssets;
        }

        // Transfer assets into vault
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);

        // Update tranche accounting
        tranche.totalAssets += assets;
        tranche.totalShares += shares;
        userShares[receiver][trancheId] += shares;

        // Update vault-level accounting
        totalIdle += assets;

        emit TrancheDeposit(msg.sender, trancheId, assets, shares, receiver);
    }

    /**
     * @notice Withdraw assets from a specific tranche.
     * @dev Withdrawals are always allowed, even when paused (emergency exit).
     * @param assets Amount of underlying tokens to withdraw
     * @param trancheId 0 = Senior, 1 = Junior
     * @param receiver Address that receives the underlying tokens
     * @return shares The number of tranche shares burned
     */
    function withdrawTranche(
        uint256 assets,
        uint8 trancheId,
        address receiver
    ) external nonReentrant validTranche(trancheId) returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();
        if (receiver == address(0)) revert ZeroAddress();

        Tranche storage tranche = tranches[trancheId];

        // Calculate shares to burn
        shares = (assets * tranche.totalShares) / tranche.totalAssets;
        if (userShares[msg.sender][trancheId] < shares) revert InsufficientShares();

        // Pull from strategies if idle is insufficient
        if (assets > totalIdle) {
            uint256 deficit = assets - totalIdle;
            _withdrawFromStrategies(deficit);
        }

        // Update tranche accounting
        tranche.totalAssets -= assets;
        tranche.totalShares -= shares;
        userShares[msg.sender][trancheId] -= shares;

        // Update vault-level accounting
        totalIdle -= assets;

        // Transfer to receiver
        IERC20(asset()).safeTransfer(receiver, assets);

        emit TrancheWithdraw(msg.sender, trancheId, assets, shares, receiver);
    }

    // ============================================================
    //                  STRATEGY MANAGEMENT
    // ============================================================

    /**
     * @notice Add a new strategy to the vault.
     * @param strategy Address of the IStrategy contract
     * @param maxDebt Maximum assets this strategy can hold
     */
    function addStrategy(address strategy, uint256 maxDebt) external onlyOwner {
        if (strategy == address(0)) revert ZeroAddress();
        if (_strategies[strategy].activation != 0) revert StrategyAlreadyActive();
        if (activeStrategies.length >= MAX_STRATEGIES) revert TooManyStrategies();
        if (IStrategy(strategy).asset() != asset()) revert AssetMismatch();
        if (IStrategy(strategy).vault() != address(this)) revert VaultMismatch();

        _strategies[strategy] = StrategyParams({
            activation: block.timestamp,
            lastReport: block.timestamp,
            currentDebt: 0,
            maxDebt: maxDebt,
            totalGain: 0,
            totalLoss: 0
        });

        activeStrategies.push(strategy);
        emit StrategyAdded(strategy, maxDebt);
    }

    /**
     * @notice Remove a strategy from the vault. Strategy must have zero debt.
     * @param strategy Address of the strategy to remove
     */
    function revokeStrategy(address strategy) external onlyOwner {
        StrategyParams storage params = _strategies[strategy];
        if (params.activation == 0) revert StrategyNotActive();
        require(params.currentDebt == 0, "Strategy still has debt");

        uint256 len = activeStrategies.length;
        for (uint256 i = 0; i < len; i++) {
            if (activeStrategies[i] == strategy) {
                activeStrategies[i] = activeStrategies[len - 1];
                activeStrategies.pop();
                break;
            }
        }

        delete _strategies[strategy];
        emit StrategyRemoved(strategy);
    }

    /**
     * @notice Update the maximum debt a strategy can hold.
     */
    function updateMaxDebt(address strategy, uint256 newMaxDebt) external onlyOwner {
        StrategyParams storage params = _strategies[strategy];
        if (params.activation == 0) revert StrategyNotActive();

        uint256 oldMaxDebt = params.maxDebt;
        params.maxDebt = newMaxDebt;
        emit StrategyMaxDebtUpdated(strategy, oldMaxDebt, newMaxDebt);
    }

    // ============================================================
    //               DEBT MANAGEMENT (ALLOCATOR)
    // ============================================================

    /**
     * @notice Update the debt of a strategy — deploy or pull capital.
     * @dev Called by the allocator (AI engine / AutonomousAllocator) or owner.
     *      Respects both minimumTotalIdle and liquidityBufferBps.
     */
    function updateDebt(address strategy, uint256 targetDebt) external onlyAllocator whenNotPaused nonReentrant {
        StrategyParams storage params = _strategies[strategy];
        if (params.activation == 0) revert StrategyNotActive();

        uint256 currentDebt = params.currentDebt;
        if (targetDebt == currentDebt) return;

        if (targetDebt > currentDebt) {
            // --- Increase debt: send assets to strategy ---
            if (targetDebt > params.maxDebt) revert StrategyDebtExceedsMax();

            // Enforce per-strategy allocation cap
            uint256 total = totalAssets();
            if (total > 0 && (targetDebt * BPS) / total > maxStrategyAllocationBps) {
                revert MaxAllocationExceeded();
            }

            uint256 increase = targetDebt - currentDebt;

            // Respect both fixed minimum idle and percentage-based liquidity buffer
            uint256 bufferRequired = (totalAssets() * liquidityBufferBps) / BPS;
            uint256 minIdle = bufferRequired > minimumTotalIdle ? bufferRequired : minimumTotalIdle;

            uint256 availableForDeployment = totalIdle > minIdle
                ? totalIdle - minIdle
                : 0;
            if (increase > availableForDeployment) {
                increase = availableForDeployment;
                targetDebt = currentDebt + increase;
            }
            if (increase == 0) return;

            totalIdle -= increase;
            totalDebt += increase;
            params.currentDebt = targetDebt;

            IERC20(asset()).safeTransfer(strategy, increase);
            IStrategy(strategy).deposit(increase);
        } else {
            // --- Decrease debt: pull assets from strategy ---
            uint256 decrease = currentDebt - targetDebt;

            uint256 withdrawn = IStrategy(strategy).withdraw(decrease);

            totalIdle += withdrawn;
            totalDebt -= Math.min(withdrawn, totalDebt);
            params.currentDebt = currentDebt - Math.min(withdrawn, currentDebt);
        }

        emit DebtUpdated(strategy, currentDebt, params.currentDebt);
    }

    // ============================================================
    //                HARVEST / REPORTING
    // ============================================================

    /**
     * @notice Process a strategy's report — harvest gains/losses and assess fees.
     * @dev Yield is distributed across tranches by weighted multiplier.
     *      Losses follow waterfall: Junior absorbs first, then Senior.
     *      Fees are accrued (not minted as shares) for later claiming.
     */
    function processReport(address strategy) external onlyAllocator nonReentrant returns (uint256 gain, uint256 loss) {
        StrategyParams storage params = _strategies[strategy];
        if (params.activation == 0) revert StrategyNotActive();

        // 1. Get strategy's current total assets
        uint256 strategyAssets = IStrategy(strategy).totalAssets();
        uint256 currentDebt = params.currentDebt;

        // 2. Calculate gain or loss
        if (strategyAssets > currentDebt) {
            gain = strategyAssets - currentDebt;
        } else if (strategyAssets < currentDebt) {
            loss = currentDebt - strategyAssets;
        }

        // 3. Health check: reject reports with suspicious profit/loss
        if (maxProfitPerHarvestBps > 0 && gain > 0 && currentDebt > 0) {
            if ((gain * BPS) / currentDebt > maxProfitPerHarvestBps) {
                revert HealthCheckFailed_MaxProfit();
            }
        }
        if (maxLossPerHarvestBps > 0 && loss > 0 && currentDebt > 0) {
            if ((loss * BPS) / currentDebt > maxLossPerHarvestBps) {
                revert HealthCheckFailed_MaxLoss();
            }
        }

        // 4. Process gain or loss
        uint256 totalFees = 0;
        if (gain > 0) {
            // Performance fee on profit
            uint256 perfFee = (gain * performanceFee) / BPS;

            // Management fee: annual rate prorated by time since last report
            uint256 duration = block.timestamp - params.lastReport;
            uint256 mgmtFee = (currentDebt * managementFee * duration) / (BPS * SECONDS_PER_YEAR);

            totalFees = perfFee + mgmtFee;

            // Cap fees at the gain amount
            if (totalFees > gain) {
                totalFees = gain;
            }

            // Accrue fees for later claiming
            accruedProtocolFees += totalFees;

            // Distribute net yield across tranches (weighted by multiplier)
            uint256 netGain = gain - totalFees;
            _distributeYield(netGain);

            // Update strategy debt (full gain stays in strategy)
            totalDebt += gain;
            params.currentDebt = currentDebt + gain;
            params.totalGain += gain;
        } else if (loss > 0) {
            // Absorb loss: Junior first, then Senior (waterfall)
            _absorbLoss(loss);

            // Update strategy debt
            totalDebt -= Math.min(loss, totalDebt);
            params.currentDebt = currentDebt - Math.min(loss, currentDebt);
            params.totalLoss += loss;
        }

        params.lastReport = block.timestamp;

        emit StrategyReported(
            strategy,
            gain,
            loss,
            params.currentDebt,
            totalFees,
            totalFees
        );
    }

    // ============================================================
    //          INTERNAL: YIELD & LOSS DISTRIBUTION
    // ============================================================

    /**
     * @dev Distribute yield across tranches weighted by yieldMultiplier.
     *      Junior gets boosted yield (2x weight), Senior gets base (1x weight).
     */
    function _distributeYield(uint256 totalYield) internal {
        if (totalYield == 0) return;

        uint256 seniorAssets = tranches[SENIOR_TRANCHE].totalAssets;
        uint256 juniorAssets = tranches[JUNIOR_TRANCHE].totalAssets;

        uint256 seniorWeight = seniorAssets * tranches[SENIOR_TRANCHE].yieldMultiplier;
        uint256 juniorWeight = juniorAssets * tranches[JUNIOR_TRANCHE].yieldMultiplier;
        uint256 totalWeight = seniorWeight + juniorWeight;

        if (totalWeight == 0) return;

        uint256 seniorYield = (totalYield * seniorWeight) / totalWeight;
        uint256 juniorYield = totalYield - seniorYield; // Remainder to junior (avoids rounding dust)

        tranches[SENIOR_TRANCHE].totalAssets += seniorYield;
        tranches[JUNIOR_TRANCHE].totalAssets += juniorYield;

        emit YieldDistributed(totalYield, seniorYield, juniorYield);
    }

    /**
     * @dev Absorb loss via waterfall: Junior first, then Senior.
     */
    function _absorbLoss(uint256 lossAmount) internal {
        if (lossAmount == 0) return;

        uint256 juniorAssets = tranches[JUNIOR_TRANCHE].totalAssets;

        if (juniorAssets >= lossAmount) {
            // Junior absorbs everything
            tranches[JUNIOR_TRANCHE].totalAssets -= lossAmount;
            emit LossAbsorbed(lossAmount, lossAmount, 0);
        } else {
            // Junior wiped, remainder hits Senior
            uint256 seniorLoss = lossAmount - juniorAssets;
            tranches[JUNIOR_TRANCHE].totalAssets = 0;
            tranches[SENIOR_TRANCHE].totalAssets -= seniorLoss;
            emit LossAbsorbed(lossAmount, juniorAssets, seniorLoss);
        }
    }

    // ============================================================
    //          INTERNAL: WITHDRAW FROM STRATEGIES
    // ============================================================

    /**
     * @dev Pull assets from strategies to cover a withdrawal deficit.
     *      Uses WithdrawalQueue for deterministic ordering if configured,
     *      otherwise falls back to iterating activeStrategies.
     */
    function _withdrawFromStrategies(uint256 deficit) internal {
        uint256 remaining = deficit;

        if (withdrawalQueue != address(0)) {
            address[] memory queue = IWithdrawalQueue(withdrawalQueue).getQueue(address(this));
            for (uint256 i = 0; i < queue.length && remaining > 0; i++) {
                remaining = _withdrawFromStrategy(queue[i], remaining);
            }
        }

        // Fallback: iterate active strategies for any remaining deficit
        for (uint256 i = 0; i < activeStrategies.length && remaining > 0; i++) {
            remaining = _withdrawFromStrategy(activeStrategies[i], remaining);
        }
    }

    /**
     * @dev Withdraw from a single strategy. Returns remaining deficit.
     */
    function _withdrawFromStrategy(address strategy, uint256 remaining) internal returns (uint256) {
        StrategyParams storage params = _strategies[strategy];
        if (params.currentDebt == 0 || params.activation == 0) return remaining;

        uint256 toWithdraw = Math.min(remaining, params.currentDebt);
        uint256 actualWithdrawn = IStrategy(strategy).withdraw(toWithdraw);

        params.currentDebt -= Math.min(actualWithdrawn, params.currentDebt);
        totalDebt -= Math.min(actualWithdrawn, totalDebt);
        totalIdle += actualWithdrawn;
        return remaining - Math.min(actualWithdrawn, remaining);
    }

    // ============================================================
    //                  PROTOCOL FEE CLAIMING
    // ============================================================

    /**
     * @notice Claim accrued protocol fees.
     * @dev Pulls from idle balance (may unwind strategies if needed).
     */
    function claimFees() external nonReentrant {
        require(msg.sender == feeRecipient, "Not fee recipient");

        uint256 fees = accruedProtocolFees;
        if (fees == 0) return;

        // Pull from strategies if idle is insufficient
        if (fees > totalIdle) {
            _withdrawFromStrategies(fees - totalIdle);
        }

        accruedProtocolFees = 0;
        totalIdle -= fees;

        IERC20(asset()).safeTransfer(feeRecipient, fees);

        emit ProtocolFeesClaimed(feeRecipient, fees);
    }

    // ============================================================
    //                    ADMIN FUNCTIONS
    // ============================================================

    function setDepositLimit(uint256 newLimit) external onlyOwner {
        uint256 old = depositLimit;
        depositLimit = newLimit;
        emit DepositLimitUpdated(old, newLimit);
    }

    function setMinimumTotalIdle(uint256 newMinIdle) external onlyOwner {
        uint256 old = minimumTotalIdle;
        minimumTotalIdle = newMinIdle;
        emit MinimumTotalIdleUpdated(old, newMinIdle);
    }

    function setPerformanceFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_PERFORMANCE_FEE) revert InvalidFee();
        uint256 old = performanceFee;
        performanceFee = newFee;
        emit PerformanceFeeUpdated(old, newFee);
    }

    function setManagementFee(uint256 newFee) external onlyOwner {
        if (newFee > MAX_MANAGEMENT_FEE) revert InvalidFee();
        uint256 old = managementFee;
        managementFee = newFee;
        emit ManagementFeeUpdated(old, newFee);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        address old = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(old, newRecipient);
    }

    function setAllocator(address newAllocator) external onlyOwner {
        address old = allocator;
        allocator = newAllocator;
        emit AllocatorUpdated(old, newAllocator);
    }

    function setMaxStrategyAllocationBps(uint256 newBps) external onlyOwner {
        require(newBps <= BPS, "Invalid bps");
        maxStrategyAllocationBps = newBps;
    }

    function setWithdrawalQueue(address queue_) external onlyOwner {
        withdrawalQueue = queue_;
        emit WithdrawalQueueUpdated(queue_);
    }

    function setMaxProfitPerHarvestBps(uint256 bps) external onlyOwner {
        require(bps <= BPS, "Invalid bps");
        maxProfitPerHarvestBps = bps;
    }

    function setMaxLossPerHarvestBps(uint256 bps) external onlyOwner {
        require(bps <= BPS, "Invalid bps");
        maxLossPerHarvestBps = bps;
    }

    function setLiquidityBufferBps(uint256 newBps) external onlyOwner {
        require(newBps <= BPS, "Invalid bps");
        uint256 old = liquidityBufferBps;
        liquidityBufferBps = newBps;
        emit LiquidityBufferUpdated(old, newBps);
    }

    function setTrancheYieldMultiplier(uint8 trancheId, uint256 multiplier) external onlyOwner validTranche(trancheId) {
        require(multiplier > 0, "Multiplier must be > 0");
        tranches[trancheId].yieldMultiplier = multiplier;
    }

    // ============================================================
    //          EMERGENCY & MIGRATION (Owner only)
    // ============================================================

    /**
     * @notice Emergency withdraw all funds from a strategy.
     * @dev Calls strategy.emergencyWithdraw() which pulls everything
     *      and deactivates the strategy. Use when a strategy is compromised.
     */
    function emergencyWithdrawStrategy(address strategy) external onlyOwner nonReentrant {
        StrategyParams storage params = _strategies[strategy];
        if (params.activation == 0) revert StrategyNotActive();

        uint256 recovered = IStrategy(strategy).emergencyWithdraw();

        uint256 debtReduction = Math.min(params.currentDebt, totalDebt);
        totalDebt -= debtReduction;
        params.currentDebt = 0;
        totalIdle += recovered;

        emit EmergencyWithdrawalExecuted(strategy, recovered);
    }

    /**
     * @notice Migrate capital from one strategy to another.
     * @dev Withdraws all from old strategy and deploys to new strategy.
     *      New strategy must already be added to the vault.
     */
    function migrateStrategy(address oldStrategy, address newStrategy) external onlyOwner nonReentrant {
        StrategyParams storage oldParams = _strategies[oldStrategy];
        StrategyParams storage newParams = _strategies[newStrategy];

        if (oldParams.activation == 0) revert StrategyNotActive();
        if (newParams.activation == 0) revert StrategyNotActive();

        uint256 debtToMigrate = oldParams.currentDebt;
        if (debtToMigrate == 0) return;

        // Step 1: Pull everything from old strategy
        uint256 withdrawn = IStrategy(oldStrategy).withdraw(debtToMigrate);
        oldParams.currentDebt -= Math.min(withdrawn, oldParams.currentDebt);
        totalDebt -= Math.min(withdrawn, totalDebt);
        totalIdle += withdrawn;

        // Step 2: Deploy to new strategy
        require(withdrawn + newParams.currentDebt <= newParams.maxDebt, "Exceeds new strategy maxDebt");

        totalIdle -= withdrawn;
        totalDebt += withdrawn;
        newParams.currentDebt += withdrawn;

        IERC20(asset()).safeTransfer(newStrategy, withdrawn);
        IStrategy(newStrategy).deposit(withdrawn);

        emit StrategyMigrated(oldStrategy, newStrategy, withdrawn);
    }

    function pause() external onlyOwner {
        paused = true;
        emit VaultPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit VaultUnpaused(msg.sender);
    }

    // ============================================================
    //      PROACTIVE LIQUIDITY (Fix 1.3: Withdrawal Shock)
    // ============================================================

    /**
     * @notice Proactively pull funds from strategies to restore idle buffer.
     * @dev Called by allocator or owner when idle balance drops below the
     *      liquidity buffer. Prevents forced strategy unwinds during withdrawals.
     */
    function rebalanceIdle() external onlyAllocator nonReentrant {
        uint256 targetIdle = (totalAssets() * liquidityBufferBps) / BPS;
        if (targetIdle < minimumTotalIdle) targetIdle = minimumTotalIdle;

        if (totalIdle >= targetIdle) return; // Already sufficient

        uint256 deficit = targetIdle - totalIdle;
        _withdrawFromStrategies(deficit);

        emit IdleRebalanced(totalIdle, targetIdle);
    }

    // ============================================================
    //                    VIEW FUNCTIONS
    // ============================================================

    function strategies(address strategy) external view returns (StrategyParams memory) {
        return _strategies[strategy];
    }

    function getActiveStrategies() external view returns (address[] memory) {
        return activeStrategies;
    }

    function getStrategyDebt(address strategy) external view returns (uint256) {
        return _strategies[strategy].currentDebt;
    }

    // --- Tranche Views ---

    /**
     * @notice Get tranche data.
     */
    function getTranche(uint8 trancheId) external view validTranche(trancheId) returns (Tranche memory) {
        return tranches[trancheId];
    }

    /**
     * @notice Get a user's shares in a specific tranche.
     */
    function getUserShares(address user, uint8 trancheId) external view validTranche(trancheId) returns (uint256) {
        return userShares[user][trancheId];
    }

    /**
     * @notice Convert tranche shares to underlying assets.
     */
    function convertToAssetsTranche(
        uint256 shares,
        uint8 trancheId
    ) external view validTranche(trancheId) returns (uint256) {
        Tranche memory tranche = tranches[trancheId];
        if (tranche.totalShares == 0) return shares;
        return (shares * tranche.totalAssets) / tranche.totalShares;
    }

    /**
     * @notice Convert underlying assets to tranche shares.
     */
    function convertToSharesTranche(
        uint256 assets,
        uint8 trancheId
    ) external view validTranche(trancheId) returns (uint256) {
        Tranche memory tranche = tranches[trancheId];
        if (tranche.totalShares == 0 || tranche.totalAssets == 0) return assets;
        return (assets * tranche.totalShares) / tranche.totalAssets;
    }

    /**
     * @notice Get the current "price per share" for a tranche.
     * @return pricePerShare Scaled to 1e18 precision
     */
    function tranchePricePerShare(uint8 trancheId) external view validTranche(trancheId) returns (uint256) {
        Tranche memory tranche = tranches[trancheId];
        if (tranche.totalShares == 0) return 1e18;
        return (tranche.totalAssets * 1e18) / tranche.totalShares;
    }

    /**
     * @notice Get a user's asset value across both tranches.
     */
    function getUserTotalValue(address user) external view returns (uint256 seniorValue, uint256 juniorValue, uint256 total) {
        Tranche memory senior = tranches[SENIOR_TRANCHE];
        Tranche memory junior = tranches[JUNIOR_TRANCHE];

        uint256 seniorShares = userShares[user][SENIOR_TRANCHE];
        uint256 juniorShares = userShares[user][JUNIOR_TRANCHE];

        seniorValue = senior.totalShares > 0
            ? (seniorShares * senior.totalAssets) / senior.totalShares
            : seniorShares;

        juniorValue = junior.totalShares > 0
            ? (juniorShares * junior.totalAssets) / junior.totalShares
            : juniorShares;

        total = seniorValue + juniorValue;
    }

    // --- Realtime Views (Fix 1.2: Unrealized Yield Drift) ---

    /**
     * @notice Query all strategies for their LIVE totalAssets to get true vault value.
     * @dev Unlike totalAssets() which uses recorded debt, this calls each strategy
     *      to get the actual current value including unrealized yield/loss.
     *      More expensive (external calls) but always accurate.
     */
    function getRealtimeTotalAssets() external view returns (uint256 realTotal) {
        realTotal = totalIdle;
        for (uint256 i = 0; i < activeStrategies.length; i++) {
            try IStrategy(activeStrategies[i]).totalAssets() returns (uint256 stratAssets) {
                realTotal += stratAssets;
            } catch {
                // Fallback to recorded debt if strategy call fails
                realTotal += _strategies[activeStrategies[i]].currentDebt;
            }
        }
    }

    /**
     * @notice Get unrealized gain/loss across all strategies.
     * @return totalUnrealizedGain Sum of unrealized profits
     * @return totalUnrealizedLoss Sum of unrealized losses
     */
    function getUnrealizedPnL() external view returns (uint256 totalUnrealizedGain, uint256 totalUnrealizedLoss) {
        for (uint256 i = 0; i < activeStrategies.length; i++) {
            address strategy = activeStrategies[i];
            uint256 currentDebt = _strategies[strategy].currentDebt;
            if (currentDebt == 0) continue;

            try IStrategy(strategy).totalAssets() returns (uint256 stratAssets) {
                if (stratAssets > currentDebt) {
                    totalUnrealizedGain += stratAssets - currentDebt;
                } else if (stratAssets < currentDebt) {
                    totalUnrealizedLoss += currentDebt - stratAssets;
                }
            } catch {
                // Skip strategies that fail to report
            }
        }
    }

    /**
     * @notice Realtime tranche price-per-share accounting for unrealized yield.
     * @dev Simulates what the tranche PPS would be if all strategies were harvested now.
     *      Accounts for: unrealized gains, fee deductions, yield distribution, loss waterfall.
     */
    function getRealtimeTranchePrice(uint8 trancheId) external view validTranche(trancheId) returns (uint256) {
        Tranche memory tranche = tranches[trancheId];
        if (tranche.totalShares == 0) return 1e18;

        // Calculate net unrealized PnL across all strategies
        int256 netPnL = 0;
        for (uint256 i = 0; i < activeStrategies.length; i++) {
            address strategy = activeStrategies[i];
            uint256 currentDebt = _strategies[strategy].currentDebt;
            if (currentDebt == 0) continue;

            try IStrategy(strategy).totalAssets() returns (uint256 stratAssets) {
                netPnL += int256(stratAssets) - int256(currentDebt);
            } catch {}
        }

        if (netPnL == 0) {
            return (tranche.totalAssets * 1e18) / tranche.totalShares;
        }

        // Simulate yield distribution or loss absorption
        uint256 seniorAssets = tranches[SENIOR_TRANCHE].totalAssets;
        uint256 juniorAssets = tranches[JUNIOR_TRANCHE].totalAssets;

        if (netPnL > 0) {
            // Simulate fee deduction
            uint256 gain = uint256(netPnL);
            uint256 estimatedFees = (gain * performanceFee) / BPS;
            uint256 netGain = gain > estimatedFees ? gain - estimatedFees : 0;

            // Simulate yield distribution
            uint256 seniorWeight = seniorAssets * tranches[SENIOR_TRANCHE].yieldMultiplier;
            uint256 juniorWeight = juniorAssets * tranches[JUNIOR_TRANCHE].yieldMultiplier;
            uint256 totalWeight = seniorWeight + juniorWeight;

            if (totalWeight > 0) {
                if (trancheId == SENIOR_TRANCHE) {
                    uint256 seniorYield = (netGain * seniorWeight) / totalWeight;
                    seniorAssets += seniorYield;
                } else {
                    uint256 seniorYield = (netGain * seniorWeight) / totalWeight;
                    juniorAssets += (netGain - seniorYield);
                }
            }
        } else {
            // Simulate loss waterfall
            uint256 loss = uint256(-netPnL);
            if (juniorAssets >= loss) {
                juniorAssets -= loss;
            } else {
                uint256 seniorLoss = loss - juniorAssets;
                juniorAssets = 0;
                seniorAssets -= Math.min(seniorLoss, seniorAssets);
            }
        }

        uint256 adjustedAssets = trancheId == SENIOR_TRANCHE ? seniorAssets : juniorAssets;
        return (adjustedAssets * 1e18) / tranche.totalShares;
    }

    // --- Harvest Preview (Fix 1.6: Tranche Awareness) ---

    /**
     * @notice Preview what would happen if a strategy is harvested now.
     * @dev Shows gain/loss, fees, and how each tranche would be affected.
     *      Useful for AI/keeper to decide if a harvest is beneficial.
     */
    function previewHarvest(address strategy) external view returns (
        uint256 gain,
        uint256 loss,
        uint256 estimatedFees,
        uint256 seniorImpact,
        uint256 juniorImpact,
        bool seniorLossExposure
    ) {
        StrategyParams memory params = _strategies[strategy];
        if (params.activation == 0 || params.currentDebt == 0) return (0, 0, 0, 0, 0, false);

        try IStrategy(strategy).totalAssets() returns (uint256 stratAssets) {
            uint256 currentDebt = params.currentDebt;

            if (stratAssets > currentDebt) {
                gain = stratAssets - currentDebt;

                // Estimate fees
                uint256 perfFee = (gain * performanceFee) / BPS;
                uint256 duration = block.timestamp - params.lastReport;
                uint256 mgmtFee = (currentDebt * managementFee * duration) / (BPS * SECONDS_PER_YEAR);
                estimatedFees = perfFee + mgmtFee;
                if (estimatedFees > gain) estimatedFees = gain;

                uint256 netGain = gain - estimatedFees;

                // Simulate yield distribution
                uint256 seniorWeight = tranches[SENIOR_TRANCHE].totalAssets * tranches[SENIOR_TRANCHE].yieldMultiplier;
                uint256 juniorWeight = tranches[JUNIOR_TRANCHE].totalAssets * tranches[JUNIOR_TRANCHE].yieldMultiplier;
                uint256 totalWeight = seniorWeight + juniorWeight;

                if (totalWeight > 0) {
                    seniorImpact = (netGain * seniorWeight) / totalWeight;
                    juniorImpact = netGain - seniorImpact;
                }
            } else if (stratAssets < currentDebt) {
                loss = currentDebt - stratAssets;

                // Simulate loss waterfall
                uint256 juniorAssets = tranches[JUNIOR_TRANCHE].totalAssets;
                if (juniorAssets >= loss) {
                    juniorImpact = loss;
                    seniorLossExposure = false;
                } else {
                    juniorImpact = juniorAssets;
                    seniorImpact = loss - juniorAssets;
                    seniorLossExposure = true;
                }
            }
        } catch {}
    }

    // --- Pending Fee Preview (Fix 3.3: Fee Realization Delay) ---

    /**
     * @notice Calculate fees that would be charged if a strategy is harvested now.
     * @dev Useful for fee recipients to estimate pending revenue without waiting for harvest.
     */
    function getPendingFees(address strategy) external view returns (uint256 pendingPerfFee, uint256 pendingMgmtFee, uint256 totalPending) {
        StrategyParams memory params = _strategies[strategy];
        if (params.activation == 0 || params.currentDebt == 0) return (0, 0, 0);

        try IStrategy(strategy).totalAssets() returns (uint256 stratAssets) {
            if (stratAssets > params.currentDebt) {
                uint256 gain = stratAssets - params.currentDebt;
                pendingPerfFee = (gain * performanceFee) / BPS;

                uint256 duration = block.timestamp - params.lastReport;
                pendingMgmtFee = (params.currentDebt * managementFee * duration) / (BPS * SECONDS_PER_YEAR);

                totalPending = pendingPerfFee + pendingMgmtFee;
                if (totalPending > gain) totalPending = gain;
            }
        } catch {}
    }

    /**
     * @notice Total pending fees across all strategies.
     */
    function getTotalPendingFees() external view returns (uint256 total) {
        total = accruedProtocolFees; // Already accrued but unclaimed

        for (uint256 i = 0; i < activeStrategies.length; i++) {
            address strategy = activeStrategies[i];
            StrategyParams memory params = _strategies[strategy];
            if (params.currentDebt == 0) continue;

            try IStrategy(strategy).totalAssets() returns (uint256 stratAssets) {
                if (stratAssets > params.currentDebt) {
                    uint256 gain = stratAssets - params.currentDebt;
                    uint256 perfFee = (gain * performanceFee) / BPS;
                    uint256 duration = block.timestamp - params.lastReport;
                    uint256 mgmtFee = (params.currentDebt * managementFee * duration) / (BPS * SECONDS_PER_YEAR);
                    uint256 fees = perfFee + mgmtFee;
                    if (fees > gain) fees = gain;
                    total += fees;
                }
            } catch {}
        }
    }

    // --- Realtime Withdrawal Preview (Fix 3.4: Withdrawal Fairness) ---

    /**
     * @notice Preview withdrawal with realtime pricing (accounts for unrealized yield).
     * @dev Uses live strategy values instead of stale recorded debt.
     *      Frontend should show this to users so they see accurate exit value.
     */
    function previewWithdrawTranche(
        uint256 assets,
        uint8 trancheId
    ) external view validTranche(trancheId) returns (uint256 sharesNeeded, bool willPullFromStrategies) {
        Tranche memory tranche = tranches[trancheId];
        if (tranche.totalAssets == 0 || tranche.totalShares == 0) return (assets, false);

        sharesNeeded = (assets * tranche.totalShares) / tranche.totalAssets;
        willPullFromStrategies = assets > totalIdle;
    }

    /**
     * @notice Full vault summary including tranche breakdown.
     */
    function getVaultSummary()
        external
        view
        returns (
            uint256 totalAssets_,
            uint256 totalIdle_,
            uint256 totalDebt_,
            uint256 seniorTotalAssets,
            uint256 juniorTotalAssets,
            uint256 accruedFees,
            uint256 strategyCount,
            bool isPaused,
            VaultType vaultType_
        )
    {
        totalAssets_ = totalAssets();
        totalIdle_ = totalIdle;
        totalDebt_ = totalDebt;
        seniorTotalAssets = tranches[SENIOR_TRANCHE].totalAssets;
        juniorTotalAssets = tranches[JUNIOR_TRANCHE].totalAssets;
        accruedFees = accruedProtocolFees;
        strategyCount = activeStrategies.length;
        isPaused = paused;
        vaultType_ = vaultType;
    }
}

// ============================================================
//              INTERFACE FOR WITHDRAWAL QUEUE
// ============================================================

interface IWithdrawalQueue {
    function getQueue(address vault) external view returns (address[] memory);
}
