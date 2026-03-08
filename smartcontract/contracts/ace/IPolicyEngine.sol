// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPolicyEngine
 * @author ChainNomads (AION Yield)
 * @notice Interface for the central Chainlink ACE PolicyEngine.
 * @dev The PolicyEngine orchestrates multiple policies and provides a single
 *      entry point for compliance validation.
 */
interface IPolicyEngine {
    /**
     * @notice Validates an action against all registered policies for a target+selector.
     * @param caller The address initiating the action
     * @param target The contract being called
     * @param selector The function selector being called
     * @param data Encoded action-specific data
     * @return valid Whether all policies pass
     * @return reason First failing policy's reason (empty if valid)
     */
    function validateAction(
        address caller,
        address target,
        bytes4 selector,
        bytes calldata data
    ) external view returns (bool valid, string memory reason);

    /**
     * @notice Called after successful execution to update stateful policies.
     * @param caller The address that initiated the action
     * @param target The contract that was called
     * @param selector The function selector that was called
     * @param data Encoded action-specific data
     */
    function recordExecution(
        address caller,
        address target,
        bytes4 selector,
        bytes calldata data
    ) external;
}
