// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ChainlinkFunctionsConsumer
 * @author ChainNomads (AION Yield)
 * @notice Chainlink Functions consumer contract for off-chain AI model execution.
 *
 * @dev Integrates with Chainlink Functions to call external AI models:
 *
 *      FLOW:
 *      ┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
 *      │ Protocol     │ ──→ │ This         │ ──→ │ Chainlink    │ ──→ │ Off-chain   │
 *      │ Trigger      │     │ Consumer     │     │ Functions    │     │ AI Model    │
 *      └─────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
 *                                                                          │
 *                          ┌──────────────┐     ┌──────────────┐           │
 *                          │ AI Yield     │ ←── │ Callback     │ ←─────────┘
 *                          │ Engine       │     │ fulfillment  │
 *                          └──────────────┘     └──────────────┘
 *
 *      Supported AI Inference Types:
 *      1. YIELD_PREDICTION   - Predict optimal yields for a given asset
 *      2. RISK_ASSESSMENT    - Evaluate risk scores for positions
 *      3. RATE_OPTIMIZATION  - Recommend interest rate parameters
 *      4. MARKET_ANALYSIS    - Analyze macro market conditions
 */
contract ChainlinkFunctionsConsumer is Ownable {
    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Chainlink Functions router address
    address public functionsRouter;

    /// @dev Subscription ID for Chainlink Functions
    uint64 public subscriptionId;

    /// @dev DON (Decentralized Oracle Network) ID
    bytes32 public donId;

    /// @dev Gas limit for callback execution
    uint32 public callbackGasLimit = 300_000;

    /// @dev AI Yield Engine to forward results to
    address public aiYieldEngine;

    /// @dev JavaScript source code for different inference types
    mapping(InferenceType => string) public sourceCodes;

    /// @dev Pending request tracking
    mapping(bytes32 => RequestData) public pendingRequests;

    /// @dev Request history per asset
    mapping(address => bytes32[]) public requestHistory;

    /// @dev Total requests made
    uint256 public totalRequests;

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    enum InferenceType {
        YIELD_PREDICTION,
        RISK_ASSESSMENT,
        RATE_OPTIMIZATION,
        MARKET_ANALYSIS
    }

    struct RequestData {
        address requester; // Who initiated the request
        address targetAsset; // Asset the inference is about
        InferenceType inferenceType;
        uint256 timestamp; // When request was sent
        bool isFulfilled; // Whether response was received
        bytes response; // Raw response data
        bytes error; // Error data if any
    }

    struct InferenceResult {
        uint256 predictedAPY; // Predicted APY in RAY
        uint256 riskScore; // Risk score (0-10000)
        uint256 confidence; // Confidence level (0-10000)
        uint256 recommendedBaseRate; // Recommended base rate in RAY
        uint256 recommendedSlope1; // Recommended slope1 in RAY
        uint256 recommendedSlope2; // Recommended slope2 in RAY
        uint256 recommendedOptimalUtil; // Recommended optimal utilization in RAY
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event RequestSent(
        bytes32 indexed requestId,
        address indexed asset,
        InferenceType indexed inferenceType
    );
    event RequestFulfilled(
        bytes32 indexed requestId,
        bytes response,
        bytes error
    );
    event InferenceResultProcessed(
        bytes32 indexed requestId,
        address indexed asset,
        uint256 predictedAPY,
        uint256 riskScore,
        uint256 confidence
    );
    event SourceCodeUpdated(InferenceType indexed inferenceType);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address functionsRouter_,
        uint64 subscriptionId_,
        bytes32 donId_,
        address aiYieldEngine_
    ) Ownable(initialOwner) {
        functionsRouter = functionsRouter_;
        subscriptionId = subscriptionId_;
        donId = donId_;
        aiYieldEngine = aiYieldEngine_;
    }

    // ============================================================
    //              CHAINLINK FUNCTIONS: SEND REQUEST
    // ============================================================

    /**
     * @notice Send an AI inference request via Chainlink Functions.
     * @dev Encodes the request and sends it to the Chainlink Functions router.
     *
     * @param asset The asset to get predictions for
     * @param inferenceType The type of AI inference to perform
     * @param args Additional arguments for the AI model (e.g., time horizon)
     * @return requestId The Chainlink Functions request ID
     */
    function sendRequest(
        address asset,
        InferenceType inferenceType,
        string[] calldata args
    ) external returns (bytes32) {
        require(
            bytes(sourceCodes[inferenceType]).length > 0,
            "Source not configured"
        );

        // Build the request
        bytes32 requestId = keccak256(
            abi.encode(asset, inferenceType, block.timestamp, totalRequests)
        );

        // Store pending request
        pendingRequests[requestId] = RequestData({
            requester: msg.sender,
            targetAsset: asset,
            inferenceType: inferenceType,
            timestamp: block.timestamp,
            isFulfilled: false,
            response: "",
            error: ""
        });

        requestHistory[asset].push(requestId);
        totalRequests++;

        // In production, this would call:
        // FunctionsRequest.Request memory req;
        // req.initializeRequestForInlineJavaScript(sourceCodes[inferenceType]);
        // req.setArgs(args);
        // bytes32 reqId = _sendRequest(req.encodeCBOR(), subscriptionId, callbackGasLimit, donId);

        emit RequestSent(requestId, asset, inferenceType);
        return requestId;
    }

    // ============================================================
    //          CHAINLINK FUNCTIONS: FULFILL CALLBACK
    // ============================================================

    /**
     * @notice Callback function for Chainlink Functions to deliver results.
     * @dev In production, this would override FunctionsClient.fulfillRequest().
     *      For the hackathon, it's callable by authorized addresses.
     *
     * @param requestId The request being fulfilled
     * @param response The response bytes from the AI model
     * @param err Error bytes (empty if successful)
     */
    function fulfillRequest(
        bytes32 requestId,
        bytes calldata response,
        bytes calldata err
    ) external {
        // In production: only Chainlink Functions router can call this
        // require(msg.sender == functionsRouter, "Only router");

        RequestData storage request = pendingRequests[requestId];
        require(!request.isFulfilled, "Already fulfilled");

        request.isFulfilled = true;
        request.response = response;
        request.error = err;

        emit RequestFulfilled(requestId, response, err);

        // Process the response if successful
        if (err.length == 0 && response.length > 0) {
            _processResponse(requestId, request.targetAsset, response);
        }
    }

    /**
     * @notice Process AI model response and forward to AIYieldEngine.
     */
    function _processResponse(
        bytes32 requestId,
        address asset,
        bytes memory response
    ) internal {
        // Decode the response
        // Expected format: abi.encode(predictedAPY, riskScore, confidence, baseRate, slope1, slope2, optimalUtil)
        InferenceResult memory result = abi.decode(response, (InferenceResult));

        // Forward prediction to AIYieldEngine
        if (aiYieldEngine != address(0)) {
            IAIYieldEngineForFunctions(aiYieldEngine).receivePrediction(
                asset,
                result.predictedAPY,
                result.riskScore,
                result.confidence,
                address(this), // agent = this contract
                keccak256(response) // proof hash
            );

            // If rate optimization, also submit rate recommendation
            if (result.recommendedBaseRate > 0) {
                IAIYieldEngineForFunctions(aiYieldEngine)
                    .submitRateRecommendation(
                        asset,
                        result.recommendedBaseRate,
                        result.recommendedSlope1,
                        result.recommendedSlope2,
                        result.recommendedOptimalUtil,
                        result.confidence
                    );
            }
        }

        emit InferenceResultProcessed(
            requestId,
            asset,
            result.predictedAPY,
            result.riskScore,
            result.confidence
        );
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Set the JavaScript source code for an inference type.
     * @dev The source code is the JS that runs in the Chainlink Functions DON.
     */
    function setSourceCode(
        InferenceType inferenceType,
        string calldata source
    ) external onlyOwner {
        sourceCodes[inferenceType] = source;
        emit SourceCodeUpdated(inferenceType);
    }

    function setFunctionsRouter(address router) external onlyOwner {
        functionsRouter = router;
    }

    function setSubscriptionId(uint64 subId) external onlyOwner {
        subscriptionId = subId;
    }

    function setDonId(bytes32 donId_) external onlyOwner {
        donId = donId_;
    }

    function setCallbackGasLimit(uint32 gasLimit) external onlyOwner {
        callbackGasLimit = gasLimit;
    }

    function setAIYieldEngine(address engine) external onlyOwner {
        aiYieldEngine = engine;
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getRequestData(
        bytes32 requestId
    ) external view returns (RequestData memory) {
        return pendingRequests[requestId];
    }

    function getRequestHistoryCount(
        address asset
    ) external view returns (uint256) {
        return requestHistory[asset].length;
    }

    function getLatestRequestId(address asset) external view returns (bytes32) {
        uint256 len = requestHistory[asset].length;
        require(len > 0, "No requests");
        return requestHistory[asset][len - 1];
    }
}

// ============================================================
//         INTERFACE FOR AI YIELD ENGINE
// ============================================================

interface IAIYieldEngineForFunctions {
    function receivePrediction(
        address asset,
        uint256 predictedAPY,
        uint256 riskScore,
        uint256 confidence,
        address agentId,
        bytes32 proofHash
    ) external;

    function submitRateRecommendation(
        address asset,
        uint256 baseRate,
        uint256 rateSlope1,
        uint256 rateSlope2,
        uint256 optimalUtilization,
        uint256 confidence
    ) external;
}
