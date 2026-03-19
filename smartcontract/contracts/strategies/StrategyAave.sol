// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {StrategyBase} from "./StrategyBase.sol";

/**
 * @title StrategyAave
 * @author ChainNomads (AION Finance)
 * @notice Yield strategy that supplies assets to Aave V3 to earn lending yield.
 *
 * @dev Deposits the vault's underlying asset into Aave V3's lending pool.
 *      Yield comes from borrower interest. The strategy holds aTokens which
 *      accrue interest automatically.
 *
 *      FLOW:
 *      Vault -> deposit() -> Aave Pool.supply() -> holds aTokens
 *      Vault -> withdraw() -> Aave Pool.withdraw() -> returns underlying
 *      Vault -> report() -> aToken balance - debt = profit
 */
contract StrategyAave is StrategyBase {
    using SafeERC20 for IERC20;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Aave V3 Pool contract
    IAavePool public aavePool;

    /// @dev The aToken received when supplying to Aave
    IERC20 public aToken;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event AavePoolUpdated(address indexed pool);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address vault_,
        address asset_,
        address owner_,
        address aavePool_,
        address aToken_
    ) StrategyBase(vault_, asset_, owner_) {
        aavePool = IAavePool(aavePool_);
        aToken = IERC20(aToken_);
    }

    // ============================================================
    //              STRATEGY IMPLEMENTATION
    // ============================================================

    /**
     * @dev Supply assets to Aave V3.
     */
    function _deployFunds(uint256 amount) internal override {
        IERC20(asset).approve(address(aavePool), amount);
        aavePool.supply(asset, amount, address(this), 0);
    }

    /**
     * @dev Withdraw assets from Aave V3.
     */
    function _freeFunds(uint256 amount) internal override {
        aavePool.withdraw(asset, amount, address(this));
    }

    /**
     * @dev Harvest: aTokens auto-accrue interest, so profit = aToken balance - last known debt.
     *      No explicit claim needed for Aave V3 base yield.
     */
    function _harvestAndReport() internal view override returns (uint256 profit, uint256 loss) {
        // aToken balance represents principal + accrued interest
        // The vault compares totalAssets() vs currentDebt to determine gain/loss
        // So we just need to return 0,0 — the vault's processReport handles the math
        profit = 0;
        loss = 0;
    }

    /**
     * @dev Emergency: withdraw everything from Aave.
     */
    function _emergencyFreeFunds() internal override {
        uint256 aBalance = aToken.balanceOf(address(this));
        if (aBalance > 0) {
            aavePool.withdraw(asset, type(uint256).max, address(this));
        }
    }

    /**
     * @dev Total currently invested in Aave = aToken balance.
     */
    function _totalInvested() internal view override returns (uint256) {
        return aToken.balanceOf(address(this));
    }

    // ============================================================
    //                    ADMIN FUNCTIONS
    // ============================================================

    function setAavePool(address pool_) external onlyOwner {
        aavePool = IAavePool(pool_);
        emit AavePoolUpdated(pool_);
    }
}

// ============================================================
//              AAVE V3 POOL INTERFACE (minimal)
// ============================================================

interface IAavePool {
    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external;

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external returns (uint256);
}
