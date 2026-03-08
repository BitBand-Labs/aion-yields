// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./IPolicyEngine.sol";

/**
 * @title PolicyProtected
 * @author ChainNomads (AION Yield)
 * @notice Abstract base contract that enforces Chainlink ACE policy checks on protected functions.
 *
 * @dev Contracts inherit this to gate critical functions behind PolicyEngine validation.
 *      The `policyCheck` modifier:
 *      1. Calls PolicyEngine.validateAction() BEFORE the function body
 *      2. Executes the function body if validation passes
 *      3. Calls PolicyEngine.recordExecution() AFTER successful execution
 *
 *      USAGE:
 *      ```solidity
 *      contract AIYieldEngine is PolicyProtected {
 *          function submitRateRecommendation(...) external policyCheck(policyData) {
 *              // Only executes if all policies pass
 *          }
 *      }
 *      ```
 */
abstract contract PolicyProtected {
    /// @dev The PolicyEngine that validates actions
    address public policyEngine;

    /// @dev Whether policy enforcement is enabled (can be disabled in emergencies)
    bool public policyEnforcementEnabled;

    event PolicyEngineSet(address indexed engine);
    event PolicyEnforcementToggled(bool enabled);
    event PolicyValidationFailed(address indexed caller, bytes4 selector, string reason);

    /**
     * @notice Modifier that enforces policy validation before execution.
     * @param policyData Encoded data passed to the policy for validation
     *        (e.g., abi.encode(paramsHash) for CertifiedAction, abi.encode(amount, tvl) for VolumeRate)
     */
    modifier policyCheck(bytes memory policyData) {
        if (policyEnforcementEnabled && policyEngine != address(0)) {
            (bool valid, string memory reason) = IPolicyEngine(policyEngine).validateAction(
                msg.sender,
                address(this),
                msg.sig,
                policyData
            );

            if (!valid) {
                emit PolicyValidationFailed(msg.sender, msg.sig, reason);
                revert(string.concat("ACE Policy violation: ", reason));
            }
        }

        _;

        // Record execution for stateful policies (e.g., VolumeRatePolicy window updates)
        if (policyEnforcementEnabled && policyEngine != address(0)) {
            // Wrapped in try/catch so policy recording failure doesn't revert the action
            try IPolicyEngine(policyEngine).recordExecution(
                msg.sender,
                address(this),
                msg.sig,
                policyData
            ) {} catch {}
        }
    }

    /**
     * @notice Set the PolicyEngine address.
     * @dev Must be overridden with appropriate access control.
     */
    function _setPolicyEngine(address engine) internal {
        policyEngine = engine;
        emit PolicyEngineSet(engine);
    }

    /**
     * @notice Toggle policy enforcement.
     * @dev Must be overridden with appropriate access control.
     */
    function _setPolicyEnforcement(bool enabled) internal {
        policyEnforcementEnabled = enabled;
        emit PolicyEnforcementToggled(enabled);
    }
}
