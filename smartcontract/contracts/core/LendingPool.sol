// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IAToken.sol";

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

    /**
     * @notice Deposits an `amount` of underlying asset into the reserve, receiving in return overlying aTokens.
     * @param asset The address of the underlying asset to deposit
     * @param amount The amount to be deposited
     * @param onBehalfOf The address that will receive the aTokens, same as msg.sender if the user
     *   wants to receive them on his own wallet, or a different address if the beneficiary of aTokens
     *   is a different wallet
     * @param referralCode Code used to register the integrator originating the operation, for potential rewards.
     *   0 if the action is executed directly by the user, without any middle-man
     */
    function deposit(
        address asset, 
        uint256 amount, 
        address onBehalfOf, 
        uint16 referralCode
    ) external nonReentrant {
        ReserveData storage reserve = reserves[asset];
        
        require(amount > 0, "INVALID_AMOUNT");
        require(reserve.isActive, "RESERVE_INACTIVE");
        require(!reserve.isFrozen, "RESERVE_FROZEN");

        // TODO: Update state (accrue interest) before changing balances
        // _updateState(asset);

        // Mint aTokens to the user (or onBehalfOf)
        // The aToken contract handles the transferFrom of the underlying asset
        bool success = IAToken(reserve.aTokenAddress).mint(onBehalfOf, amount, reserve.liquidityIndex);
        require(success, "ATOKEN_MINT_FAILED");

        emit Deposit(asset, msg.sender, onBehalfOf, amount, referralCode);
    }

    /**
     * @notice Withdraws an `amount` of underlying asset from the reserve, burning the equivalent aTokens owned
     * E.g. User has 100 aUSDC, calls withdraw(USDC, 100), gets 100 USDC.
     * @param asset The address of the underlying asset to withdraw
     * @param amount The underlying amount to be withdrawn
     * @param to The address that will receive the underlying, same as msg.sender if the user
     *   wants to receive it on his own wallet, or a different address if the beneficiary is a
     *   different wallet
     * @return The final amount withdrawn
     */
    function withdraw(address asset, uint256 amount, address to) external nonReentrant returns (uint256) {
        ReserveData storage reserve = reserves[asset];
        
        require(amount > 0, "INVALID_AMOUNT");
        require(reserve.isActive, "RESERVE_INACTIVE");
        
        address user = msg.sender;
        
        // TODO: Update state (accrue interest)
        // _updateState(asset);
        
        // Burn aTokens. The aToken contract handles the transfer of the underlying asset to `to`
        IAToken(reserve.aTokenAddress).burn(user, to, amount, reserve.liquidityIndex);
        
        emit Withdraw(asset, user, to, amount);
        
        return amount;
    }
}
