// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IProtocolAdapter
 * @author ChainNomads (AION Yield)
 * @notice Standard interface that every external DeFi protocol adapter must implement.
 *
 * @dev The AutonomousAllocator interacts with Aave, Morpho, and future protocols
 *      exclusively through this interface. Adding a new protocol is as simple as
 *      deploying a new adapter that satisfies these methods.
 *
 *      ADAPTER PATTERN:
 *      ┌────────────────────────┐
 *      │   AutonomousAllocator  │
 *      └───────────┬────────────┘
 *                  │  IProtocolAdapter
 *      ┌───────────┼───────────────────┐
 *      ▼           ▼                   ▼
 *  ┌────────┐  ┌────────────┐  ┌─────────────┐
 *  │ Aave   │  │  Morpho    │  │ Future      │
 *  │Adapter │  │  Adapter   │  │ Adapter     │
 *  └────────┘  └────────────┘  └─────────────┘
 */
interface IProtocolAdapter {
    // ============================================================
    //                     DATA TYPES
    // ============================================================

    struct ProtocolState {
        uint256 totalDeposited; // Amount currently deposited by AION into this protocol
        uint256 currentAPY; // Current supply APY from this protocol (in RAY, 1e27)
        uint256 availableLiquidity; // How much liquidity is available for deposit
        uint256 utilizationRate; // Protocol utilization (in RAY)
        uint256 riskScore; // Protocol risk score (0-10000 bps, lower = safer)
        uint256 lastUpdateTime; // Timestamp of last state refresh
    }

    // ============================================================
    //                   CORE FUNCTIONS
    // ============================================================

    /**
     * @notice Deposit assets into the external protocol.
     * @param asset The ERC20 token address to deposit
     * @param amount The amount of tokens to deposit
     * @return actualDeposited The amount that was actually deposited (may differ due to fees)
     */
    function deposit(
        address asset,
        uint256 amount
    ) external returns (uint256 actualDeposited);

    /**
     * @notice Withdraw assets from the external protocol.
     * @param asset The ERC20 token address to withdraw
     * @param amount The amount to withdraw (type(uint256).max for full withdrawal)
     * @return actualWithdrawn The amount that was actually received back
     */
    function withdraw(
        address asset,
        uint256 amount
    ) external returns (uint256 actualWithdrawn);

    /**
     * @notice Emergency withdrawal of all assets from the external protocol.
     * @dev Bypasses normal checks. Used when the external protocol is deemed risky.
     * @param asset The token to withdraw
     * @return withdrawn The amount recovered
     */
    function emergencyWithdraw(
        address asset
    ) external returns (uint256 withdrawn);

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Returns the current state of this protocol for a given asset.
     * @param asset The asset to query
     * @return state The full protocol state
     */
    function getProtocolState(
        address asset
    ) external view returns (ProtocolState memory state);

    /**
     * @notice Returns how much of the given asset AION currently has deposited.
     * @param asset The asset to query
     * @return balance The deposited amount
     */
    function getBalance(address asset) external view returns (uint256 balance);

    /**
     * @notice Returns the current supply APY offered by this protocol.
     * @param asset The asset to query
     * @return apy The APY in RAY precision (1e27)
     */
    function getCurrentAPY(address asset) external view returns (uint256 apy);

    /**
     * @notice Returns the human-readable name of this protocol.
     * @return name E.g., "Aave V3", "Morpho Blue"
     */
    function protocolName() external view returns (string memory name);

    /**
     * @notice Returns whether this adapter is currently operational.
     * @return active True if deposits/withdrawals are possible
     */
    function isActive() external view returns (bool active);
}
