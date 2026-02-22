// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../libraries/MathUtils.sol";

/**
 * @title VariableDebtToken
 * @author ChainNomads (AION Yield)
 * @notice Tracks variable-rate debt positions in the protocol.
 * @dev Debt grows over time as the borrow index increases, mirroring Fluid's
 *      borrowExchangePrice_ accrual mechanism.
 *
 *      In Fluid, raw borrow amounts are stored and the actual debt = raw * borrowExchangePrice_.
 *      Same pattern here: scaledDebt * variableBorrowIndex = actual debt owed.
 */
contract VariableDebtToken is ERC20, Ownable {
    using MathUtils for uint256;

    /// @dev The underlying asset this debt token represents
    address public immutable UNDERLYING_ASSET;

    /// @dev The LendingPool that controls minting/burning
    address public pool;

    /// @dev Scaled (normalized) debt balances
    mapping(address => uint256) private _scaledBalances;

    /// @dev Total scaled debt
    uint256 private _totalScaledSupply;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event Mint(
        address indexed from,
        address indexed onBehalfOf,
        uint256 amount,
        uint256 index
    );
    event Burn(address indexed user, uint256 amount, uint256 index);

    // ============================================================
    //                      MODIFIERS
    // ============================================================

    modifier onlyPool() {
        require(msg.sender == pool, "DebtToken: caller is not the pool");
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
        UNDERLYING_ASSET = underlyingAsset_;
        pool = pool_;
    }

    // ============================================================
    //                  POOL FUNCTIONS
    // ============================================================

    /**
     * @notice Mints debt tokens when a user borrows.
     * @dev Stores scaled amount (amount / borrowIndex), same as Fluid's raw borrow tracking.
     *      The actual debt grows as borrowIndex increases over time.
     *
     * @param user The initial initiator of the borrow
     * @param onBehalfOf The user receiving the debt
     * @param amount The amount being borrowed
     * @param index The current variable borrow index (RAY)
     * @return true if first borrow, scaled amount
     */
    function mint(
        address user,
        address onBehalfOf,
        uint256 amount,
        uint256 index
    ) external onlyPool returns (bool, uint256) {
        require(amount > 0, "DebtToken: mint amount zero");

        uint256 previousBalance = _scaledBalances[onBehalfOf];
        bool isFirstBorrow = previousBalance == 0;

        // Store the scaled (raw) amount
        uint256 scaledAmount = amount.rayDiv(index);
        _scaledBalances[onBehalfOf] += scaledAmount;
        _totalScaledSupply += scaledAmount;

        emit Mint(user, onBehalfOf, amount, index);

        return (isFirstBorrow, scaledAmount);
    }

    /**
     * @notice Burns debt tokens when a user repays.
     * @dev Reduces the scaled debt balance.
     *
     * @param user The user repaying
     * @param amount The amount being repaid (in underlying asset terms)
     * @param index The current variable borrow index (RAY)
     * @return The repaid scaled amount
     */
    function burn(
        address user,
        uint256 amount,
        uint256 index
    ) external onlyPool returns (uint256) {
        require(amount > 0, "DebtToken: burn amount zero");

        uint256 scaledAmount = amount.rayDiv(index);
        require(
            _scaledBalances[user] >= scaledAmount,
            "DebtToken: burn exceeds balance"
        );

        _scaledBalances[user] -= scaledAmount;
        _totalScaledSupply -= scaledAmount;

        emit Burn(user, amount, index);

        return scaledAmount;
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Returns the scaled (raw) balance of a user.
     * @dev To get actual debt: scaledBalance * currentBorrowIndex / RAY
     *      Same pattern as Fluid: rawBorrow * borrowExchangePrice / EXCHANGE_PRICES_PRECISION
     */
    function scaledBalanceOf(address user) external view returns (uint256) {
        return _scaledBalances[user];
    }

    /**
     * @notice Returns both scaled balance and total scaled supply.
     */
    function getScaledUserBalanceAndSupply(
        address user
    ) external view returns (uint256, uint256) {
        return (_scaledBalances[user], _totalScaledSupply);
    }

    /**
     * @notice Returns total scaled supply.
     */
    function scaledTotalSupply() external view returns (uint256) {
        return _totalScaledSupply;
    }

    /**
     * @notice Returns the actual debt of a user given the current index.
     * @param user The user address
     * @param currentIndex The current variable borrow index (RAY)
     * @return The actual debt amount
     */
    function getBalance(
        address user,
        uint256 currentIndex
    ) external view returns (uint256) {
        return _scaledBalances[user].rayMul(currentIndex);
    }

    /**
     * @notice Debt tokens are non-transferable.
     */
    function transfer(address, uint256) public pure override returns (bool) {
        revert("DebtToken: transfer not allowed");
    }

    /**
     * @notice Debt tokens are non-transferable.
     */
    function transferFrom(
        address,
        address,
        uint256
    ) public pure override returns (bool) {
        revert("DebtToken: transfer not allowed");
    }

    /**
     * @notice Debt tokens cannot be approved for transfer.
     */
    function approve(address, uint256) public pure override returns (bool) {
        revert("DebtToken: approval not allowed");
    }
}
