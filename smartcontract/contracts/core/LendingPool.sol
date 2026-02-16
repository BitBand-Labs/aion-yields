// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title LendingPool
 * @author ChainNomads
 * @notice Main interaction point for the AION Yield protocol.
 */
contract LendingPool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    // Data Types
    struct ReserveData {
        // Configuration
        address aTokenAddress;       // The aToken contract for this asset
        address variableDebtTokenAddress; // The variable debt token
        address interestRateStrategyAddress; // Calculator for rates
        
        // State
        uint128 liquidityIndex;      // Accumulator for variable interest
        uint128 variableBorrowIndex; // Accumulator for variable debt
        uint128 currentLiquidityRate;
        uint128 currentVariableBorrowRate;
        uint40 lastUpdateTimestamp;
        bool isActive;
        bool isFrozen;
    }

    struct UserConfigurationMap {
        uint256 data; // Bitmap of collateral/borrowed assets
    }

    // Storage
    mapping(address => ReserveData) public reserves;
    mapping(address => UserConfigurationMap) public userConfig;
    mapping(address => bool) public reservesList; // Simple existence check for now
    
    address[] public reservesListArray; // To iterate if needed

    // Events
    event Deposit(address indexed reserve, address indexed user, address indexed onBehalfOf, uint256 amount, uint16 referralCode);
    event Withdraw(address indexed reserve, address indexed user, address indexed to, uint256 amount);
    event Borrow(address indexed reserve, address indexed user, address indexed onBehalfOf, uint256 amount, uint256 borrowRateMode, uint256 borrowRate, uint16 referralCode);
    event Repay(address indexed reserve, address indexed user, address indexed repayer, uint256 amount);
    event ReserveInitialized(address indexed asset, address indexed aToken, address interestRateStrategyAddress);

    constructor(address initialOwner) Ownable(initialOwner) {
        // Init
    }

    /**
     * @notice Initializes a new reserve.
     * @param asset The address of the underlying asset
     * @param aTokenAddress The address of the corresponding aToken
     * @param interestRateStrategyAddress The address of the interest rate strategy contract
     */
    function initReserve(
        address asset, 
        address aTokenAddress, 
        address interestRateStrategyAddress
    ) external onlyOwner {
        require(!reserves[asset].isActive, "Reserve already initialized");

        reserves[asset] = ReserveData({
            aTokenAddress: aTokenAddress,
            variableDebtTokenAddress: address(0), // TODO: Add later
            interestRateStrategyAddress: interestRateStrategyAddress,
            liquidityIndex: uint128(1e27), // RAY
            variableBorrowIndex: uint128(1e27), // RAY
            currentLiquidityRate: 0,
            currentVariableBorrowRate: 0,
            lastUpdateTimestamp: uint40(block.timestamp),
            isActive: true,
            isFrozen: false
        });
        
        reservesList[asset] = true;
        reservesListArray.push(asset);
        
        emit ReserveInitialized(asset, aTokenAddress, interestRateStrategyAddress);
    }
}
