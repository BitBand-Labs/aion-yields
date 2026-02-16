// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IAToken is IERC20 {
    function mint(address user, uint256 amount, uint256 index) external returns (bool);
    function burn(address user, address receiverOfUnderlying, uint256 amount, uint256 index) external;
    function mintToTreasury(uint256 amount, uint256 index) external;
    function transferOnLiquidation(address from, address to, uint256 value) external;
    function transferUnderlyingTo(address user, uint256 amount) external returns (uint256);
    function balanceOf(address user) external view returns (uint256);
}
