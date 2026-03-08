// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockLendingPoolForAutomation
/// @notice Minimal mock that exposes getHealthFactor and liquidate for automation tests.
contract MockLendingPoolForAutomation {
    mapping(address => uint256) public healthFactors;

    struct LiquidationCall {
        address collateralAsset;
        address debtAsset;
        address user;
        uint256 debtToCover;
        bool receiveAToken;
    }

    LiquidationCall[] public liquidationCalls;

    function setHealthFactor(address user, uint256 hf) external {
        healthFactors[user] = hf;
    }

    function getHealthFactor(address user) external view returns (uint256) {
        uint256 hf = healthFactors[user];
        if (hf == 0) return type(uint256).max; // Default: healthy
        return hf;
    }

    function liquidate(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover,
        bool receiveAToken
    ) external {
        liquidationCalls.push(LiquidationCall({
            collateralAsset: collateralAsset,
            debtAsset: debtAsset,
            user: user,
            debtToCover: debtToCover,
            receiveAToken: receiveAToken
        }));
    }

    function getLiquidationCallCount() external view returns (uint256) {
        return liquidationCalls.length;
    }
}
