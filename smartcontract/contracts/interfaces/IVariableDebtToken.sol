// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IVariableDebtToken
 * @notice Interface for the variable debt tracking token.
 */
interface IVariableDebtToken is IERC20 {
    function mint(
        address user,
        address onBehalfOf,
        uint256 amount,
        uint256 index
    ) external returns (bool, uint256);
    function burn(
        address user,
        uint256 amount,
        uint256 index
    ) external returns (uint256);
    function scaledBalanceOf(address user) external view returns (uint256);
    function getScaledUserBalanceAndSupply(
        address user
    ) external view returns (uint256, uint256);
    function scaledTotalSupply() external view returns (uint256);
    function getBalance(
        address user,
        uint256 currentIndex
    ) external view returns (uint256);
}
