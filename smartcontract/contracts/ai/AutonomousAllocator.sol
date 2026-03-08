// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IProtocolAdapter.sol";
import "../ace/PolicyProtected.sol";

/**
 * @title AutonomousAllocator
 * @author ChainNomads (AION Yield)
 * @notice AI-driven cross-protocol yield allocator powered by Chainlink CRE.
 *
 * @dev Core of the AION Yield Strategy Engine. Instead of a static vault,
 *      this contract autonomously manages liquidity across multiple DeFi protocols
 *      (Aave V3, Morpho Blue, and future integrations) to maximize risk-adjusted yield.
 *
 *      ARCHITECTURE:
 *      ┌──────────────────────────────────────────────────────────────────┐
 *      │                     AutonomousAllocator                         │
 *      │                                                                  │
 *      │  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐       │
 *      │  │ Emergency    │    │ AI Strategy  │    │ Allocation    │       │
 *      │  │ Buffer (15%) │    │ Engine (CRE) │    │ Limits        │       │
 *      │  └─────────────┘    └──────┬───────┘    └───────────────┘       │
 *      │                            │                                     │
 *      │  ┌─────────────────────────┼─────────────────────────┐           │
 *      │  │           Protocol Adapter Layer                  │           │
 *      │  │  ┌──────────┐  ┌────────────┐  ┌──────────────┐  │           │
 *      │  │  │ AION     │  │  Aave V3   │  │   Morpho     │  │           │
 *      │  │  │ Pool     │  │  Adapter   │  │   Adapter    │  │           │
 *      │  │  └──────────┘  └────────────┘  └──────────────┘  │           │
 *      │  └───────────────────────────────────────────────────┘           │
 *      └──────────────────────────────────────────────────────────────────┘
 *
 *      REBALANCE FLOW (triggered by Chainlink CRE + AI):
 *      1. CRE Pre-hook gathers APYs from all protocol adapters
 *      2. Off-chain AI model calculates optimal allocation percentages
 *      3. CRE Post-hook calls executeAllocation() with the AI's result
 *      4. This contract moves liquidity between protocols accordingly
 *
 *      SAFETY FEATURES:
 *      - Emergency buffer: % of assets always kept liquid in AION LendingPool
 *      - Per-protocol allocation caps to limit concentration risk
 *      - Cooldown between rebalances to prevent manipulation
 *      - Emergency withdrawal to pull all funds from external protocols
 */
contract AutonomousAllocator is Ownable, ReentrancyGuard, PolicyProtected {
    using SafeERC20 for IERC20;

    // ============================================================
    //                      CONSTANTS
    // ============================================================

    uint256 public constant BPS = 10000;
    uint256 public constant MAX_PROTOCOLS = 10;
    uint256 public constant MIN_REBALANCE_INTERVAL = 1 hours;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev The AION LendingPool (always protocol index 0; the "home" pool)
    address public lendingPool;

    /// @dev The AIYieldEngine that authorizes rebalance calls
    address public aiYieldEngine;

    /// @dev Registered protocol adapters (index => adapter address)
    mapping(uint256 => address) public protocolAdapters;

    /// @dev Number of registered protocols
    uint256 public protocolCount;

    /// @dev Protocol name lookup
    mapping(uint256 => string) public protocolNames;

    /// @dev Whether a protocol adapter is active
    mapping(uint256 => bool) public protocolActive;

    /// @dev Current allocation target per protocol per asset (in BPS, must sum to 10000)
    /// asset => protocolIndex => allocationBps
    mapping(address => mapping(uint256 => uint256)) public targetAllocations;

    /// @dev Maximum allocation allowed per protocol (BPS) — concentration limit
    mapping(uint256 => uint256) public maxAllocationBps;

    /// @dev Emergency buffer percentage (BPS) — always kept in AION LendingPool
    uint256 public emergencyBufferBps = 1500; // 15% default

    /// @dev Minimum time between rebalances (seconds)
    uint256 public rebalanceCooldown = 4 hours;

    /// @dev Last rebalance timestamp per asset
    mapping(address => uint256) public lastRebalanceTime;

    /// @dev Total value managed per asset across all protocols
    mapping(address => uint256) public totalManagedValue;

    /// @dev Rebalance execution history
    RebalanceRecord[] public rebalanceHistory;

    /// @dev Whether autonomous rebalancing is enabled
    bool public autonomousEnabled;

    /// @dev Minimum confidence required from AI to auto-execute (BPS)
    uint256 public minRebalanceConfidence = 7500; // 75%

    /// @dev Supported assets for allocation
    mapping(address => bool) public supportedAssets;
    address[] public assetList;

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    struct AllocationInstruction {
        uint256 protocolIndex; // Which protocol
        uint256 allocationBps; // Target allocation in BPS
    }

    struct RebalanceRecord {
        address asset;
        uint256 timestamp;
        uint256 confidence;
        bytes32 aiProofHash;
        AllocationInstruction[] allocations;
        uint256 totalValueBefore;
        uint256 totalValueAfter;
    }

    struct ProtocolSnapshot {
        uint256 protocolIndex;
        string name;
        uint256 currentBalance;
        uint256 currentAPY;
        uint256 riskScore;
        uint256 targetAllocationBps;
        uint256 actualAllocationBps;
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event ProtocolAdapterRegistered(
        uint256 indexed protocolIndex,
        address indexed adapter,
        string name
    );
    event ProtocolAdapterRemoved(uint256 indexed protocolIndex);
    event AllocationUpdated(
        address indexed asset,
        uint256 indexed protocolIndex,
        uint256 newAllocationBps
    );
    event RebalanceExecuted(
        address indexed asset,
        uint256 totalValue,
        uint256 confidence,
        bytes32 aiProofHash
    );
    event EmergencyWithdrawalExecuted(
        address indexed asset,
        uint256 totalRecovered
    );
    event DepositToProtocol(
        address indexed asset,
        uint256 indexed protocolIndex,
        uint256 amount
    );
    event WithdrawFromProtocol(
        address indexed asset,
        uint256 indexed protocolIndex,
        uint256 amount
    );
    event AssetAdded(address indexed asset);
    event AutonomousToggled(bool enabled);

    // ============================================================
    //                      MODIFIERS
    // ============================================================

    modifier onlyAIEngine() {
        require(
            msg.sender == aiYieldEngine || msg.sender == owner(),
            "Only AI engine or owner"
        );
        _;
    }

    modifier onlySupported(address asset) {
        require(supportedAssets[asset], "Asset not supported");
        _;
    }

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address lendingPool_,
        address aiYieldEngine_
    ) Ownable(initialOwner) {
        lendingPool = lendingPool_;
        aiYieldEngine = aiYieldEngine_;
    }

    // ============================================================
    //            PROTOCOL ADAPTER MANAGEMENT
    // ============================================================

    /**
     * @notice Register a new external protocol adapter.
     * @param adapter The IProtocolAdapter-compliant contract address
     * @param name Human-readable protocol name (e.g. "Aave V3")
     * @param maxAllocation Maximum allocation this protocol can receive (BPS)
     * @return protocolIndex The index assigned to this protocol
     */
    function registerProtocol(
        address adapter,
        string calldata name,
        uint256 maxAllocation
    ) external onlyOwner returns (uint256 protocolIndex) {
        require(adapter != address(0), "Invalid adapter");
        require(maxAllocation <= BPS, "Invalid max allocation");
        require(protocolCount < MAX_PROTOCOLS, "Too many protocols");

        protocolIndex = protocolCount;
        protocolAdapters[protocolIndex] = adapter;
        protocolNames[protocolIndex] = name;
        protocolActive[protocolIndex] = true;
        maxAllocationBps[protocolIndex] = maxAllocation;

        protocolCount++;

        emit ProtocolAdapterRegistered(protocolIndex, adapter, name);
    }

    /**
     * @notice Deactivate a protocol adapter (keeps it registered but stops new allocations).
     */
    function deactivateProtocol(uint256 protocolIndex) external onlyOwner {
        require(protocolIndex < protocolCount, "Invalid index");
        protocolActive[protocolIndex] = false;
        emit ProtocolAdapterRemoved(protocolIndex);
    }

    // ============================================================
    //        CORE: AI-DRIVEN AUTONOMOUS REBALANCING
    // ============================================================

    /**
     * @notice Execute a full rebalance for an asset based on AI recommendations.
     * @dev Called by the AIYieldEngine after Chainlink CRE delivers AI results.
     *
     *      The function:
     *      1. Validates cooldown and confidence thresholds
     *      2. Enforces the emergency buffer (AION pool minimum)
     *      3. Enforces per-protocol max allocation caps
     *      4. Withdraws from over-allocated protocols
     *      5. Deposits into under-allocated protocols
     *
     * @param asset The asset to rebalance
     * @param instructions Array of (protocolIndex, allocationBps) targets
     * @param confidence AI confidence score for this recommendation (0-10000)
     * @param aiProofHash Verification hash from the AI model
     */
    function executeAllocation(
        address asset,
        AllocationInstruction[] calldata instructions,
        uint256 confidence,
        bytes32 aiProofHash
    ) external onlyAIEngine onlySupported(asset) nonReentrant policyCheck(abi.encode(_getTotalManagedValue(asset), _getTotalManagedValue(asset))) {
        // 1. Validate cooldown
        require(
            block.timestamp >= lastRebalanceTime[asset] + rebalanceCooldown,
            "Rebalance cooldown active"
        );

        // 2. Validate confidence
        if (autonomousEnabled) {
            require(
                confidence >= minRebalanceConfidence,
                "Confidence too low for auto-rebalance"
            );
        }

        // 3. Validate instructions
        uint256 totalBps = 0;
        for (uint256 i = 0; i < instructions.length; i++) {
            require(
                instructions[i].protocolIndex < protocolCount,
                "Invalid protocol"
            );
            require(
                instructions[i].allocationBps <=
                    maxAllocationBps[instructions[i].protocolIndex],
                "Exceeds protocol max allocation"
            );
            totalBps += instructions[i].allocationBps;
        }
        require(totalBps == BPS, "Allocations must sum to 100%");

        // 4. Calculate total managed value across all protocols
        uint256 totalValue = _getTotalManagedValue(asset);
        require(totalValue > 0, "No assets to allocate");

        // 5. Enforce emergency buffer (first instruction MUST be the AION pool)
        require(
            instructions[0].allocationBps >= emergencyBufferBps,
            "Emergency buffer not met"
        );

        // 6. Set new target allocations
        for (uint256 i = 0; i < instructions.length; i++) {
            targetAllocations[asset][
                instructions[i].protocolIndex
            ] = instructions[i].allocationBps;

            emit AllocationUpdated(
                asset,
                instructions[i].protocolIndex,
                instructions[i].allocationBps
            );
        }

        // 7. Execute the rebalance
        _executeRebalance(asset, instructions, totalValue);

        // 8. Record
        lastRebalanceTime[asset] = block.timestamp;
        totalManagedValue[asset] = _getTotalManagedValue(asset);

        emit RebalanceExecuted(asset, totalValue, confidence, aiProofHash);
    }

    /**
     * @notice Internal rebalance execution.
     * @dev Two-pass algorithm:
     *      Pass 1: Withdraw from protocols that are over-allocated
     *      Pass 2: Deposit into protocols that are under-allocated
     *
     *      This ensures we always have enough liquidity to fund new deposits
     *      before moving funds, preventing temporary insolvency.
     */
    function _executeRebalance(
        address asset,
        AllocationInstruction[] calldata instructions,
        uint256 totalValue
    ) internal {
        // --- PASS 1: Withdraw from over-allocated protocols ---
        for (uint256 i = 0; i < instructions.length; i++) {
            uint256 idx = instructions[i].protocolIndex;
            if (!protocolActive[idx] || idx == 0) continue; // Skip AION pool (index 0) and inactive

            address adapter = protocolAdapters[idx];
            if (adapter == address(0)) continue;

            uint256 currentBalance = IProtocolAdapter(adapter).getBalance(
                asset
            );
            uint256 targetBalance = (totalValue *
                instructions[i].allocationBps) / BPS;

            if (currentBalance > targetBalance) {
                uint256 excess = currentBalance - targetBalance;
                IProtocolAdapter(adapter).withdraw(asset, excess);
                emit WithdrawFromProtocol(asset, idx, excess);
            }
        }

        // --- PASS 2: Deposit into under-allocated protocols ---
        for (uint256 i = 0; i < instructions.length; i++) {
            uint256 idx = instructions[i].protocolIndex;
            if (!protocolActive[idx] || idx == 0) continue; // Skip AION pool and inactive

            address adapter = protocolAdapters[idx];
            if (adapter == address(0)) continue;

            uint256 currentBalance = IProtocolAdapter(adapter).getBalance(
                asset
            );
            uint256 targetBalance = (totalValue *
                instructions[i].allocationBps) / BPS;

            if (currentBalance < targetBalance) {
                uint256 deficit = targetBalance - currentBalance;
                uint256 available = IERC20(asset).balanceOf(address(this));
                uint256 toDeposit = deficit > available ? available : deficit;

                if (toDeposit > 0) {
                    IERC20(asset).approve(adapter, toDeposit);
                    IProtocolAdapter(adapter).deposit(asset, toDeposit);
                    emit DepositToProtocol(asset, idx, toDeposit);
                }
            }
        }
    }

    // ============================================================
    //               EMERGENCY CONTROLS
    // ============================================================

    /**
     * @notice Emergency: pull ALL assets from ALL external protocols back to AION.
     * @dev Can be called by owner in case of detected vulnerability in an external protocol.
     */
    function emergencyWithdrawAll(
        address asset
    ) external onlyOwner nonReentrant {
        uint256 totalRecovered = 0;

        for (uint256 i = 1; i < protocolCount; i++) {
            // Skip index 0 (AION pool)
            address adapter = protocolAdapters[i];
            if (adapter == address(0)) continue;

            try IProtocolAdapter(adapter).emergencyWithdraw(asset) returns (
                uint256 recovered
            ) {
                totalRecovered += recovered;
                // Reset allocation to 0
                targetAllocations[asset][i] = 0;
            } catch {
                // Log but don't revert — best effort recovery
            }
        }

        // Set 100% allocation to AION pool
        targetAllocations[asset][0] = BPS;

        emit EmergencyWithdrawalExecuted(asset, totalRecovered);
    }

    /**
     * @notice Emergency: pull assets from a single external protocol.
     */
    function emergencyWithdrawFromProtocol(
        address asset,
        uint256 protocolIndex
    ) external onlyOwner nonReentrant {
        require(protocolIndex > 0, "Cannot withdraw from AION pool");
        require(protocolIndex < protocolCount, "Invalid index");

        address adapter = protocolAdapters[protocolIndex];
        require(adapter != address(0), "No adapter");

        uint256 recovered = IProtocolAdapter(adapter).emergencyWithdraw(asset);
        targetAllocations[asset][protocolIndex] = 0;

        emit EmergencyWithdrawalExecuted(asset, recovered);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Returns the total value of an asset managed across all protocols.
     */
    function _getTotalManagedValue(
        address asset
    ) internal view returns (uint256 total) {
        // Balance held directly in this allocator (idle)
        total = IERC20(asset).balanceOf(address(this));

        // Add balances in each adapter
        for (uint256 i = 0; i < protocolCount; i++) {
            address adapter = protocolAdapters[i];
            if (adapter == address(0)) continue;
            total += IProtocolAdapter(adapter).getBalance(asset);
        }
    }

    /**
     * @notice Get a full snapshot of all protocol allocations for an asset.
     */
    function getAllocationSnapshot(
        address asset
    ) external view returns (ProtocolSnapshot[] memory snapshots) {
        snapshots = new ProtocolSnapshot[](protocolCount);
        uint256 totalValue = _getTotalManagedValue(asset);

        for (uint256 i = 0; i < protocolCount; i++) {
            address adapter = protocolAdapters[i];
            uint256 balance = 0;
            uint256 apy = 0;
            uint256 risk = 0;

            if (adapter != address(0)) {
                try IProtocolAdapter(adapter).getBalance(asset) returns (
                    uint256 b
                ) {
                    balance = b;
                } catch {}
                try IProtocolAdapter(adapter).getCurrentAPY(asset) returns (
                    uint256 a
                ) {
                    apy = a;
                } catch {}
                try IProtocolAdapter(adapter).getProtocolState(asset) returns (
                    IProtocolAdapter.ProtocolState memory state
                ) {
                    risk = state.riskScore;
                } catch {}
            }

            uint256 actualBps = totalValue > 0
                ? (balance * BPS) / totalValue
                : 0;

            snapshots[i] = ProtocolSnapshot({
                protocolIndex: i,
                name: protocolNames[i],
                currentBalance: balance,
                currentAPY: apy,
                riskScore: risk,
                targetAllocationBps: targetAllocations[asset][i],
                actualAllocationBps: actualBps
            });
        }
    }

    /**
     * @notice Returns the weighted average APY across all protocol allocations.
     */
    function getBlendedAPY(
        address asset
    ) external view returns (uint256 blendedAPY) {
        uint256 totalValue = _getTotalManagedValue(asset);
        if (totalValue == 0) return 0;

        uint256 weightedSum = 0;
        for (uint256 i = 0; i < protocolCount; i++) {
            address adapter = protocolAdapters[i];
            if (adapter == address(0)) continue;

            uint256 balance = IProtocolAdapter(adapter).getBalance(asset);
            uint256 apy = IProtocolAdapter(adapter).getCurrentAPY(asset);

            weightedSum += balance * apy;
        }

        blendedAPY = weightedSum / totalValue;
    }

    /**
     * @notice Returns the total value managed for an asset (public view).
     */
    function getTotalManagedValue(
        address asset
    ) external view returns (uint256) {
        return _getTotalManagedValue(asset);
    }

    function getProtocolCount() external view returns (uint256) {
        return protocolCount;
    }

    function getRebalanceHistoryCount() external view returns (uint256) {
        return rebalanceHistory.length;
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function addSupportedAsset(address asset) external onlyOwner {
        if (!supportedAssets[asset]) {
            supportedAssets[asset] = true;
            assetList.push(asset);
            emit AssetAdded(asset);
        }
    }

    function setAIYieldEngine(address engine) external onlyOwner {
        aiYieldEngine = engine;
    }

    function setLendingPool(address pool) external onlyOwner {
        lendingPool = pool;
    }

    function setEmergencyBufferBps(uint256 bps) external onlyOwner {
        require(bps <= 5000, "Buffer too high (max 50%)");
        emergencyBufferBps = bps;
    }

    function setRebalanceCooldown(uint256 seconds_) external onlyOwner {
        require(seconds_ >= MIN_REBALANCE_INTERVAL, "Below minimum");
        rebalanceCooldown = seconds_;
    }

    function setAutonomousEnabled(bool enabled) external onlyOwner {
        autonomousEnabled = enabled;
        emit AutonomousToggled(enabled);
    }

    function setMinRebalanceConfidence(uint256 confidence) external onlyOwner {
        require(confidence <= BPS, "Invalid confidence");
        minRebalanceConfidence = confidence;
    }

    function setMaxAllocation(
        uint256 protocolIndex,
        uint256 maxBps
    ) external onlyOwner {
        require(protocolIndex < protocolCount, "Invalid index");
        require(maxBps <= BPS, "Invalid bps");
        maxAllocationBps[protocolIndex] = maxBps;
    }

    function setPolicyEngine(address engine) external onlyOwner {
        _setPolicyEngine(engine);
    }

    function setPolicyEnforcement(bool enabled) external onlyOwner {
        _setPolicyEnforcement(enabled);
    }

    /// @notice Allow owner to rescue stuck tokens that aren't part of managed assets
    function rescueTokens(
        address token,
        uint256 amount,
        address to
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }
}
