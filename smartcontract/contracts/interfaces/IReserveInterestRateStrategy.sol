// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title IInterestRateModel
 * @notice Interface for the interest rate calculation model.
 */
interface IInterestRateModel {
    function calculateInterestRates(
        address asset,
        uint256 totalSupply,
        uint256 totalBorrow,
        uint256 reserveFactor
    ) external view returns (uint256 liquidityRate, uint256 variableBorrowRate);

    function getUtilizationRate(
        uint256 totalSupply,
        uint256 totalBorrow
    ) external pure returns (uint256);

    function setRateParams(
        address asset,
        uint256 baseRate,
        uint256 rateSlope1,
        uint256 rateSlope2,
        uint256 optimalUtilization
    ) external;
}
