// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../ace/PolicyProtected.sol";

/**
 * @title AIYieldEngine
 * @author ChainNomads (AION Finance)
 * @notice AI-driven yield optimization engine integrated with Chainlink CRE and Functions.
 *
 * @dev On-chain coordinator for AI-driven yield optimization. Two modes:
 *
 *      MODE 1 - ALLOCATION OPTIMIZATION:
 *        AI recommends how to distribute capital across strategies via the
 *        AutonomousAllocator, which calls vault.updateDebt() per strategy.
 *
 *      MODE 2 - HARVEST RECOMMENDATION:
 *        AI recommends which strategies should be harvested (processReport).
 *
 *      AI WORKFLOW:
 *      ┌─────────────┐     ┌──────────┐     ┌─────────────────┐     ┌────────────┐
 *      │ Trigger      │ --> │ CRE      │ --> │ Chainlink       │ --> │ AI Model   │
 *      │ (Automation) │     │ Workflow  │     │ Functions       │     │ (Off-chain)│
 *      └─────────────┘     └──────────┘     └─────────────────┘     └────────────┘
 *            ^                                                              │
 *            │                          ┌───────────────────────────────────┘
 *            │                          v
 *      ┌─────────────┐     ┌──────────────────────┐     ┌─────────────────────┐
 *      │ AionVault    │ <-- │ This Contract         │ --> │ Autonomous         │
 *      │ processReport│     │ (AI Yield Engine)     │     │ Allocator          │
 *      └─────────────┘     └──────────────────────┘     │  -> StrategyAave   │
 *                                                        │  -> StrategyCurve  │
 *                                                        └─────────────────────┘
 */
contract AIYieldEngine is Ownable, PolicyProtected {
    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev The AutonomousAllocator for strategy allocation
    address public autonomousAllocator;

    /// @dev Registered AionVaults (multi-vault support)
    address[] public vaults;
    mapping(address => bool) public isRegisteredVault;

    /// @dev Legacy single-vault reference (for backward compatibility views)
    address public aionVault;

    /// @dev AIAgentRegistry for verifying agent identity and reputation
    address public agentRegistry;

    /// @dev Minimum reputation score an agent must have to submit predictions (0-10000)
    uint256 public minAgentReputation = 500;

    /// @dev Authorized CRE workflow addresses (who can submit AI results)
    mapping(address => bool) public authorizedCallers;

    /// @dev History of AI yield predictions per asset
    mapping(address => YieldPrediction[]) public predictionHistory;

    /// @dev Latest prediction per asset
    mapping(address => YieldPrediction) public latestPrediction;

    /// @dev AI-recommended allocation per asset
    mapping(address => AllocationRecommendation)
        public aiRecommendedAllocations;

    /// @dev Whether AI allocation adjustments are enabled
    bool public aiAllocationEnabled;

    /// @dev Minimum confidence threshold for applying AI recommendations (0-10000 bps)
    uint256 public minConfidenceThreshold = 7000; // 70%

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    struct YieldPrediction {
        address asset;
        uint256 predictedAPY;  // AI-predicted APY (RAY)
        uint256 riskScore;     // Risk level (0-10000)
        uint256 confidence;    // Confidence level (0-10000)
        uint256 timestamp;
        address agentId;       // Which AI agent made this
        bytes32 proofHash;     // Hash of the prediction proof
    }

    struct AllocationRecommendation {
        address vault;              // Target vault for this allocation
        address asset;
        address[] strategies;       // Strategy addresses
        uint256[] targetDebts;      // Target debt for each strategy
        uint256 confidence;
        bytes32 proofHash;
        uint256 timestamp;
        bool isApplied;
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event PredictionReceived(
        address indexed asset,
        uint256 predictedAPY,
        uint256 riskScore,
        uint256 confidence,
        address indexed agentId
    );

    event AllocationRecommended(
        address indexed asset,
        uint256 confidence,
        bytes32 proofHash
    );

    event AllocationApplied(address indexed asset, uint256 timestamp);

    event HarvestTriggered(address indexed strategy, uint256 timestamp);

    event AIAllocationToggled(bool enabled);

    event VaultRegistered(address indexed vault);
    event VaultRemoved(address indexed vault);
    event AgentRegistrySet(address indexed registry);
    event MinAgentReputationSet(uint256 threshold);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address aionVault_
    ) Ownable(initialOwner) {
        aionVault = aionVault_;
        // Auto-register the initial vault
        if (aionVault_ != address(0)) {
            vaults.push(aionVault_);
            isRegisteredVault[aionVault_] = true;
        }
    }

    // ============================================================
    //                      MODIFIERS
    // ============================================================

    modifier onlyAuthorized() {
        require(
            authorizedCallers[msg.sender] || msg.sender == owner(),
            "Not authorized"
        );
        _;
    }

    // ============================================================
    //        CRE CALLBACK: RECEIVE AI PREDICTION
    // ============================================================

    /**
     * @notice Receives a yield prediction from the AI model via Chainlink CRE/Functions.
     */
    function receivePrediction(
        address asset,
        uint256 predictedAPY,
        uint256 riskScore,
        uint256 confidence,
        address agentId,
        bytes32 proofHash
    ) external onlyAuthorized policyCheck(abi.encode(proofHash)) {
        // Verify the agent is registered, active, and meets reputation threshold
        if (agentRegistry != address(0)) {
            require(
                IAIAgentRegistryForEngine(agentRegistry).isAgentActive(agentId),
                "Agent not active"
            );
            require(
                IAIAgentRegistryForEngine(agentRegistry).reputationScores(agentId) >= minAgentReputation,
                "Agent reputation too low"
            );
        }

        YieldPrediction memory prediction = YieldPrediction({
            asset: asset,
            predictedAPY: predictedAPY,
            riskScore: riskScore,
            confidence: confidence,
            timestamp: block.timestamp,
            agentId: agentId,
            proofHash: proofHash
        });

        predictionHistory[asset].push(prediction);
        latestPrediction[asset] = prediction;

        emit PredictionReceived(
            asset,
            predictedAPY,
            riskScore,
            confidence,
            agentId
        );
    }

    // ============================================================
    //  ALLOCATION RECOMMENDATION (AI -> Strategy Debt Allocation)
    // ============================================================

    /**
     * @notice Submits AI-recommended allocation across strategies for an asset on a vault.
     * @dev Called by the CRE workflow after AI determines optimal strategy debt levels.
     *
     *      Example: AI decides StrategyAave should hold $2M, StrategyCurve $1M
     *      strategies  = [strategyAave, strategyCurve]
     *      targetDebts = [2_000_000e6, 1_000_000e6]
     *
     * @param vault The target vault for this allocation
     * @param asset The asset being allocated
     * @param strategies_ Ordered list of strategy addresses
     * @param targetDebts Target debt for each strategy
     * @param confidence AI confidence in this allocation (0-10000)
     * @param proofHash Verification hash from the AI model
     */
    function submitAllocationRecommendation(
        address vault,
        address asset,
        address[] calldata strategies_,
        uint256[] calldata targetDebts,
        uint256 confidence,
        bytes32 proofHash
    ) external onlyAuthorized policyCheck(abi.encode(proofHash)) {
        require(isRegisteredVault[vault], "Vault not registered");
        require(
            strategies_.length == targetDebts.length,
            "Array length mismatch"
        );

        aiRecommendedAllocations[asset] = AllocationRecommendation({
            vault: vault,
            asset: asset,
            strategies: strategies_,
            targetDebts: targetDebts,
            confidence: confidence,
            proofHash: proofHash,
            timestamp: block.timestamp,
            isApplied: false
        });

        emit AllocationRecommended(asset, confidence, proofHash);

        // Auto-apply if enabled and confidence threshold met
        if (aiAllocationEnabled && confidence >= minConfidenceThreshold) {
            try this.executeAllocationInternal(asset) {} catch {}
        }
    }

    /**
     * @notice External entry point for try/catch self-call during auto-apply.
     */
    function executeAllocationInternal(address asset) external {
        require(msg.sender == address(this), "Only self-call");
        _applyRecommendedAllocation(asset);
    }

    /**
     * @notice Manually apply the latest AI-recommended allocation.
     */
    function applyRecommendedAllocation(address asset) external onlyOwner {
        _applyRecommendedAllocation(asset);
    }

    /**
     * @notice Internal: apply recommended allocation via AutonomousAllocator.
     */
    function _applyRecommendedAllocation(address asset) internal {
        AllocationRecommendation storage rec = aiRecommendedAllocations[asset];
        require(rec.timestamp > 0, "No recommendation available");
        require(!rec.isApplied, "Already applied");
        require(autonomousAllocator != address(0), "Allocator not set");
        require(isRegisteredVault[rec.vault], "Vault not registered");

        // Forward to allocator which calls vault.updateDebt() per strategy
        IAllocatorForAI(autonomousAllocator).executeStrategyAllocation(
            rec.vault,
            rec.strategies,
            rec.targetDebts,
            rec.confidence,
            rec.proofHash
        );

        rec.isApplied = true;
        emit AllocationApplied(asset, block.timestamp);
    }

    // ============================================================
    //        HARVEST RECOMMENDATION (AI -> Vault Harvest)
    // ============================================================

    /**
     * @notice AI recommends harvesting a specific strategy on a specific vault.
     * @param vault The vault that owns the strategy
     * @param strategy The strategy to harvest
     */
    function triggerHarvest(
        address vault,
        address strategy
    ) external onlyAuthorized {
        require(isRegisteredVault[vault], "Vault not registered");

        IAionVaultForAI(vault).processReport(strategy);

        emit HarvestTriggered(strategy, block.timestamp);
    }

    /**
     * @notice AI recommends batch harvesting multiple strategies on a specific vault.
     * @param vault The vault that owns the strategies
     * @param strategies_ The strategies to harvest
     */
    function triggerBatchHarvest(
        address vault,
        address[] calldata strategies_
    ) external onlyAuthorized {
        require(isRegisteredVault[vault], "Vault not registered");

        for (uint256 i = 0; i < strategies_.length; i++) {
            try IAionVaultForAI(vault).processReport(strategies_[i]) {} catch {}
        }
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setAuthorizedCaller(
        address caller,
        bool authorized
    ) external onlyOwner {
        authorizedCallers[caller] = authorized;
    }

    function setAIAllocationEnabled(bool enabled) external onlyOwner {
        aiAllocationEnabled = enabled;
        emit AIAllocationToggled(enabled);
    }

    function setMinConfidenceThreshold(uint256 threshold) external onlyOwner {
        require(threshold <= 10000, "Invalid threshold");
        minConfidenceThreshold = threshold;
    }

    function addVault(address vault_) external onlyOwner {
        require(vault_ != address(0), "Zero address");
        require(!isRegisteredVault[vault_], "Already registered");
        vaults.push(vault_);
        isRegisteredVault[vault_] = true;
        // Keep legacy reference pointing to the latest vault
        aionVault = vault_;
        emit VaultRegistered(vault_);
    }

    function removeVault(address vault_) external onlyOwner {
        require(isRegisteredVault[vault_], "Not registered");
        isRegisteredVault[vault_] = false;
        // Remove from array
        for (uint256 i = 0; i < vaults.length; i++) {
            if (vaults[i] == vault_) {
                vaults[i] = vaults[vaults.length - 1];
                vaults.pop();
                break;
            }
        }
        emit VaultRemoved(vault_);
    }

    function setAionVault(address vault_) external onlyOwner {
        // Legacy setter — registers the vault if not already registered
        if (!isRegisteredVault[vault_] && vault_ != address(0)) {
            vaults.push(vault_);
            isRegisteredVault[vault_] = true;
            emit VaultRegistered(vault_);
        }
        aionVault = vault_;
    }

    function setAutonomousAllocator(address allocator_) external onlyOwner {
        autonomousAllocator = allocator_;
    }

    function setAgentRegistry(address registry) external onlyOwner {
        agentRegistry = registry;
        emit AgentRegistrySet(registry);
    }

    function setMinAgentReputation(uint256 threshold) external onlyOwner {
        require(threshold <= 10000, "Invalid threshold");
        minAgentReputation = threshold;
        emit MinAgentReputationSet(threshold);
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

    function getPredictionCount(address asset) external view returns (uint256) {
        return predictionHistory[asset].length;
    }

    function getPrediction(
        address asset,
        uint256 index
    ) external view returns (YieldPrediction memory) {
        return predictionHistory[asset][index];
    }

    function getLatestPrediction(
        address asset
    ) external view returns (YieldPrediction memory) {
        return latestPrediction[asset];
    }

    function getVaultCount() external view returns (uint256) {
        return vaults.length;
    }

    function getAllVaults() external view returns (address[] memory) {
        return vaults;
    }
}

// ============================================================
//              INTERFACE FOR AI AGENT REGISTRY
// ============================================================

interface IAIAgentRegistryForEngine {
    function isAgentActive(address agent) external view returns (bool);
    function reputationScores(address agent) external view returns (uint256);
}

// ============================================================
//              INTERFACE FOR AUTONOMOUS ALLOCATOR
// ============================================================

interface IAllocatorForAI {
    function executeStrategyAllocation(
        address vault,
        address[] memory strategies,
        uint256[] memory targetDebts,
        uint256 confidence,
        bytes32 aiProofHash
    ) external;
}

// ============================================================
//              INTERFACE FOR AION VAULT
// ============================================================

interface IAionVaultForAI {
    function processReport(address strategy) external returns (uint256 gain, uint256 loss);
    function totalAssets() external view returns (uint256);
    function totalSupply() external view returns (uint256);
}
