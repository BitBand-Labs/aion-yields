// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AIYieldEngine
 * @author ChainNomads (AION Yield)
 * @notice AI-driven yield optimization engine integrated with Chainlink CRE and Functions.
 *
 * @dev This contract serves as the on-chain coordinator for AI-driven yield optimization:
 *
 *      1. Chainlink CRE (Runtime Environment) orchestrates the workflow:
 *         Smart Contract → CRE → Chainlink Functions → AI Model → CRE → Smart Contract
 *
 *      2. Chainlink Functions calls the off-chain AI model (Python/FastAPI):
 *         - Fetches market data
 *         - Runs yield prediction model
 *         - Returns optimal rate parameters
 *
 *      3. This contract receives the AI recommendation and adjusts the protocol accordingly.
 *
 *      AI WORKFLOW:
 *      ┌─────────────┐     ┌──────────┐     ┌─────────────────┐     ┌────────────┐
 *      │ Trigger      │ ──→ │ CRE      │ ──→ │ Chainlink       │ ──→ │ AI Model   │
 *      │ (Automation) │     │ Workflow  │     │ Functions       │     │ (Off-chain)│
 *      └─────────────┘     └──────────┘     └─────────────────┘     └────────────┘
 *            ↑                                                              │
 *            │                                                              ↓
 *      ┌─────────────┐     ┌──────────┐     ┌─────────────────┐     ┌────────────┐
 *      │ LendingPool  │ ←── │ This     │ ←── │ x402 Payment    │ ←── │ AI Result  │
 *      │ Rate Update  │     │ Contract │     │ (optional)      │     │            │
 *      └─────────────┘     └──────────┘     └─────────────────┘     └────────────┘
 */
contract AIYieldEngine is Ownable {
    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev The lending pool to apply AI recommendations to
    address public lendingPool;

    /// @dev Authorized CRE workflow addresses (who can submit AI results)
    mapping(address => bool) public authorizedCallers;

    /// @dev History of AI yield predictions per asset
    mapping(address => YieldPrediction[]) public predictionHistory;

    /// @dev Latest prediction per asset
    mapping(address => YieldPrediction) public latestPrediction;

    /// @dev AI-recommended rate parameters per asset
    mapping(address => RecommendedRates) public aiRecommendedRates;

    /// @dev Whether AI rate adjustments are enabled
    bool public aiAdjustmentsEnabled;

    /// @dev Minimum confidence threshold for applying AI recommendations (0-10000 bps)
    uint256 public minConfidenceThreshold = 7000; // 70%

    /// @dev Maximum rate deviation allowed from current rates (bps)
    uint256 public maxRateDeviation = 2000; // 20%

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    struct YieldPrediction {
        address asset; // Target asset
        uint256 predictedAPY; // AI-predicted APY (RAY)
        uint256 riskScore; // Risk level (0-10000)
        uint256 confidence; // Confidence level (0-10000)
        uint256 timestamp; // When prediction was made
        address agentId; // Which AI agent made this
        bytes32 proofHash; // Hash of the prediction proof (for verification)
    }

    struct RecommendedRates {
        uint256 baseRate; // Recommended base rate (RAY)
        uint256 rateSlope1; // Recommended slope 1 (RAY)
        uint256 rateSlope2; // Recommended slope 2 (RAY)
        uint256 optimalUtilization; // Recommended optimal utilization (RAY)
        uint256 lastUpdateTime; // When this was last updated
        bool isApplied; // Whether this has been applied to the pool
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

    event RatesRecommended(
        address indexed asset,
        uint256 baseRate,
        uint256 rateSlope1,
        uint256 rateSlope2,
        uint256 optimalUtilization
    );

    event RatesApplied(address indexed asset, uint256 timestamp);

    event AIAdjustmentsToggled(bool enabled);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address lendingPool_
    ) Ownable(initialOwner) {
        lendingPool = lendingPool_;
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
    //   (Called by Chainlink CRE after AI model execution)
    // ============================================================

    /**
     * @notice Receives a yield prediction from the AI model via Chainlink CRE/Functions.
     * @dev This is the callback function that Chainlink CRE calls after completing
     *      the AI inference workflow.
     *
     *      CRE Workflow:
     *      1. Automation trigger → CRE starts workflow
     *      2. CRE calls Chainlink Functions with market data
     *      3. Functions calls off-chain AI model
     *      4. AI model returns prediction
     *      5. CRE calls this function with the result
     *
     * @param asset The asset the prediction is for
     * @param predictedAPY The AI-predicted optimal APY (RAY precision)
     * @param riskScore Risk assessment (0-10000 bps)
     * @param confidence Confidence level (0-10000 bps)
     * @param agentId The AI agent that made this prediction
     * @param proofHash Verification hash for the prediction
     */
    function receivePrediction(
        address asset,
        uint256 predictedAPY,
        uint256 riskScore,
        uint256 confidence,
        address agentId,
        bytes32 proofHash
    ) external onlyAuthorized {
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
    //    RATE RECOMMENDATION (AI → Protocol Rate Adjustment)
    // ============================================================

    /**
     * @notice Submits AI-recommended rate parameters for an asset.
     * @dev Called by the CRE workflow after the AI model determines optimal rates.
     *      Rates are stored but not applied until explicitly approved or auto-applied
     *      if AI adjustments are enabled and confidence threshold is met.
     */
    function submitRateRecommendation(
        address asset,
        uint256 baseRate,
        uint256 rateSlope1,
        uint256 rateSlope2,
        uint256 optimalUtilization,
        uint256 confidence
    ) external onlyAuthorized {
        aiRecommendedRates[asset] = RecommendedRates({
            baseRate: baseRate,
            rateSlope1: rateSlope1,
            rateSlope2: rateSlope2,
            optimalUtilization: optimalUtilization,
            lastUpdateTime: block.timestamp,
            isApplied: false
        });

        emit RatesRecommended(
            asset,
            baseRate,
            rateSlope1,
            rateSlope2,
            optimalUtilization
        );

        // Auto-apply if enabled and confidence threshold met
        if (aiAdjustmentsEnabled && confidence >= minConfidenceThreshold) {
            _applyRecommendedRates(asset);
        }
    }

    /**
     * @notice Manually apply the latest AI-recommended rates for an asset.
     * @dev Can be called by owner to manually approve AI recommendations.
     */
    function applyRecommendedRates(address asset) external onlyOwner {
        _applyRecommendedRates(asset);
    }

    /**
     * @notice Internal function to apply recommended rates to the lending pool.
     */
    function _applyRecommendedRates(address asset) internal {
        RecommendedRates storage rates = aiRecommendedRates[asset];
        require(rates.lastUpdateTime > 0, "No recommendation available");
        require(!rates.isApplied, "Already applied");

        // Call LendingPool to update rate parameters
        ILendingPoolForAI(lendingPool).aiAdjustRateParams(
            asset,
            rates.baseRate,
            rates.rateSlope1,
            rates.rateSlope2,
            rates.optimalUtilization
        );

        rates.isApplied = true;

        emit RatesApplied(asset, block.timestamp);
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

    function setAIAdjustmentsEnabled(bool enabled) external onlyOwner {
        aiAdjustmentsEnabled = enabled;
        emit AIAdjustmentsToggled(enabled);
    }

    function setMinConfidenceThreshold(uint256 threshold) external onlyOwner {
        require(threshold <= 10000, "Invalid threshold");
        minConfidenceThreshold = threshold;
    }

    function setMaxRateDeviation(uint256 deviation) external onlyOwner {
        maxRateDeviation = deviation;
    }

    function setLendingPool(address pool) external onlyOwner {
        lendingPool = pool;
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Returns the number of predictions stored for an asset.
     */
    function getPredictionCount(address asset) external view returns (uint256) {
        return predictionHistory[asset].length;
    }

    /**
     * @notice Returns a specific prediction from history.
     */
    function getPrediction(
        address asset,
        uint256 index
    ) external view returns (YieldPrediction memory) {
        return predictionHistory[asset][index];
    }

    /**
     * @notice Returns the latest prediction for an asset.
     */
    function getLatestPrediction(
        address asset
    ) external view returns (YieldPrediction memory) {
        return latestPrediction[asset];
    }
}

// ============================================================
//              INTERFACE FOR LENDING POOL
// ============================================================

interface ILendingPoolForAI {
    function aiAdjustRateParams(
        address asset,
        uint256 baseRate,
        uint256 rateSlope1,
        uint256 rateSlope2,
        uint256 optimalUtilization
    ) external;
}
