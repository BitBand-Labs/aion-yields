// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStrategy} from "../interfaces/IStrategy.sol";

/**
 * @title StrategyBase
 * @author ChainNomads (AION Finance)
 * @notice Abstract base contract for all yield strategies.
 *
 * @dev Concrete strategies (StrategyAave, StrategyCurve, etc.) inherit from this
 *      and implement _deployFunds(), _freeFunds(), _harvestAndReport(), and _totalInvested().
 *
 *      LIFECYCLE:
 *      1. Vault calls deposit(amount) -> StrategyBase receives tokens -> _deployFunds()
 *      2. Vault calls withdraw(amount) -> _freeFunds() -> return tokens to vault
 *      3. Vault calls report() -> _harvestAndReport() -> return (profit, loss)
 *      4. Emergency: emergencyWithdraw() -> _emergencyFreeFunds() -> return all to vault
 */
abstract contract StrategyBase is IStrategy, Ownable {
    using SafeERC20 for IERC20;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev The vault this strategy reports to
    address public immutable override vault;

    /// @dev The underlying asset
    address public immutable override asset;

    /// @dev Whether the strategy is active
    bool public override isActive;

    /// @dev Slippage controller address (optional)
    address public slippageController;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event FundsDeployed(uint256 amount);
    event FundsFreed(uint256 amount);
    event EmergencyExit(uint256 recovered);
    event SlippageControllerUpdated(address indexed controller);

    // ============================================================
    //                       ERRORS
    // ============================================================

    error OnlyVault();
    error StrategyInactive();

    // ============================================================
    //                      MODIFIERS
    // ============================================================

    modifier onlyVault() {
        if (msg.sender != vault) revert OnlyVault();
        _;
    }

    modifier whenActive() {
        if (!isActive) revert StrategyInactive();
        _;
    }

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address vault_,
        address asset_,
        address owner_
    ) Ownable(owner_) {
        vault = vault_;
        asset = asset_;
        isActive = true;
    }

    // ============================================================
    //             IStrategy IMPLEMENTATION
    // ============================================================

    /**
     * @notice Total assets managed by this strategy.
     */
    function totalAssets() external view override returns (uint256) {
        return _totalInvested() + IERC20(asset).balanceOf(address(this));
    }

    /**
     * @notice Deposit assets into the strategy.
     * @dev Only callable by the vault via vault.updateDebt().
     */
    function deposit(uint256 amount) external override onlyVault whenActive {
        _deployFunds(amount);
        emit FundsDeployed(amount);
    }

    /**
     * @notice Withdraw assets from the strategy back to the vault.
     * @dev Only callable by the vault.
     */
    function withdraw(uint256 amount) external override onlyVault returns (uint256 actualWithdrawn) {
        uint256 idle = IERC20(asset).balanceOf(address(this));

        if (amount > idle) {
            uint256 needed = amount - idle;
            _freeFunds(needed);
        }

        actualWithdrawn = IERC20(asset).balanceOf(address(this));
        if (actualWithdrawn > amount) {
            actualWithdrawn = amount;
        }

        IERC20(asset).safeTransfer(vault, actualWithdrawn);
        emit FundsFreed(actualWithdrawn);
    }

    /**
     * @notice Harvest profits and report back.
     * @dev Only callable by the vault (via processReport).
     */
    function report() external override onlyVault returns (uint256 profit, uint256 loss) {
        (profit, loss) = _harvestAndReport();
    }

    /**
     * @notice Emergency exit: pull everything and send to vault.
     */
    function emergencyWithdraw() external override onlyVault returns (uint256 recovered) {
        _emergencyFreeFunds();

        recovered = IERC20(asset).balanceOf(address(this));
        if (recovered > 0) {
            IERC20(asset).safeTransfer(vault, recovered);
        }

        isActive = false;
        emit EmergencyExit(recovered);
    }

    // ============================================================
    //          ABSTRACT: MUST BE IMPLEMENTED BY CHILD
    // ============================================================

    /// @dev Deploy idle funds into the external protocol
    function _deployFunds(uint256 amount) internal virtual;

    /// @dev Free funds from the external protocol
    function _freeFunds(uint256 amount) internal virtual;

    /// @dev Harvest any claimable rewards and report profit/loss
    function _harvestAndReport() internal virtual returns (uint256 profit, uint256 loss);

    /// @dev Emergency: free ALL funds from the external protocol
    function _emergencyFreeFunds() internal virtual;

    /// @dev Return the amount currently invested in the external protocol (excluding idle)
    function _totalInvested() internal view virtual returns (uint256);

    // ============================================================
    //                    ADMIN FUNCTIONS
    // ============================================================

    function setActive(bool active_) external onlyOwner {
        isActive = active_;
    }

    function setSlippageController(address controller) external onlyOwner {
        slippageController = controller;
        emit SlippageControllerUpdated(controller);
    }
}
