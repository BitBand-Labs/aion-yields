// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IPolicy
 * @author ChainNomads (AION Yield)
 * @notice Interface for Chainlink ACE policy contracts.
 * @dev Each policy validates a specific aspect of an action (signature, rate limit, etc.).
 *      Policies are pluggable modules managed by the PolicyEngine.
 */
interface IPolicy {
    /**
     * @notice Validates whether an action is compliant with this policy.
     * @param caller The address initiating the action
     * @param target The contract being called
     * @param selector The function selector being called
     * @param data Encoded action-specific data for validation
     * @return valid Whether the action passes this policy check
     * @return reason Human-readable reason if validation fails
     */
    function validate(
        address caller,
        address target,
        bytes4 selector,
        bytes calldata data
    ) external view returns (bool valid, string memory reason);

    /**
     * @notice Called after a validated action executes successfully.
     * @dev Used by stateful policies (e.g., VolumeRatePolicy) to update internal accounting.
     * @param caller The address that initiated the action
     * @param target The contract that was called
     * @param selector The function selector that was called
     * @param data Encoded action-specific data
     */
    function postExecutionUpdate(
        address caller,
        address target,
        bytes4 selector,
        bytes calldata data
    ) external;

    /**
     * @notice Returns the human-readable name of this policy.
     */
    function policyName() external view returns (string memory);

    /**
     * @notice Whether this policy is currently active.
     */
    function isActive() external view returns (bool);
}
