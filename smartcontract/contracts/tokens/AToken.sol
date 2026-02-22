// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../libraries/MathUtils.sol";

/**
 * @title AToken
 * @author ChainNomads (AION Yield)
 * @notice Interest-bearing token representing deposits in the lending pool.
 * @dev Minted 1:1 with deposited assets. The balance grows over time as interest accrues
 *      through the liquidity index, similar to how Fluid's supply exchange price
 *      (supplyExchangePrice_) grows to reflect earned interest.
 *
 *      In Fluid, the exchange price mechanism means raw supply amounts are multiplied by
 *      the exchange price to get the actual value. Similarly, here:
 *        actualBalance = scaledBalance * liquidityIndex / RAY
 *
 *      This is the same pattern as Aave's aToken, adapted with Fluid-inspired exchange price logic.
 */
contract AToken is ERC20, Ownable {
    using SafeERC20 for IERC20;
    using MathUtils for uint256;

    /// @dev The underlying asset this aToken represents
    IERC20 public immutable UNDERLYING_ASSET;

    /// @dev The LendingPool that controls minting/burning
    address public pool;

    /// @dev Scaled balances (normalized by liquidity index)
    mapping(address => uint256) private _scaledBalances;

    /// @dev Total scaled supply
    uint256 private _totalScaledSupply;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event Mint(address indexed to, uint256 amount, uint256 index);
    event Burn(
        address indexed from,
        address indexed target,
        uint256 amount,
        uint256 index
    );

    // ============================================================
    //                      MODIFIERS
    // ============================================================

    modifier onlyPool() {
        require(msg.sender == pool, "AToken: caller is not the pool");
        _;
    }

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        string memory name_,
        string memory symbol_,
        address underlyingAsset_,
        address pool_,
        address initialOwner_
    ) ERC20(name_, symbol_) Ownable(initialOwner_) {
        UNDERLYING_ASSET = IERC20(underlyingAsset_);
        pool = pool_;
    }

    // ============================================================
    //                  POOL FUNCTIONS
    //      (Maps to Fluid's supply exchange price accrual)
    // ============================================================

    /**
     * @notice Mints aTokens to the user on deposit.
     * @dev The amount is divided by the current liquidity index (exchange price) to get the
     *      scaled amount. This is the same concept as Fluid storing raw supply amounts that
     *      are later multiplied by supplyExchangePrice_ to get actual value.
     *
     * @param user The recipient
     * @param amount The amount of underlying being deposited
     * @param index The current liquidity index (supply exchange price in RAY)
     * @return true if successful
     */
    function mint(
        address user,
        uint256 amount,
        uint256 index
    ) external onlyPool returns (bool) {
        require(amount > 0, "AToken: mint amount zero");

        // Calculate scaled amount: amount / index
        // This mirrors Fluid's raw supply tracking
        uint256 scaledAmount = amount.rayDiv(index);

        _scaledBalances[user] += scaledAmount;
        _totalScaledSupply += scaledAmount;

        // Transfer underlying from pool to this contract (aToken holds the liquidity)
        UNDERLYING_ASSET.safeTransferFrom(msg.sender, address(this), amount);

        emit Mint(user, amount, index);
        return true;
    }

    /**
     * @notice Burns aTokens on withdrawal and sends underlying to the user.
     * @dev The scaled amount is calculated and burned. The actual underlying amount
     *      sent is the scaled amount * current index, reflecting earned interest.
     *
     * @param user The user burning aTokens
     * @param receiverOfUnderlying Where to send the underlying asset
     * @param amount The amount of underlying to withdraw
     * @param index The current liquidity index
     */
    function burn(
        address user,
        address receiverOfUnderlying,
        uint256 amount,
        uint256 index
    ) external onlyPool {
        require(amount > 0, "AToken: burn amount zero");

        uint256 scaledAmount = amount.rayDiv(index);

        require(
            _scaledBalances[user] >= scaledAmount,
            "AToken: burn exceeds balance"
        );

        _scaledBalances[user] -= scaledAmount;
        _totalScaledSupply -= scaledAmount;

        // Transfer underlying to the receiver
        UNDERLYING_ASSET.safeTransfer(receiverOfUnderlying, amount);

        emit Burn(user, receiverOfUnderlying, amount, index);
    }

    /**
     * @notice Mints aTokens to the treasury (protocol revenue).
     * @dev Called when accruing the protocol's share of interest (reserveFactor).
     *      Maps to Fluid's revenue collection mechanism.
     */
    function mintToTreasury(
        address treasury,
        uint256 amount,
        uint256 index
    ) external onlyPool {
        if (amount == 0) return;

        uint256 scaledAmount = amount.rayDiv(index);
        _scaledBalances[treasury] += scaledAmount;
        _totalScaledSupply += scaledAmount;
    }

    /**
     * @notice Transfer underlying to a borrower (called by pool on borrow).
     * @param target The borrower receiving the underlying
     * @param amount The amount to transfer
     * @return The actual amount transferred
     */
    function transferUnderlyingTo(
        address target,
        uint256 amount
    ) external onlyPool returns (uint256) {
        UNDERLYING_ASSET.safeTransfer(target, amount);
        return amount;
    }

    /**
     * @notice Transfer aTokens on liquidation.
     * @dev Moves scaled balance from liquidated user to liquidator
     */
    function transferOnLiquidation(
        address from,
        address to,
        uint256 amount,
        uint256 index
    ) external onlyPool {
        uint256 scaledAmount = amount.rayDiv(index);
        require(
            _scaledBalances[from] >= scaledAmount,
            "AToken: transfer exceeds balance"
        );

        _scaledBalances[from] -= scaledAmount;
        _scaledBalances[to] += scaledAmount;
    }

    // ============================================================
    //                    VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Returns the actual balance of a user (scaled balance * current index).
     * @dev This mirrors how Fluid computes actual user supply:
     *      actualSupply = rawSupply * supplyExchangePrice / EXCHANGE_PRICES_PRECISION
     */
    function balanceOfScaled(address user) external view returns (uint256) {
        return _scaledBalances[user];
    }

    /**
     * @notice Returns the total underlying held by this aToken.
     */
    function totalUnderlyingBalance() external view returns (uint256) {
        return UNDERLYING_ASSET.balanceOf(address(this));
    }

    /**
     * @notice Returns total scaled supply.
     */
    function scaledTotalSupply() external view returns (uint256) {
        return _totalScaledSupply;
    }

    /**
     * @notice Override balanceOf to return the actual (un-scaled) balance.
     * @dev Note: For the hackathon MVP, the pool must call this with the current index.
     *      In production, this would read the index from the pool directly.
     */
    function getBalance(
        address user,
        uint256 currentIndex
    ) external view returns (uint256) {
        return _scaledBalances[user].rayMul(currentIndex);
    }
}
