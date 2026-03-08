// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IProtocolAdapter.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title MockProtocolAdapter
 * @notice Simulates an external DeFi protocol (Aave, Morpho) for demo purposes.
 *         Accepts deposits, tracks balances, and reports mock APYs.
 */
contract MockProtocolAdapter is IProtocolAdapter {
    string private _name;
    uint256 private _mockAPY; // in RAY (1e27)
    mapping(address => uint256) private _balances;
    address public owner;

    constructor(string memory name_, uint256 mockAPY_) {
        _name = name_;
        _mockAPY = mockAPY_;
        owner = msg.sender;
    }

    function deposit(address asset, uint256 amount) external returns (uint256) {
        IERC20(asset).transferFrom(msg.sender, address(this), amount);
        _balances[asset] += amount;
        return amount;
    }

    function withdraw(address asset, uint256 amount) external returns (uint256) {
        uint256 bal = _balances[asset];
        uint256 toWithdraw = amount > bal ? bal : amount;
        _balances[asset] -= toWithdraw;
        IERC20(asset).transfer(msg.sender, toWithdraw);
        return toWithdraw;
    }

    function emergencyWithdraw(address asset) external returns (uint256) {
        uint256 bal = _balances[asset];
        _balances[asset] = 0;
        IERC20(asset).transfer(msg.sender, bal);
        return bal;
    }

    function getProtocolState(address asset) external view returns (ProtocolState memory) {
        return ProtocolState({
            totalDeposited: _balances[asset],
            currentAPY: _mockAPY,
            availableLiquidity: type(uint256).max,
            utilizationRate: 0,
            riskScore: 1500, // low risk
            lastUpdateTime: block.timestamp
        });
    }

    function getBalance(address asset) external view returns (uint256) {
        return _balances[asset];
    }

    function getCurrentAPY(address) external view returns (uint256) {
        return _mockAPY;
    }

    function protocolName() external view returns (string memory) {
        return _name;
    }

    function isActive() external pure returns (bool) {
        return true;
    }

    function setMockAPY(uint256 newAPY) external {
        require(msg.sender == owner, "Only owner");
        _mockAPY = newAPY;
    }
}
