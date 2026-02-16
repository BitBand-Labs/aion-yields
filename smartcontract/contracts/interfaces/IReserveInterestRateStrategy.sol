// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IReserveInterestRateStrategy {
    function calculateInterestRates(
        address reserve,
        uint256 availableLiquidity,
        uint256 totalStableDebt,
        uint256 totalVariableDebt,
        uint256 averageStableBorrowRate,
        uint256 reserveFactor,
        address reserveAddress,
        address aTokenAddress
    ) external view returns (uint256, uint256, uint256);
}
