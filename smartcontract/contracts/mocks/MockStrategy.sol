// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IStrategy.sol";

contract MockStrategy is IStrategy {
    address public override vault;
    address public override asset;
    uint256 public override totalAssets;
    bool public override isActive = true;

    constructor(address _vault, address _asset) {
        vault = _vault;
        asset = _asset;
    }

    function deposit(uint256 amount) external override {
        totalAssets += amount;
    }

    function withdraw(uint256 amount) external override returns (uint256) {
        totalAssets -= amount;
        return amount;
    }

    function report() external override returns (uint256, uint256) {
        return (0, 0);
    }

    function emergencyWithdraw() external override returns (uint256) {
        uint256 recovered = totalAssets;
        totalAssets = 0;
        return recovered;
    }
}
