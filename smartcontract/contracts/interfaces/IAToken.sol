// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IAToken
 * @notice Interface for the interest-bearing aToken.
 */
interface IAToken is IERC20 {
    function mint(
        address user,
        uint256 amount,
        uint256 index
    ) external returns (bool);
    function burn(
        address user,
        address receiverOfUnderlying,
        uint256 amount,
        uint256 index
    ) external;
    function mintToTreasury(
        address treasury,
        uint256 amount,
        uint256 index
    ) external;
    function transferOnLiquidation(
        address from,
        address to,
        uint256 amount,
        uint256 index
    ) external;
    function transferUnderlyingTo(
        address user,
        uint256 amount
    ) external returns (uint256);
    function balanceOfScaled(address user) external view returns (uint256);
    function getBalance(
        address user,
        uint256 currentIndex
    ) external view returns (uint256);
    function scaledTotalSupply() external view returns (uint256);
    function totalUnderlyingBalance() external view returns (uint256);
}
