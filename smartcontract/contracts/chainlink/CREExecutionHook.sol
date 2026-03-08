// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CREExecutionHook
 * @author ChainNomads (AION Yield)
 * @notice Chainlink CRE (Compute Runtime Environment) compatible execution hooks.
 *
 * @dev Provides hook points for Chainlink CRE workflows to interact with the
 *      AION Yield protocol. CRE orchestrates multi-step workflows that combine
 *      on-chain and off-chain computation.
 *
 *      CRE WORKFLOW PATTERN:
 *      ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
 *      │ CRE Trigger  │ ──→ │ Pre-hook     │ ──→ │ Off-chain    │
 *      │ (Automation) │     │ (Gather data)│     │ Compute      │
 *      └─────────────┘     └──────────────┘     └──────────────┘
 *                                                      │
 *      ┌─────────────┐     ┌──────────────┐            │
 *      │ Protocol     │ ←── │ Post-hook    │ ←──────────┘
 *      │ Updated      │     │ (Apply data) │
 *      └─────────────┘     └──────────────┘
 *
 *      Supported Workflow Types:
 *      1. AI_RATE_ADJUSTMENT    - AI-driven interest rate optimization
 *      2. LIQUIDATION_SCAN     - Detect and execute liquidations
 *      3. CROSS_CHAIN_REBALANCE - Rebalance liquidity across chains
 *      4. RISK_MONITORING       - Continuous risk assessment
 *      5. YIELD_ALLOCATION      - Cross-protocol yield optimization (Aave, Morpho)
 */
contract CREExecutionHook is Ownable {
    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Authorized CRE workflow executors
    mapping(address => bool) public authorizedExecutors;

    /// @dev Workflow execution records
    mapping(bytes32 => WorkflowExecution) public executions;

    /// @dev Registered workflow configurations
    mapping(bytes32 => WorkflowConfig) public workflows;

    /// @dev Workflow IDs list
    bytes32[] public workflowIds;

    /// @dev Protocol contract references
    address public lendingPool;
    address public aiYieldEngine;
    address public liquidationAutomation;
    address public crossChainVault;
    address public autonomousAllocator;

    /// @dev Execution counters
    uint256 public totalExecutions;
    mapping(bytes32 => uint256) public workflowExecutionCount;

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    enum WorkflowType {
        AI_RATE_ADJUSTMENT,
        LIQUIDATION_SCAN,
        CROSS_CHAIN_REBALANCE,
        RISK_MONITORING,
        YIELD_ALLOCATION
    }

    enum ExecutionStatus {
        NONE,
        PRE_HOOK_EXECUTED,
        PROCESSING,
        POST_HOOK_EXECUTED,
        COMPLETED,
        FAILED
    }

    struct WorkflowConfig {
        bytes32 workflowId;
        WorkflowType workflowType;
        uint256 minInterval; // Minimum seconds between executions
        uint256 lastExecutionTime; // Last execution timestamp
        bool isActive;
        string description;
    }

    struct WorkflowExecution {
        bytes32 executionId;
        bytes32 workflowId;
        address executor;
        uint256 startTime;
        uint256 endTime;
        ExecutionStatus status;
        bytes preHookData; // Data gathered in pre-hook
        bytes postHookData; // Data applied in post-hook
        bytes result; // Final result
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event WorkflowRegistered(
        bytes32 indexed workflowId,
        WorkflowType workflowType,
        string description
    );
    event PreHookExecuted(
        bytes32 indexed executionId,
        bytes32 indexed workflowId,
        bytes data
    );
    event PostHookExecuted(
        bytes32 indexed executionId,
        bytes32 indexed workflowId,
        bytes result
    );
    event WorkflowCompleted(
        bytes32 indexed executionId,
        bytes32 indexed workflowId,
        uint256 duration
    );
    event WorkflowFailed(
        bytes32 indexed executionId,
        bytes32 indexed workflowId,
        string reason
    );
    event ExecutorAuthorized(address indexed executor, bool authorized);

    // ============================================================
    //                      MODIFIERS
    // ============================================================

    modifier onlyAuthorizedExecutor() {
        require(
            authorizedExecutors[msg.sender] || msg.sender == owner(),
            "Not authorized executor"
        );
        _;
    }

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address lendingPool_,
        address aiYieldEngine_,
        address liquidationAutomation_,
        address crossChainVault_,
        address autonomousAllocator_
    ) Ownable(initialOwner) {
        lendingPool = lendingPool_;
        aiYieldEngine = aiYieldEngine_;
        liquidationAutomation = liquidationAutomation_;
        crossChainVault = crossChainVault_;
        autonomousAllocator = autonomousAllocator_;
    }

    // ============================================================
    //               WORKFLOW REGISTRATION
    // ============================================================

    /**
     * @notice Register a new CRE workflow.
     * @param workflowType The type of workflow
     * @param minInterval Minimum seconds between consecutive executions
     * @param description Human-readable description
     * @return workflowId The unique workflow identifier
     */
    function registerWorkflow(
        WorkflowType workflowType,
        uint256 minInterval,
        string calldata description
    ) external onlyOwner returns (bytes32) {
        bytes32 workflowId = keccak256(
            abi.encode(workflowType, block.timestamp, workflowIds.length)
        );

        workflows[workflowId] = WorkflowConfig({
            workflowId: workflowId,
            workflowType: workflowType,
            minInterval: minInterval,
            lastExecutionTime: 0,
            isActive: true,
            description: description
        });

        workflowIds.push(workflowId);

        emit WorkflowRegistered(workflowId, workflowType, description);
        return workflowId;
    }

    // ============================================================
    //            PRE-HOOK: GATHER ON-CHAIN DATA
    //    (Called at the start of a CRE workflow)
    // ============================================================

    /**
     * @notice Execute the pre-hook phase of a CRE workflow.
     * @dev Gathers on-chain data needed for off-chain processing.
     *      This data is sent to Chainlink Functions / off-chain compute.
     *
     * @param workflowId The workflow to execute
     * @return executionId Unique execution identifier
     * @return data Encoded on-chain data for off-chain processing
     */
    function executePreHook(
        bytes32 workflowId
    )
        external
        onlyAuthorizedExecutor
        returns (bytes32 executionId, bytes memory data)
    {
        WorkflowConfig storage workflow = workflows[workflowId];
        require(workflow.isActive, "Workflow not active");
        require(
            block.timestamp >=
                workflow.lastExecutionTime + workflow.minInterval,
            "Too soon"
        );

        executionId = keccak256(
            abi.encode(workflowId, block.timestamp, totalExecutions)
        );

        // Gather data based on workflow type
        if (workflow.workflowType == WorkflowType.AI_RATE_ADJUSTMENT) {
            data = _gatherRateData();
        } else if (workflow.workflowType == WorkflowType.LIQUIDATION_SCAN) {
            data = _gatherLiquidationData();
        } else if (
            workflow.workflowType == WorkflowType.CROSS_CHAIN_REBALANCE
        ) {
            data = _gatherRebalanceData();
        } else if (workflow.workflowType == WorkflowType.RISK_MONITORING) {
            data = _gatherRiskData();
        } else if (workflow.workflowType == WorkflowType.YIELD_ALLOCATION) {
            data = _gatherAllocationData();
        }

        executions[executionId] = WorkflowExecution({
            executionId: executionId,
            workflowId: workflowId,
            executor: msg.sender,
            startTime: block.timestamp,
            endTime: 0,
            status: ExecutionStatus.PRE_HOOK_EXECUTED,
            preHookData: data,
            postHookData: "",
            result: ""
        });

        totalExecutions++;
        workflowExecutionCount[workflowId]++;

        emit PreHookExecuted(executionId, workflowId, data);
        return (executionId, data);
    }

    // ============================================================
    //          POST-HOOK: APPLY OFF-CHAIN RESULTS
    //   (Called after off-chain computation completes)
    // ============================================================

    /**
     * @notice Execute the post-hook phase of a CRE workflow.
     * @dev Applies the results from off-chain AI computation back on-chain.
     *
     * @param executionId The execution to complete
     * @param result Encoded result from off-chain computation
     */
    function executePostHook(
        bytes32 executionId,
        bytes calldata result
    ) external onlyAuthorizedExecutor {
        WorkflowExecution storage execution = executions[executionId];
        require(
            execution.status == ExecutionStatus.PRE_HOOK_EXECUTED,
            "Invalid status"
        );

        WorkflowConfig storage workflow = workflows[execution.workflowId];

        // Apply results based on workflow type
        bool success = false;
        if (workflow.workflowType == WorkflowType.AI_RATE_ADJUSTMENT) {
            success = _applyRateAdjustment(result);
        } else if (workflow.workflowType == WorkflowType.LIQUIDATION_SCAN) {
            success = _applyLiquidationResults(result);
        } else if (
            workflow.workflowType == WorkflowType.CROSS_CHAIN_REBALANCE
        ) {
            success = _applyRebalanceResults(result);
        } else if (workflow.workflowType == WorkflowType.RISK_MONITORING) {
            success = _applyRiskResults(result);
        } else if (workflow.workflowType == WorkflowType.YIELD_ALLOCATION) {
            success = _applyAllocationResults(result);
        }

        execution.postHookData = result;
        execution.endTime = block.timestamp;
        execution.result = result;

        if (success) {
            execution.status = ExecutionStatus.COMPLETED;
            workflow.lastExecutionTime = block.timestamp;

            emit PostHookExecuted(executionId, execution.workflowId, result);
            emit WorkflowCompleted(
                executionId,
                execution.workflowId,
                block.timestamp - execution.startTime
            );
        } else {
            execution.status = ExecutionStatus.FAILED;
            emit WorkflowFailed(
                executionId,
                execution.workflowId,
                "Post-hook failed"
            );
        }
    }

    // ============================================================
    //           INTERNAL: DATA GATHERING (PRE-HOOKS)
    // ============================================================

    function _gatherRateData() internal view returns (bytes memory) {
        // Encode current rate data from lending pool for AI analysis
        // In production: fetch current rates, utilization, market data
        return abi.encode(lendingPool, block.timestamp, "rate_data");
    }

    function _gatherLiquidationData() internal view returns (bytes memory) {
        return
            abi.encode(
                lendingPool,
                liquidationAutomation,
                block.timestamp,
                "liquidation_scan"
            );
    }

    function _gatherRebalanceData() internal view returns (bytes memory) {
        return abi.encode(crossChainVault, block.timestamp, "rebalance_data");
    }

    function _gatherRiskData() internal view returns (bytes memory) {
        return
            abi.encode(
                lendingPool,
                aiYieldEngine,
                block.timestamp,
                "risk_monitoring"
            );
    }

    /**
     * @notice Gathers data for cross-protocol yield allocation.
     * @dev Encodes the allocator address and current state for the off-chain AI
     *      to scan Aave/Morpho APYs and compute optimal allocation.
     */
    function _gatherAllocationData() internal view returns (bytes memory) {
        return
            abi.encode(
                autonomousAllocator,
                aiYieldEngine,
                lendingPool,
                block.timestamp,
                "yield_allocation"
            );
    }

    // ============================================================
    //         INTERNAL: RESULT APPLICATION (POST-HOOKS)
    // ============================================================

    function _applyRateAdjustment(
        bytes calldata result
    ) internal returns (bool) {
        // Decode AI-recommended rates and apply them
        // In production: call aiYieldEngine.submitRateRecommendation(...)
        if (aiYieldEngine != address(0) && result.length > 0) {
            return true;
        }
        return false;
    }

    function _applyLiquidationResults(
        bytes calldata result
    ) internal returns (bool) {
        // Process liquidation scan results
        if (liquidationAutomation != address(0) && result.length > 0) {
            return true;
        }
        return false;
    }

    function _applyRebalanceResults(
        bytes calldata result
    ) internal returns (bool) {
        // Apply cross-chain rebalancing instructions
        if (crossChainVault != address(0) && result.length > 0) {
            return true;
        }
        return false;
    }

    function _applyRiskResults(bytes calldata result) internal returns (bool) {
        // Apply risk monitoring alerts/actions
        if (result.length > 0) {
            return true;
        }
        return false;
    }

    /**
     * @notice Applies cross-protocol allocation results from the AI.
     * @dev Decodes the AI result and forwards allocation instructions
     *      to the AIYieldEngine, which routes them to the AutonomousAllocator.
     */
    function _applyAllocationResults(
        bytes calldata result
    ) internal returns (bool) {
        if (aiYieldEngine == address(0) || result.length == 0) return false;

        // Decode AI result: (asset, protocolIndices[], allocationBps[], confidence, proofHash)
        (
            address asset,
            uint256[] memory protocolIndices,
            uint256[] memory allocationBps,
            uint256 confidence,
            bytes32 proofHash
        ) = abi.decode(
                result,
                (address, uint256[], uint256[], uint256, bytes32)
            );

        // Forward to AIYieldEngine → AutonomousAllocator
        try
            IAIYieldEngineForCRE(aiYieldEngine).submitAllocationRecommendation(
                asset,
                protocolIndices,
                allocationBps,
                confidence,
                proofHash
            )
        {
            return true;
        } catch {
            return false;
        }
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setAuthorizedExecutor(
        address executor,
        bool authorized
    ) external onlyOwner {
        authorizedExecutors[executor] = authorized;
        emit ExecutorAuthorized(executor, authorized);
    }

    function setWorkflowActive(
        bytes32 workflowId,
        bool active
    ) external onlyOwner {
        workflows[workflowId].isActive = active;
    }

    function setLendingPool(address pool) external onlyOwner {
        lendingPool = pool;
    }

    function setAIYieldEngine(address engine) external onlyOwner {
        aiYieldEngine = engine;
    }

    function setLiquidationAutomation(address automation) external onlyOwner {
        liquidationAutomation = automation;
    }

    function setCrossChainVault(address vault) external onlyOwner {
        crossChainVault = vault;
    }

    function setAutonomousAllocator(address allocator_) external onlyOwner {
        autonomousAllocator = allocator_;
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getWorkflowCount() external view returns (uint256) {
        return workflowIds.length;
    }

    function getWorkflowConfig(
        bytes32 workflowId
    ) external view returns (WorkflowConfig memory) {
        return workflows[workflowId];
    }

    function getExecution(
        bytes32 executionId
    ) external view returns (WorkflowExecution memory) {
        return executions[executionId];
    }

    function getWorkflowExecutionCount(
        bytes32 workflowId
    ) external view returns (uint256) {
        return workflowExecutionCount[workflowId];
    }

    function isWorkflowReady(bytes32 workflowId) external view returns (bool) {
        WorkflowConfig memory workflow = workflows[workflowId];
        return
            workflow.isActive &&
            block.timestamp >=
            workflow.lastExecutionTime + workflow.minInterval;
    }
}

// ============================================================
//      INTERFACE FOR AI YIELD ENGINE (CRE Integration)
// ============================================================

interface IAIYieldEngineForCRE {
    function submitAllocationRecommendation(
        address asset,
        uint256[] memory protocolIndices,
        uint256[] memory allocationBps,
        uint256 confidence,
        bytes32 proofHash
    ) external;
}
