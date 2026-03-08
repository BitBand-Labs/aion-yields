// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPolicy.sol";
import "./IPolicyEngine.sol";

/**
 * @title PolicyEngine
 * @author ChainNomads (AION Yield)
 * @notice Central Chainlink ACE compliance engine for AION Yield.
 *
 * @dev Orchestrates multiple pluggable policies that validate AI agent actions
 *      before they execute on-chain. Policies are registered per target contract
 *      and function selector, enabling granular control.
 *
 *      ARCHITECTURE:
 *      ┌──────────────────────────────────────────────────────┐
 *      │                    PolicyEngine                       │
 *      │                                                      │
 *      │  ┌─────────────────────────────────────────────┐     │
 *      │  │  Policy Registry                            │     │
 *      │  │  target + selector → [Policy1, Policy2, …]  │     │
 *      │  └─────────────────────────────────────────────┘     │
 *      │                                                      │
 *      │  validateAction() → loops all policies               │
 *      │  recordExecution() → updates stateful policies       │
 *      └──────────────────────────────────────────────────────┘
 *
 *      INTEGRATION POINTS:
 *      - GovernanceController can add/remove/swap policies without redeployment
 *      - PolicyProtected modifier on AI contracts calls validateAction() pre-execution
 *      - Supports both stateless (signature check) and stateful (rate limit) policies
 */
contract PolicyEngine is IPolicyEngine, Ownable {
    // ============================================================
    //                        STORAGE
    // ============================================================

    /// @dev Policies registered for a specific target+selector combination
    /// keccak256(target, selector) => array of policy addresses
    mapping(bytes32 => address[]) internal _policies;

    /// @dev Global policies that apply to ALL target+selector combinations
    address[] internal _globalPolicies;

    /// @dev Whether an address is authorized to call recordExecution
    /// (PolicyProtected contracts register themselves here)
    mapping(address => bool) public authorizedCallers;

    /// @dev Whether the engine is active (kill switch for emergencies)
    bool public engineActive = true;

    /// @dev Governance controller that can manage policies
    address public governanceController;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event PolicyAdded(address indexed target, bytes4 indexed selector, address indexed policy);
    event PolicyRemoved(address indexed target, bytes4 indexed selector, address indexed policy);
    event GlobalPolicyAdded(address indexed policy);
    event GlobalPolicyRemoved(address indexed policy);
    event EngineToggled(bool active);
    event GovernanceControllerSet(address indexed controller);
    event CallerAuthorized(address indexed caller, bool authorized);

    // ============================================================
    //                      MODIFIERS
    // ============================================================

    modifier onlyGovernance() {
        require(
            msg.sender == owner() || msg.sender == governanceController,
            "PolicyEngine: not authorized"
        );
        _;
    }

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================
    //              POLICY MANAGEMENT (Governance)
    // ============================================================

    /**
     * @notice Register a policy for a specific target contract + function selector.
     * @dev Called by GovernanceController or owner to add compliance rules.
     * @param target The contract address the policy applies to
     * @param selector The function selector the policy applies to
     * @param policy The IPolicy-compliant contract address
     */
    function addPolicy(
        address target,
        bytes4 selector,
        address policy
    ) external onlyGovernance {
        require(policy != address(0), "PolicyEngine: zero address");
        bytes32 key = _policyKey(target, selector);
        _policies[key].push(policy);
        emit PolicyAdded(target, selector, policy);
    }

    /**
     * @notice Remove a policy from a specific target+selector.
     * @param target The contract address
     * @param selector The function selector
     * @param policy The policy to remove
     */
    function removePolicy(
        address target,
        bytes4 selector,
        address policy
    ) external onlyGovernance {
        bytes32 key = _policyKey(target, selector);
        address[] storage policies = _policies[key];
        for (uint256 i = 0; i < policies.length; i++) {
            if (policies[i] == policy) {
                policies[i] = policies[policies.length - 1];
                policies.pop();
                emit PolicyRemoved(target, selector, policy);
                return;
            }
        }
        revert("PolicyEngine: policy not found");
    }

    /**
     * @notice Add a global policy that applies to all actions.
     * @param policy The IPolicy-compliant contract address
     */
    function addGlobalPolicy(address policy) external onlyGovernance {
        require(policy != address(0), "PolicyEngine: zero address");
        _globalPolicies.push(policy);
        emit GlobalPolicyAdded(policy);
    }

    /**
     * @notice Remove a global policy.
     * @param policy The policy to remove
     */
    function removeGlobalPolicy(address policy) external onlyGovernance {
        for (uint256 i = 0; i < _globalPolicies.length; i++) {
            if (_globalPolicies[i] == policy) {
                _globalPolicies[i] = _globalPolicies[_globalPolicies.length - 1];
                _globalPolicies.pop();
                emit GlobalPolicyRemoved(policy);
                return;
            }
        }
        revert("PolicyEngine: policy not found");
    }

    // ============================================================
    //              CORE: ACTION VALIDATION
    // ============================================================

    /**
     * @notice Validates an action against all applicable policies.
     * @dev Checks global policies first, then target+selector-specific policies.
     *      ALL policies must pass for the action to be considered valid.
     */
    function validateAction(
        address caller,
        address target,
        bytes4 selector,
        bytes calldata data
    ) external view override returns (bool valid, string memory reason) {
        // If engine is disabled, all actions pass (emergency bypass)
        if (!engineActive) return (true, "");

        // Check global policies
        for (uint256 i = 0; i < _globalPolicies.length; i++) {
            IPolicy policy = IPolicy(_globalPolicies[i]);
            if (!policy.isActive()) continue;

            (bool passed, string memory failReason) = policy.validate(caller, target, selector, data);
            if (!passed) {
                return (false, string.concat("[", policy.policyName(), "] ", failReason));
            }
        }

        // Check target+selector-specific policies
        bytes32 key = _policyKey(target, selector);
        address[] storage policies = _policies[key];
        for (uint256 i = 0; i < policies.length; i++) {
            IPolicy policy = IPolicy(policies[i]);
            if (!policy.isActive()) continue;

            (bool passed, string memory failReason) = policy.validate(caller, target, selector, data);
            if (!passed) {
                return (false, string.concat("[", policy.policyName(), "] ", failReason));
            }
        }

        return (true, "");
    }

    /**
     * @notice Records a successful execution for stateful policy updates.
     * @dev Called by PolicyProtected contracts after the guarded function executes.
     */
    function recordExecution(
        address caller,
        address target,
        bytes4 selector,
        bytes calldata data
    ) external override {
        require(authorizedCallers[msg.sender], "PolicyEngine: unauthorized recorder");
        if (!engineActive) return;

        // Update global policies
        for (uint256 i = 0; i < _globalPolicies.length; i++) {
            IPolicy policy = IPolicy(_globalPolicies[i]);
            if (policy.isActive()) {
                policy.postExecutionUpdate(caller, target, selector, data);
            }
        }

        // Update target+selector-specific policies
        bytes32 key = _policyKey(target, selector);
        address[] storage policies = _policies[key];
        for (uint256 i = 0; i < policies.length; i++) {
            IPolicy policy = IPolicy(policies[i]);
            if (policy.isActive()) {
                policy.postExecutionUpdate(caller, target, selector, data);
            }
        }
    }

    // ============================================================
    //                   ADMIN FUNCTIONS
    // ============================================================

    function setGovernanceController(address controller) external onlyOwner {
        governanceController = controller;
        emit GovernanceControllerSet(controller);
    }

    function setAuthorizedCaller(address caller, bool authorized) external onlyGovernance {
        authorizedCallers[caller] = authorized;
        emit CallerAuthorized(caller, authorized);
    }

    function setEngineActive(bool active) external onlyGovernance {
        engineActive = active;
        emit EngineToggled(active);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getPolicies(
        address target,
        bytes4 selector
    ) external view returns (address[] memory) {
        return _policies[_policyKey(target, selector)];
    }

    function getGlobalPolicies() external view returns (address[] memory) {
        return _globalPolicies;
    }

    function getPolicyCount(
        address target,
        bytes4 selector
    ) external view returns (uint256) {
        return _policies[_policyKey(target, selector)].length;
    }

    // ============================================================
    //                     INTERNALS
    // ============================================================

    function _policyKey(address target, bytes4 selector) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(target, selector));
    }
}
