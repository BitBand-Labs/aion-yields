// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CREExecutionHook
 * @author ChainNomads (AION Finance)
 * @notice Chainlink CRE (Compute Runtime Environment) compatible execution hooks.
 *
 * @dev Provides hook points for Chainlink CRE workflows to interact with the
 *      AION Finance yield optimization protocol.
 *
 *      CRE WORKFLOW PATTERN:
 *      ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
 *      │ CRE Trigger  │ --> │ Pre-hook     │ --> │ Off-chain    │
 *      │ (Automation) │     │ (Gather data)│     │ Compute      │
 *      └─────────────┘     └──────────────┘     └──────────────┘
 *                                                      │
 *      ┌─────────────┐     ┌──────────────┐            │
 *      │ Protocol     │ <-- │ Post-hook    │ <----------┘
 *      │ Updated      │     │ (Apply data) │
 *      └─────────────┘     └──────────────┘
 *
 *      Supported Workflow Types:
 *      1. YIELD_ALLOCATION      - AI-driven strategy allocation optimization
 *      2. STRATEGY_HARVEST      - Trigger strategy harvest/report
 *      3. CROSS_CHAIN_REBALANCE - Rebalance liquidity across chains
 *      4. RISK_MONITORING       - Continuous risk assessment
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
    address public aionVault;
    address public aiYieldEngine;
    address public crossChainVault;
    address public autonomousAllocator;

    /// @dev Execution counters
    uint256 public totalExecutions;
    mapping(bytes32 => uint256) public workflowExecutionCount;

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    enum WorkflowType {
        YIELD_ALLOCATION,
        STRATEGY_HARVEST,
        CROSS_CHAIN_REBALANCE,
        RISK_MONITORING
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
        uint256 minInterval;
        uint256 lastExecutionTime;
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
        bytes preHookData;
        bytes postHookData;
        bytes result;
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
        address aionVault_,
        address aiYieldEngine_,
        address crossChainVault_,
        address autonomousAllocator_
    ) Ownable(initialOwner) {
        aionVault = aionVault_;
        aiYieldEngine = aiYieldEngine_;
        crossChainVault = crossChainVault_;
        autonomousAllocator = autonomousAllocator_;
    }

    // ============================================================
    //               WORKFLOW REGISTRATION
    // ============================================================

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
    // ============================================================

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

        if (workflow.workflowType == WorkflowType.YIELD_ALLOCATION) {
            data = _gatherAllocationData();
        } else if (workflow.workflowType == WorkflowType.STRATEGY_HARVEST) {
            data = _gatherHarvestData();
        } else if (workflow.workflowType == WorkflowType.CROSS_CHAIN_REBALANCE) {
            data = _gatherRebalanceData();
        } else if (workflow.workflowType == WorkflowType.RISK_MONITORING) {
            data = _gatherRiskData();
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
    // ============================================================

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

        bool success = false;
        if (workflow.workflowType == WorkflowType.YIELD_ALLOCATION) {
            success = _applyAllocationResults(result);
        } else if (workflow.workflowType == WorkflowType.STRATEGY_HARVEST) {
            success = _applyHarvestResults(result);
        } else if (workflow.workflowType == WorkflowType.CROSS_CHAIN_REBALANCE) {
            success = _applyRebalanceResults(result);
        } else if (workflow.workflowType == WorkflowType.RISK_MONITORING) {
            success = _applyRiskResults(result);
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

    function _gatherAllocationData() internal view returns (bytes memory) {
        return abi.encode(
            autonomousAllocator,
            aiYieldEngine,
            aionVault,
            block.timestamp,
            "yield_allocation"
        );
    }

    function _gatherHarvestData() internal view returns (bytes memory) {
        return abi.encode(
            aionVault,
            aiYieldEngine,
            block.timestamp,
            "strategy_harvest"
        );
    }

    function _gatherRebalanceData() internal view returns (bytes memory) {
        return abi.encode(crossChainVault, block.timestamp, "rebalance_data");
    }

    function _gatherRiskData() internal view returns (bytes memory) {
        return abi.encode(
            aionVault,
            aiYieldEngine,
            block.timestamp,
            "risk_monitoring"
        );
    }

    // ============================================================
    //         INTERNAL: RESULT APPLICATION (POST-HOOKS)
    // ============================================================

    function _applyAllocationResults(
        bytes calldata result
    ) internal returns (bool) {
        if (aiYieldEngine == address(0) || result.length == 0) return false;

        // Decode: (asset, strategies[], targetDebts[], confidence, proofHash)
        (
            address asset,
            address[] memory strategies,
            uint256[] memory targetDebts,
            uint256 confidence,
            bytes32 proofHash
        ) = abi.decode(
                result,
                (address, address[], uint256[], uint256, bytes32)
            );

        try
            IAIYieldEngineForCRE(aiYieldEngine).submitAllocationRecommendation(
                asset,
                strategies,
                targetDebts,
                confidence,
                proofHash
            )
        {
            return true;
        } catch {
            return false;
        }
    }

    function _applyHarvestResults(
        bytes calldata result
    ) internal returns (bool) {
        if (aiYieldEngine == address(0) || result.length == 0) return false;

        // Decode: list of strategy addresses to harvest
        address[] memory strategies = abi.decode(result, (address[]));

        try
            IAIYieldEngineForCRE(aiYieldEngine).triggerBatchHarvest(strategies)
        {
            return true;
        } catch {
            return false;
        }
    }

    function _applyRebalanceResults(
        bytes calldata result
    ) internal view returns (bool) {
        if (crossChainVault == address(0) || result.length == 0) return false;
        return true;
    }

    function _applyRiskResults(
        bytes calldata result
    ) internal pure returns (bool) {
        if (result.length > 0) {
            return true;
        }
        return false;
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

    function setAionVault(address vault_) external onlyOwner {
        aionVault = vault_;
    }

    function setAIYieldEngine(address engine) external onlyOwner {
        aiYieldEngine = engine;
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
        address[] memory strategies,
        uint256[] memory targetDebts,
        uint256 confidence,
        bytes32 proofHash
    ) external;

    function triggerBatchHarvest(address[] memory strategies) external;
}
