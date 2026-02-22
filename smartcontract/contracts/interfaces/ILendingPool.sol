// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/DataTypes.sol";

/**
 * @title ILendingPool
 * @notice Interface for the main AION Yield lending pool.
 */
interface ILendingPool {
    // --- Core Functions ---
    function deposit(
        address asset,
        uint256 amount,
        address onBehalfOf
    ) external;
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);
    function borrow(address asset, uint256 amount, address onBehalfOf) external;
    function repay(
        address asset,
        uint256 amount,
        address onBehalfOf
    ) external returns (uint256);
    function liquidate(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover,
        bool receiveAToken
    ) external;

    // --- Collateral ---
    function setUserUseReserveAsCollateral(
        address asset,
        bool useAsCollateral
    ) external;

    // --- View Functions ---
    function getUserAccountData(
        address user
    ) external view returns (DataTypes.UserAccountData memory);
    function getReserveData(
        address asset
    ) external view returns (DataTypes.ReserveData memory);
    function getHealthFactor(address user) external view returns (uint256);
    function getReservesCount() external view returns (uint256);
    function reservesList(uint256 index) external view returns (address);

    // --- AI Integration ---
    function aiAdjustRateParams(
        address asset,
        uint256 baseRate,
        uint256 rateSlope1,
        uint256 rateSlope2,
        uint256 optimalUtilization
    ) external;

    // --- Events ---
    event Deposit(
        address indexed asset,
        address indexed user,
        address indexed onBehalfOf,
        uint256 amount
    );
    event Withdraw(
        address indexed asset,
        address indexed user,
        address indexed to,
        uint256 amount
    );
    event Borrow(
        address indexed asset,
        address indexed user,
        address indexed onBehalfOf,
        uint256 amount,
        uint256 borrowRate
    );
    event Repay(
        address indexed asset,
        address indexed user,
        address indexed repayer,
        uint256 amount
    );
    event Liquidate(
        address indexed collateralAsset,
        address indexed debtAsset,
        address indexed user,
        uint256 debtToCover,
        uint256 collateralReceived
    );
}
