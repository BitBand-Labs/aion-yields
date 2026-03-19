// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../ace/PolicyProtected.sol";

/**
 * @title AutonomousAllocator
 * @author ChainNomads (AION Finance)
 * @notice AI-driven yield router that allocates vault capital across strategies.
 *
 * @dev Core of the AION Finance Strategy Engine. This contract serves as the
 *      vault's "allocator" — it calls vault.updateDebt() to deploy or withdraw
 *      capital from strategies based on AI recommendations.
 *
 *      ARCHITECTURE:
 *      ┌──────────────────────────────────────────────────────────────────┐
 *      │                     AutonomousAllocator                         │
 *      │                                                                  │
 *      │  ┌─────────────┐    ┌──────────────┐    ┌───────────────┐       │
 *      │  │ Liquidity    │    │ AI Strategy  │    │ Allocation    │       │
 *      │  │ Reserve      │    │ Engine (CRE) │    │ Limits        │       │
 *      │  └─────────────┘    └──────┬───────┘    └───────────────┘       │
 *      │                            │                                     │
 *      │  ┌─────────────────────────┼─────────────────────────┐           │
 *      │  │           AionVault.updateDebt()                  │           │
 *      │  │  ┌──────────┐  ┌────────────┐  ┌──────────────┐  │           │
 *      │  │  │ Strategy  │  │  Strategy  │  │   Strategy   │  │           │
 *      │  │  │ Aave     │  │  Curve     │  │   Pendle     │  │           │
 *      │  │  └──────────┘  └────────────┘  └──────────────┘  │           │
 *      │  └───────────────────────────────────────────────────┘           │
 *      └──────────────────────────────────────────────────────────────────┘
 *
 *      REBALANCE FLOW:
 *      1. AI engine calls executeStrategyAllocation() with target debts
 *      2. This contract calls vault.updateDebt(strategy, targetDebt) for each
 *      3. Vault moves capital to/from strategies accordingly
 */
contract AutonomousAllocator is Ownable, ReentrancyGuard, PolicyProtected {
    using SafeERC20 for IERC20;

    // ============================================================
    //                      CONSTANTS
    // ============================================================

    uint256 public constant BPS = 10000;
    uint256 public constant MIN_REBALANCE_INTERVAL = 1 hours;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev The AionVault this allocator manages
    address public aionVault;

    /// @dev The AIYieldEngine that authorizes rebalance calls
    address public aiYieldEngine;

    /// @dev Strategy registry for approval checks
    address public strategyRegistry;

    /// @dev Risk manager for risk validation
    address public riskManager;

    /// @dev Minimum time between rebalances (seconds)
    uint256 public rebalanceCooldown = 4 hours;

    /// @dev Last rebalance timestamp
    uint256 public lastRebalanceTime;

    /// @dev Whether autonomous rebalancing is enabled
    bool public autonomousEnabled;

    /// @dev Minimum confidence required from AI to auto-execute (BPS)
    uint256 public minRebalanceConfidence = 7500; // 75%

    /// @dev Rebalance execution history
    RebalanceRecord[] public rebalanceHistory;

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    struct RebalanceRecord {
        uint256 timestamp;
        uint256 confidence;
        bytes32 aiProofHash;
        address[] strategies;
        uint256[] targetDebts;
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event StrategyAllocationExecuted(
        address[] strategies,
        uint256[] targetDebts,
        uint256 confidence,
        bytes32 aiProofHash
    );
    event EmergencyWithdrawalExecuted(
        address indexed strategy,
        uint256 timestamp
    );
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

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address aionVault_,
        address aiYieldEngine_
    ) Ownable(initialOwner) {
        aionVault = aionVault_;
        aiYieldEngine = aiYieldEngine_;
    }

    // ============================================================
    //        CORE: AI-DRIVEN STRATEGY ALLOCATION
    // ============================================================

    /**
     * @notice Execute strategy allocation based on AI recommendations.
     * @dev Called by the AIYieldEngine after Chainlink CRE delivers AI results.
     *      For each strategy, calls vault.updateDebt(strategy, targetDebt).
     *
     * @param strategies Array of strategy addresses
     * @param targetDebts Target debt for each strategy
     * @param confidence AI confidence score (0-10000)
     * @param aiProofHash Verification hash from the AI model
     */
    function executeStrategyAllocation(
        address[] calldata strategies,
        uint256[] calldata targetDebts,
        uint256 confidence,
        bytes32 aiProofHash
    ) external onlyAIEngine nonReentrant policyCheck(abi.encode(aiProofHash)) {
        require(strategies.length == targetDebts.length, "Array length mismatch");
        require(
            block.timestamp >= lastRebalanceTime + rebalanceCooldown,
            "Rebalance cooldown active"
        );

        if (autonomousEnabled) {
            require(
                confidence >= minRebalanceConfidence,
                "Confidence too low for auto-rebalance"
            );
        }

        // Validate each strategy against registry and risk manager
        for (uint256 i = 0; i < strategies.length; i++) {
            if (strategyRegistry != address(0)) {
                require(
                    IStrategyRegistry(strategyRegistry).isApproved(strategies[i]),
                    "Strategy not approved in registry"
                );
            }
            if (riskManager != address(0)) {
                require(
                    IRiskManager(riskManager).isApproved(strategies[i]),
                    "Strategy not risk-approved"
                );
            }
        }

        // Execute: call vault.updateDebt() for each strategy
        for (uint256 i = 0; i < strategies.length; i++) {
            IAionVaultForAllocator(aionVault).updateDebt(
                strategies[i],
                targetDebts[i]
            );
        }

        // Record
        lastRebalanceTime = block.timestamp;

        rebalanceHistory.push(RebalanceRecord({
            timestamp: block.timestamp,
            confidence: confidence,
            aiProofHash: aiProofHash,
            strategies: strategies,
            targetDebts: targetDebts
        }));

        emit StrategyAllocationExecuted(
            strategies,
            targetDebts,
            confidence,
            aiProofHash
        );
    }

    // ============================================================
    //               HARVEST TRIGGER
    // ============================================================

    /**
     * @notice Trigger harvest (processReport) for a strategy via the vault.
     */
    function harvestStrategy(address strategy) external onlyAIEngine nonReentrant {
        IAionVaultForAllocator(aionVault).processReport(strategy);
    }

    /**
     * @notice Batch harvest multiple strategies.
     */
    function harvestBatch(address[] calldata strategies) external onlyAIEngine nonReentrant {
        for (uint256 i = 0; i < strategies.length; i++) {
            try IAionVaultForAllocator(aionVault).processReport(strategies[i]) {} catch {}
        }
    }

    // ============================================================
    //               EMERGENCY CONTROLS
    // ============================================================

    /**
     * @notice Emergency: set a strategy's debt to zero, pulling all funds back.
     */
    function emergencyWithdrawStrategy(
        address strategy
    ) external onlyOwner nonReentrant {
        IAionVaultForAllocator(aionVault).updateDebt(strategy, 0);
        emit EmergencyWithdrawalExecuted(strategy, block.timestamp);
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setAionVault(address vault_) external onlyOwner {
        aionVault = vault_;
    }

    function setAIYieldEngine(address engine) external onlyOwner {
        aiYieldEngine = engine;
    }

    function setStrategyRegistry(address registry_) external onlyOwner {
        strategyRegistry = registry_;
    }

    function setRiskManager(address riskManager_) external onlyOwner {
        riskManager = riskManager_;
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

    function setPolicyEngine(address engine) external onlyOwner {
        _setPolicyEngine(engine);
    }

    function setPolicyEnforcement(bool enabled) external onlyOwner {
        _setPolicyEnforcement(enabled);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getRebalanceHistoryCount() external view returns (uint256) {
        return rebalanceHistory.length;
    }
}

// ============================================================
//              INTERFACE FOR AION VAULT
// ============================================================

interface IAionVaultForAllocator {
    function updateDebt(address strategy, uint256 targetDebt) external;
    function processReport(address strategy) external returns (uint256 gain, uint256 loss);
}

interface IStrategyRegistry {
    function isApproved(address strategy) external view returns (bool);
}

interface IRiskManager {
    function isApproved(address strategy) external view returns (bool);
}
