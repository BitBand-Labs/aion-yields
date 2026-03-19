// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IStrategy
 * @author ChainNomads (AION Finance)
 * @notice Interface for external yield strategies that the AionVault allocates capital to.
 *
 * @dev Each strategy (lending, LP, basis trade, etc.) implements this interface.
 *      The vault uses it to deploy capital, withdraw capital, and harvest profits.
 *
 *      STRATEGY LIFECYCLE:
 *      1. Vault calls deposit() to allocate capital
 *      2. Strategy deploys capital into DeFi protocols
 *      3. Vault calls report() periodically to harvest gains/losses
 *      4. Vault calls withdraw() to pull capital back when needed
 */
interface IStrategy {
    /// @notice The address of the vault this strategy reports to
    function vault() external view returns (address);

    /// @notice The underlying asset this strategy operates on
    function asset() external view returns (address);

    /// @notice Total assets currently managed by this strategy (principal + unrealized gains)
    function totalAssets() external view returns (uint256);

    /// @notice Deposit assets into the strategy for deployment
    /// @param amount Amount of underlying asset to deposit
    function deposit(uint256 amount) external;

    /// @notice Withdraw assets from the strategy back to the vault
    /// @param amount Amount of underlying asset to withdraw
    /// @return actualWithdrawn The amount actually returned (may differ due to slippage/fees)
    function withdraw(uint256 amount) external returns (uint256 actualWithdrawn);

    /// @notice Harvest profits and report back to the vault
    /// @return profit The amount of profit realized
    /// @return loss The amount of loss realized
    function report() external returns (uint256 profit, uint256 loss);

    /// @notice Emergency exit: withdraw all funds regardless of loss
    /// @return recovered Amount of assets recovered
    function emergencyWithdraw() external returns (uint256 recovered);

    /// @notice Whether the strategy is currently active and accepting deposits
    function isActive() external view returns (bool);
}
