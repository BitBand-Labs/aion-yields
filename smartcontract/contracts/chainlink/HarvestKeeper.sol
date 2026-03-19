// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {AutomationCompatibleInterface} from "@chainlink/contracts/src/v0.8/automation/interfaces/AutomationCompatibleInterface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title HarvestKeeper
 * @author ChainNomads (AION Finance)
 * @notice Intelligent, Chainlink Automation-compatible keeper that triggers
 *         strategy harvests based on time, profitability, and risk awareness.
 *
 * @dev Backup to the primary AI/CRE harvest pipeline with these improvements
 *      over a naive time-based keeper:
 *
 *      PROFIT-AWARE:     Skips harvest if unrealized profit < minProfitThreshold
 *      RISK-AWARE:       Queries RiskManager before harvesting (skip flagged strategies)
 *      AI-COORDINATED:   Respects AI harvest blocks (AI can delay keeper)
 *      PER-STRATEGY:     Individual harvest delays, cooldowns, failure tracking
 *      INCENTIVIZED:     Anyone can call harvest — callers earn a bounty per success
 *      FAILURE-TRACKING: Counts consecutive failures, skips after maxRetries
 *      PAGINATED:        Cursor-based scanning to avoid gas limits at scale
 *      OBSERVABLE:       Rich events for monitoring harvest efficiency
 *
 *      HARVEST TRIGGER HIERARCHY:
 *      ┌─────────────────────────────────────────────────────┐
 *      │ Layer 1: AI/CRE (Primary — intelligent, strategic)  │
 *      │ Layer 2: HarvestKeeper (Backup — rule-based)        │
 *      │ Layer 3: Anyone via publicHarvest (Incentivized)     │
 *      └─────────────────────────────────────────────────────┘
 */
contract HarvestKeeper is AutomationCompatibleInterface, Ownable {
    using SafeERC20 for IERC20;

    // ============================================================
    //                        CONSTANTS
    // ============================================================

    uint256 public constant MAX_RETRIES = 5;

    // ============================================================
    //                        STRUCTS
    // ============================================================

    /// @dev Per-strategy configuration and state
    struct StrategyHarvestConfig {
        uint256 harvestDelay;       // Override delay (0 = use global default)
        uint256 lastKeeperHarvest;  // Last time this keeper harvested this strategy
        uint256 minCooldown;        // Min seconds between keeper harvests for this strategy
        uint256 failCount;          // Consecutive failure count
        bool harvestBlocked;        // AI can block keeper from harvesting
    }

    // ============================================================
    //                        STORAGE
    // ============================================================

    /// @dev Registered vaults to monitor
    address[] public vaults;

    /// @dev Quick lookup: is this address a registered vault?
    mapping(address => bool) public isRegisteredVault;

    /// @dev Per-strategy config: keccak256(vault, strategy) => config
    mapping(bytes32 => StrategyHarvestConfig) public strategyConfig;

    /// @dev Global default: seconds after lastReport before strategy is stale
    uint256 public defaultHarvestDelay;

    /// @dev Maximum strategies to harvest per performUpkeep call
    uint256 public maxHarvestsPerUpkeep;

    /// @dev Minimum time between performUpkeep calls (global rate limit)
    uint256 public minUpkeepInterval;

    /// @dev Timestamp of last performUpkeep execution
    uint256 public lastUpkeepTimestamp;

    /// @dev Minimum unrealized profit (in asset units) to justify a harvest
    uint256 public minProfitThreshold;

    /// @dev RiskManager address (optional — 0x0 disables risk checks)
    address public riskManager;

    /// @dev Registrar address — can register/remove vaults (e.g., VaultFactory)
    address public registrar;

    /// @dev Bounty token for harvest incentives (e.g., vault asset or protocol token)
    address public bountyToken;

    /// @dev Fixed bounty per successful harvest (in bountyToken units)
    uint256 public harvestBounty;

    /// @dev Pagination cursor: which vault index to start scanning from next
    uint256 public scanCursor;

    // --- Metrics ---

    /// @dev Total successful harvests executed by this keeper
    uint256 public totalSuccessfulHarvests;

    /// @dev Total failed harvest attempts
    uint256 public totalFailedHarvests;

    /// @dev Total profit harvested (cumulative across all strategies)
    uint256 public totalProfitHarvested;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event VaultRegistered(address indexed vault);
    event VaultRemoved(address indexed vault);

    event HarvestSuccess(
        address indexed vault,
        address indexed strategy,
        address indexed caller,
        uint256 gain,
        uint256 loss,
        uint256 timeSinceLastReport
    );
    event HarvestFailed(
        address indexed vault,
        address indexed strategy,
        uint256 failCount
    );
    event HarvestSkipped(
        address indexed vault,
        address indexed strategy,
        string reason
    );

    event UpkeepPerformed(uint256 processed, uint256 skipped, uint256 failed, uint256 timestamp);
    event BountyPaid(address indexed caller, uint256 amount);
    event StrategyBlocked(address indexed vault, address indexed strategy, bool blocked);
    event DefaultHarvestDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event RegistrarUpdated(address indexed oldRegistrar, address indexed newRegistrar);

    // ============================================================
    //                      CONSTRUCTOR
    // ============================================================

    /**
     * @param initialOwner Owner of this keeper contract
     * @param defaultHarvestDelay_ Default seconds before strategy is stale (e.g., 86400 = 24h)
     * @param maxHarvestsPerUpkeep_ Max harvests per call (e.g., 5)
     * @param minUpkeepInterval_ Min seconds between upkeep calls (e.g., 3600 = 1h)
     * @param minProfitThreshold_ Min unrealized profit to justify harvest (in asset units)
     */
    constructor(
        address initialOwner,
        uint256 defaultHarvestDelay_,
        uint256 maxHarvestsPerUpkeep_,
        uint256 minUpkeepInterval_,
        uint256 minProfitThreshold_
    ) Ownable(initialOwner) {
        defaultHarvestDelay = defaultHarvestDelay_;
        maxHarvestsPerUpkeep = maxHarvestsPerUpkeep_;
        minUpkeepInterval = minUpkeepInterval_;
        minProfitThreshold = minProfitThreshold_;
    }

    // ============================================================
    //            CHAINLINK AUTOMATION INTERFACE
    // ============================================================

    /**
     * @notice Called off-chain by Chainlink Automation to check if upkeep is needed.
     * @dev Uses pagination (scanCursor) to avoid scanning all vaults every time.
     *      checkData can encode a startIndex override for multi-upkeep setups.
     */
    function checkUpkeep(
        bytes calldata checkData
    ) external view override returns (bool upkeepNeeded, bytes memory performData) {
        if (block.timestamp < lastUpkeepTimestamp + minUpkeepInterval) {
            return (false, "");
        }

        // Allow checkData to override start index (for parallel upkeeps)
        uint256 startIdx = checkData.length >= 32
            ? abi.decode(checkData, (uint256))
            : scanCursor;

        if (vaults.length == 0) return (false, "");
        if (startIdx >= vaults.length) startIdx = 0;

        address[] memory candidateVaults = new address[](maxHarvestsPerUpkeep);
        address[] memory candidateStrategies = new address[](maxHarvestsPerUpkeep);
        uint256 count = 0;

        // Scan from cursor, wrapping around
        uint256 scanned = 0;
        uint256 idx = startIdx;

        while (scanned < vaults.length && count < maxHarvestsPerUpkeep) {
            address vault = vaults[idx];
            address[] memory strategies = IAionVaultKeeper(vault).getActiveStrategies();

            for (uint256 s = 0; s < strategies.length && count < maxHarvestsPerUpkeep; s++) {
                if (_shouldHarvest(vault, strategies[s])) {
                    candidateVaults[count] = vault;
                    candidateStrategies[count] = strategies[s];
                    count++;
                }
            }

            idx = (idx + 1) % vaults.length;
            scanned++;
        }

        if (count > 0) {
            // Trim to actual count
            address[] memory trimV = new address[](count);
            address[] memory trimS = new address[](count);
            for (uint256 i = 0; i < count; i++) {
                trimV[i] = candidateVaults[i];
                trimS[i] = candidateStrategies[i];
            }
            upkeepNeeded = true;
            performData = abi.encode(trimV, trimS);
        }
    }

    /**
     * @notice Called on-chain by Chainlink Automation (or anyone) to execute harvests.
     * @dev Re-validates each strategy before harvesting. Pays bounty on success.
     */
    function performUpkeep(bytes calldata performData) external override {
        require(
            block.timestamp >= lastUpkeepTimestamp + minUpkeepInterval,
            "Too soon"
        );

        (address[] memory harvestVaults, address[] memory harvestStrategies) =
            abi.decode(performData, (address[], address[]));

        require(harvestVaults.length == harvestStrategies.length, "Length mismatch");
        require(harvestVaults.length <= maxHarvestsPerUpkeep, "Too many");

        uint256 processed = 0;
        uint256 skipped = 0;
        uint256 failed = 0;

        for (uint256 i = 0; i < harvestVaults.length; i++) {
            address vault = harvestVaults[i];
            address strategy = harvestStrategies[i];

            // Re-validate on-chain (state may have changed since checkUpkeep)
            if (!_shouldHarvest(vault, strategy)) {
                skipped++;
                continue;
            }

            bytes32 key = _strategyKey(vault, strategy);
            StrategyHarvestConfig storage config = strategyConfig[key];

            // Execute harvest
            try IAionVaultKeeper(vault).processReport(strategy) returns (uint256 gain, uint256 loss) {
                // Success: reset failures, update timestamps, track metrics
                config.failCount = 0;
                config.lastKeeperHarvest = block.timestamp;

                totalSuccessfulHarvests++;
                totalProfitHarvested += gain;
                processed++;

                IAionVaultKeeper.StrategyParams memory params =
                    IAionVaultKeeper(vault).strategies(strategy);

                emit HarvestSuccess(
                    vault,
                    strategy,
                    msg.sender,
                    gain,
                    loss,
                    block.timestamp - (params.lastReport > 0 ? params.lastReport : block.timestamp)
                );
            } catch {
                // Failure: increment counter
                config.failCount++;
                totalFailedHarvests++;
                failed++;

                emit HarvestFailed(vault, strategy, config.failCount);
            }
        }

        // Advance pagination cursor
        if (vaults.length > 0) {
            scanCursor = (scanCursor + 1) % vaults.length;
        }

        lastUpkeepTimestamp = block.timestamp;

        // Pay bounty to caller if configured
        if (processed > 0 && harvestBounty > 0 && bountyToken != address(0)) {
            uint256 totalBounty = processed * harvestBounty;
            uint256 available = IERC20(bountyToken).balanceOf(address(this));
            if (totalBounty > available) totalBounty = available;

            if (totalBounty > 0) {
                IERC20(bountyToken).safeTransfer(msg.sender, totalBounty);
                emit BountyPaid(msg.sender, totalBounty);
            }
        }

        emit UpkeepPerformed(processed, skipped, failed, block.timestamp);
    }

    // ============================================================
    //          PUBLIC HARVEST (Permissionless + Incentivized)
    // ============================================================

    /**
     * @notice Anyone can harvest a specific strategy and earn a bounty.
     * @dev Does NOT respect minUpkeepInterval (per-strategy cooldown applies).
     *      Useful when Chainlink Automation is down or too slow.
     */
    function publicHarvest(address vault, address strategy) external {
        require(isRegisteredVault[vault], "Vault not registered");
        require(_shouldHarvest(vault, strategy), "Harvest not needed");

        bytes32 key = _strategyKey(vault, strategy);
        StrategyHarvestConfig storage config = strategyConfig[key];

        (uint256 gain, uint256 loss) = IAionVaultKeeper(vault).processReport(strategy);

        config.failCount = 0;
        config.lastKeeperHarvest = block.timestamp;
        totalSuccessfulHarvests++;
        totalProfitHarvested += gain;

        emit HarvestSuccess(vault, strategy, msg.sender, gain, loss, 0);

        // Pay bounty
        if (harvestBounty > 0 && bountyToken != address(0)) {
            uint256 available = IERC20(bountyToken).balanceOf(address(this));
            uint256 payout = harvestBounty > available ? available : harvestBounty;
            if (payout > 0) {
                IERC20(bountyToken).safeTransfer(msg.sender, payout);
                emit BountyPaid(msg.sender, payout);
            }
        }
    }

    // ============================================================
    //          INTERNAL: HARVEST ELIGIBILITY CHECK
    // ============================================================

    /**
     * @dev Determines if a strategy should be harvested. Checks:
     *      1. Vault is registered
     *      2. Strategy is active with debt
     *      3. Not blocked by AI
     *      4. Hasn't exceeded max retries
     *      5. Per-strategy cooldown passed
     *      6. Time since lastReport exceeds harvest delay
     *      7. RiskManager approves the strategy
     *      8. Unrealized profit exceeds minProfitThreshold
     */
    function _shouldHarvest(address vault, address strategy) internal view returns (bool) {
        if (!isRegisteredVault[vault]) return false;

        IAionVaultKeeper.StrategyParams memory params =
            IAionVaultKeeper(vault).strategies(strategy);

        // Must be active with debt deployed
        if (params.activation == 0 || params.currentDebt == 0) return false;

        bytes32 key = _strategyKey(vault, strategy);
        StrategyHarvestConfig memory config = strategyConfig[key];

        // AI has blocked this strategy from keeper harvesting
        if (config.harvestBlocked) return false;

        // Too many consecutive failures — needs manual intervention
        if (config.failCount >= MAX_RETRIES) return false;

        // Per-strategy cooldown
        if (config.minCooldown > 0 && config.lastKeeperHarvest > 0) {
            if (block.timestamp < config.lastKeeperHarvest + config.minCooldown) return false;
        }

        // Check harvest delay (per-strategy override or global default)
        uint256 delay = config.harvestDelay > 0 ? config.harvestDelay : defaultHarvestDelay;
        if (block.timestamp <= params.lastReport + delay) return false;

        // RiskManager check: don't harvest flagged strategies
        if (riskManager != address(0)) {
            try IRiskManagerKeeper(riskManager).isApproved(strategy) returns (bool approved) {
                if (!approved) return false;
            } catch {
                // If RiskManager call fails, proceed with harvest (fail-open for backup)
            }
        }

        // Profit check: is there enough unrealized profit to justify gas?
        if (minProfitThreshold > 0) {
            try IStrategyKeeper(strategy).totalAssets() returns (uint256 strategyAssets) {
                if (strategyAssets <= params.currentDebt) return false; // No profit or loss
                uint256 unrealizedProfit = strategyAssets - params.currentDebt;
                if (unrealizedProfit < minProfitThreshold) return false;
            } catch {
                // If we can't read totalAssets, harvest anyway (safety)
            }
        }

        return true;
    }

    /// @dev Unique key for a vault+strategy pair
    function _strategyKey(address vault, address strategy) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(vault, strategy));
    }

    // ============================================================
    //         AI COORDINATION (Called by AI/CRE system)
    // ============================================================

    /**
     * @notice AI can block/unblock keeper from harvesting a specific strategy.
     * @dev Use when AI intentionally delays harvest for strategic reasons
     *      (e.g., waiting for optimal gas, accumulating more yield).
     */
    function setHarvestBlocked(
        address vault,
        address strategy,
        bool blocked
    ) external onlyOwner {
        bytes32 key = _strategyKey(vault, strategy);
        strategyConfig[key].harvestBlocked = blocked;
        emit StrategyBlocked(vault, strategy, blocked);
    }

    /**
     * @notice Reset failure count for a strategy after manual investigation.
     */
    function resetFailCount(address vault, address strategy) external onlyOwner {
        bytes32 key = _strategyKey(vault, strategy);
        strategyConfig[key].failCount = 0;
    }

    // ============================================================
    //                    VAULT MANAGEMENT
    // ============================================================

    modifier onlyOwnerOrRegistrar() {
        require(msg.sender == owner() || msg.sender == registrar, "Not authorized");
        _;
    }

    function registerVault(address vault) external onlyOwnerOrRegistrar {
        require(vault != address(0), "Zero address");
        require(!isRegisteredVault[vault], "Already registered");

        vaults.push(vault);
        isRegisteredVault[vault] = true;
        emit VaultRegistered(vault);
    }

    function removeVault(address vault) external onlyOwnerOrRegistrar {
        require(isRegisteredVault[vault], "Not registered");

        uint256 len = vaults.length;
        for (uint256 i = 0; i < len; i++) {
            if (vaults[i] == vault) {
                vaults[i] = vaults[len - 1];
                vaults.pop();
                break;
            }
        }

        isRegisteredVault[vault] = false;
        emit VaultRemoved(vault);
    }

    // ============================================================
    //         PER-STRATEGY CONFIGURATION
    // ============================================================

    /**
     * @notice Set per-strategy harvest delay override.
     * @param delay Seconds (0 = use global defaultHarvestDelay)
     */
    function setStrategyHarvestDelay(
        address vault,
        address strategy,
        uint256 delay
    ) external onlyOwner {
        strategyConfig[_strategyKey(vault, strategy)].harvestDelay = delay;
    }

    /**
     * @notice Set per-strategy minimum cooldown between keeper harvests.
     * @param cooldown Seconds (0 = no per-strategy cooldown)
     */
    function setStrategyCooldown(
        address vault,
        address strategy,
        uint256 cooldown
    ) external onlyOwner {
        strategyConfig[_strategyKey(vault, strategy)].minCooldown = cooldown;
    }

    // ============================================================
    //                    ADMIN FUNCTIONS
    // ============================================================

    function setDefaultHarvestDelay(uint256 newDelay) external onlyOwner {
        uint256 old = defaultHarvestDelay;
        defaultHarvestDelay = newDelay;
        emit DefaultHarvestDelayUpdated(old, newDelay);
    }

    function setMaxHarvestsPerUpkeep(uint256 max) external onlyOwner {
        maxHarvestsPerUpkeep = max;
    }

    function setMinUpkeepInterval(uint256 interval) external onlyOwner {
        minUpkeepInterval = interval;
    }

    function setMinProfitThreshold(uint256 threshold) external onlyOwner {
        minProfitThreshold = threshold;
    }

    function setRiskManager(address riskManager_) external onlyOwner {
        riskManager = riskManager_;
    }

    function setRegistrar(address newRegistrar) external onlyOwner {
        address old = registrar;
        registrar = newRegistrar;
        emit RegistrarUpdated(old, newRegistrar);
    }

    function setHarvestBounty(address token, uint256 amount) external onlyOwner {
        bountyToken = token;
        harvestBounty = amount;
    }

    /// @notice Withdraw bounty tokens from the keeper (e.g., if shutting down)
    function withdrawBountyTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }

    // ============================================================
    //                    VIEW FUNCTIONS
    // ============================================================

    function getRegisteredVaults() external view returns (address[] memory) {
        return vaults;
    }

    function getStrategyConfig(
        address vault,
        address strategy
    ) external view returns (StrategyHarvestConfig memory) {
        return strategyConfig[_strategyKey(vault, strategy)];
    }

    /**
     * @notice Check if a specific strategy is eligible for harvest.
     */
    function isHarvestNeeded(address vault, address strategy) external view returns (bool) {
        return _shouldHarvest(vault, strategy);
    }

    /**
     * @notice Get keeper performance metrics.
     */
    function getMetrics()
        external
        view
        returns (
            uint256 totalSuccess,
            uint256 totalFailed,
            uint256 totalProfit,
            uint256 vaultCount,
            uint256 lastUpkeep
        )
    {
        totalSuccess = totalSuccessfulHarvests;
        totalFailed = totalFailedHarvests;
        totalProfit = totalProfitHarvested;
        vaultCount = vaults.length;
        lastUpkeep = lastUpkeepTimestamp;
    }
}

// ============================================================
//                    INTERFACES
// ============================================================

interface IAionVaultKeeper {
    struct StrategyParams {
        uint256 activation;
        uint256 lastReport;
        uint256 currentDebt;
        uint256 maxDebt;
        uint256 totalGain;
        uint256 totalLoss;
    }

    function getActiveStrategies() external view returns (address[] memory);
    function strategies(address strategy) external view returns (StrategyParams memory);
    function processReport(address strategy) external returns (uint256 gain, uint256 loss);
}

interface IRiskManagerKeeper {
    function isApproved(address strategy) external view returns (bool);
}

interface IStrategyKeeper {
    function totalAssets() external view returns (uint256);
}
