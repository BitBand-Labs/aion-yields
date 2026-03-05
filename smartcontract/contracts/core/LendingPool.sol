// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../libraries/MathUtils.sol";
import "../libraries/DataTypes.sol";
import "../tokens/AToken.sol";
import "../tokens/VariableDebtToken.sol";
import "./InterestRateModel.sol";

/**
 * @title LendingPool
 * @author ChainNomads (AION Yield)
 * @notice Main interaction point for the AION Yield money market protocol.
 *
 * @dev Architecture inspired by Fluid DEX V2's Liquidity Layer + Money Market:
 *
 *      FLUID PATTERN MAPPING:
 *      ┌────────────────────────────────┬──────────────────────────────┐
 *      │ Fluid Concept                  │ AION Yield Equivalent        │
 *      ├────────────────────────────────┼──────────────────────────────┤
 *      │ supplyExchangePrice_           │ liquidityIndex               │
 *      │ borrowExchangePrice_           │ variableBorrowIndex          │
 *      │ _supplyOrWithdraw()            │ deposit() / withdraw()       │
 *      │ _borrowOrPayback()             │ borrow() / repay()           │
 *      │ calcExchangePrices()           │ _updateState()               │
 *      │ ratioSupplyYield               │ supply rate derivation       │
 *      │ BITS_EXCHANGE_PRICES_FEE       │ reserveFactor                │
 *      │ calcRateV1() kink model        │ InterestRateModel            │
 *      │ Money Market Health Factor     │ _calculateHealthFactor()     │
 *      │ liquidateModule                │ liquidate()                  │
 *      └────────────────────────────────┴──────────────────────────────┘
 *
 *      KEY DIFFERENCES FROM FLUID:
 *      1. We use struct-based storage instead of bit-packing for readability
 *      2. We use OpenZeppelin's ReentrancyGuard instead of custom reentrancy locks
 *      3. We integrate Chainlink price feeds directly (Fluid has its own oracle system)
 *      4. We add AI yield optimization hooks for the Chainlink CRE integration
 */
contract LendingPool is ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;
    using MathUtils for uint256;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Reserve data per asset (equivalent to Fluid's exchangePricesAndConfig_ + totalAmounts_)
    mapping(address => DataTypes.ReserveData) public reserves;

    /// @dev User data per asset per user
    mapping(address => mapping(address => DataTypes.UserReserveData))
        public userReserves;

    /// @dev List of all active reserve asset addresses
    address[] public reservesList;

    /// @dev Whether an asset has been initialized as a reserve
    mapping(address => bool) public reserveInitialized;

    /// @dev The interest rate model contract (implements kink model from Fluid's calcRateV1)
    InterestRateModel public interestRateModel;

    /// @dev Treasury address for protocol revenue (Fluid's revenue collection)
    address public treasury;

    /// @dev Chainlink price feed addresses per asset
    mapping(address => address) public priceFeeds;

    /// @dev AI yield engine address (for CRE integration)
    address public aiYieldEngine;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event Deposit(
        address indexed asset,
        address indexed user,
        address indexed onBehalfOf,
        uint256 amount
    );
    event Withdraw(
        address indexed asset,
        address indexed user,
        address indexed to,
        uint256 amount
    );
    event Borrow(
        address indexed asset,
        address indexed user,
        address indexed onBehalfOf,
        uint256 amount,
        uint256 borrowRate
    );
    event Repay(
        address indexed asset,
        address indexed user,
        address indexed repayer,
        uint256 amount
    );
    event Liquidate(
        address indexed collateralAsset,
        address indexed debtAsset,
        address indexed user,
        uint256 debtToCover,
        uint256 collateralReceived
    );
    event ReserveInitialized(
        address indexed asset,
        address aToken,
        address debtToken,
        address interestRateStrategy
    );
    event ReserveStateUpdated(
        address indexed asset,
        uint256 liquidityIndex,
        uint256 variableBorrowIndex,
        uint256 liquidityRate,
        uint256 borrowRate
    );
    event CollateralToggled(
        address indexed user,
        address indexed asset,
        bool enabled
    );
    event AIYieldEngineUpdated(address indexed newEngine);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address interestRateModel_,
        address treasury_
    ) Ownable(initialOwner) {
        interestRateModel = InterestRateModel(interestRateModel_);
        treasury = treasury_;
    }

    // ============================================================
    //               ADMIN: RESERVE INITIALIZATION
    // ============================================================

    /**
     * @notice Initializes a new reserve (lending market) for an asset.
     * @dev Creates the aToken and debt token, sets initial exchange prices to RAY (1e27),
     *      matching Fluid's initial exchange price of 1e12 (we use higher precision).
     */
    function initReserve(
        address asset,
        address aTokenAddress,
        address debtTokenAddress,
        address priceFeed,
        uint16 reserveFactor,
        uint16 ltv,
        uint16 liquidationThreshold,
        uint16 liquidationBonus,
        uint8 decimals
    ) external onlyOwner {
        require(!reserveInitialized[asset], "Reserve already initialized");

        reserves[asset] = DataTypes.ReserveData({
            aTokenAddress: aTokenAddress,
            variableDebtTokenAddress: debtTokenAddress,
            interestRateStrategyAddress: address(interestRateModel),
            chainlinkPriceFeed: priceFeed,
            // Initial exchange prices = RAY (1:1 ratio)
            // In Fluid, initial exchange price = EXCHANGE_PRICES_PRECISION (1e12)
            liquidityIndex: uint128(MathUtils.RAY),
            variableBorrowIndex: uint128(MathUtils.RAY),
            currentLiquidityRate: 0,
            currentVariableBorrowRate: 0,
            lastUpdateTimestamp: uint40(block.timestamp),
            reserveFactor: reserveFactor,
            liquidationThreshold: liquidationThreshold,
            liquidationBonus: liquidationBonus,
            ltv: ltv,
            totalSupply: 0,
            totalBorrow: 0,
            totalSupplyScaled: 0,
            totalBorrowScaled: 0,
            isActive: true,
            isFrozen: false,
            borrowingEnabled: true,
            decimals: decimals
        });

        reserveInitialized[asset] = true;
        reservesList.push(asset);
        priceFeeds[asset] = priceFeed;

        emit ReserveInitialized(
            asset,
            aTokenAddress,
            debtTokenAddress,
            address(interestRateModel)
        );
    }

    // ============================================================
    //         CORE: DEPOSIT (Fluid's _supplyOrWithdraw with positive amount)
    // ============================================================

    /**
     * @notice Deposits an amount of underlying asset into the reserve.
     * @dev Flow adapted from Fluid's _supplyOrWithdraw() with positive amount_:
     *      1. Update state (accrue interest → update exchange prices)
     *      2. Calculate scaled amount (amount / exchange price)
     *      3. Mint aTokens to user
     *      4. Transfer underlying from user to aToken contract
     *      5. Update reserve totals
     *      6. Recalculate interest rates based on new utilization
     */
    function deposit(
        address asset,
        uint256 amount,
        address onBehalfOf
    ) external nonReentrant {
        DataTypes.ReserveData storage reserve = reserves[asset];

        require(amount > 0, "INVALID_AMOUNT");
        require(reserve.isActive, "RESERVE_INACTIVE");
        require(!reserve.isFrozen, "RESERVE_FROZEN");

        // Step 1: Update state - accrue interest before changing balances
        // This mirrors Fluid's exchange price update in _supplyOrWithdraw
        _updateState(asset);

        // Step 2: Approve and mint aTokens (handles transfer internally)
        IERC20(asset).safeTransferFrom(msg.sender, address(this), amount);
        IERC20(asset).approve(reserve.aTokenAddress, amount);
        AToken(reserve.aTokenAddress).mint(
            onBehalfOf,
            amount,
            reserve.liquidityIndex
        );

        // Step 3: Update totals
        uint256 scaledAmount = amount.rayDiv(reserve.liquidityIndex);
        reserve.totalSupply += amount;
        reserve.totalSupplyScaled += scaledAmount;

        // Step 4: Update user data
        userReserves[onBehalfOf][asset].scaledSupplyBalance += scaledAmount;

        // Step 5: Recalculate interest rates based on new utilization
        _updateInterestRates(asset);

        emit Deposit(asset, msg.sender, onBehalfOf, amount);
    }

    // ============================================================
    //     CORE: WITHDRAW (Fluid's _supplyOrWithdraw with negative amount)
    // ============================================================

    /**
     * @notice Withdraws an amount of underlying asset from the reserve.
     * @dev Flow adapted from Fluid's _supplyOrWithdraw() with negative amount_:
     *      1. Update state (accrue interest)
     *      2. Validate withdrawal doesn't break health factor
     *      3. Burn aTokens (sends underlying to user)
     *      4. Update totals and recalculate rates
     */
    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external nonReentrant returns (uint256) {
        DataTypes.ReserveData storage reserve = reserves[asset];

        require(amount > 0, "INVALID_AMOUNT");
        require(reserve.isActive, "RESERVE_INACTIVE");

        // Accrue interest first
        _updateState(asset);

        // Calculate actual balance
        uint256 userBalance = userReserves[msg.sender][asset]
            .scaledSupplyBalance
            .rayMul(reserve.liquidityIndex);

        // If amount is type(uint256).max, withdraw everything
        uint256 amountToWithdraw = amount > userBalance ? userBalance : amount;

        // Validate health factor after withdrawal (if this is collateral)
        if (userReserves[msg.sender][asset].isCollateral) {
            _validateHealthFactorAfterWithdraw(
                msg.sender,
                asset,
                amountToWithdraw
            );
        }

        // Burn aTokens and send underlying
        uint256 scaledAmount = amountToWithdraw.rayDiv(reserve.liquidityIndex);
        AToken(reserve.aTokenAddress).burn(
            msg.sender,
            to,
            amountToWithdraw,
            reserve.liquidityIndex
        );

        // Update totals
        reserve.totalSupply -= amountToWithdraw;
        reserve.totalSupplyScaled -= scaledAmount;
        userReserves[msg.sender][asset].scaledSupplyBalance -= scaledAmount;

        // Recalculate rates
        _updateInterestRates(asset);

        emit Withdraw(asset, msg.sender, to, amountToWithdraw);
        return amountToWithdraw;
    }

    // ============================================================
    //    CORE: BORROW (Fluid's _borrowOrPayback with positive amount)
    // ============================================================

    /**
     * @notice Borrows an amount of underlying asset from the reserve.
     * @dev Flow adapted from Fluid's borrow logic:
     *      1. Update state
     *      2. Validate health factor allows this borrow
     *      3. Mint debt tokens to borrower
     *      4. Transfer underlying from aToken to borrower
     *      5. Update totals and rates
     */
    function borrow(
        address asset,
        uint256 amount,
        address onBehalfOf
    ) external nonReentrant {
        DataTypes.ReserveData storage reserve = reserves[asset];

        require(reserve.isActive, "RESERVE_INACTIVE");
        require(!reserve.isFrozen, "RESERVE_FROZEN");
        require(reserve.borrowingEnabled, "BORROWING_NOT_ENABLED");
        require(amount > 0, "INVALID_AMOUNT");

        // Accrue interest first
        _updateState(asset);

        // Check available liquidity
        uint256 availableLiquidity = IERC20(asset).balanceOf(
            reserve.aTokenAddress
        );
        require(amount <= availableLiquidity, "INSUFFICIENT_LIQUIDITY");

        // Mint debt
        uint256 scaledDebt = amount.rayDiv(reserve.variableBorrowIndex);
        VariableDebtToken(reserve.variableDebtTokenAddress).mint(
            msg.sender,
            onBehalfOf,
            amount,
            reserve.variableBorrowIndex
        );

        // Transfer underlying to borrower
        AToken(reserve.aTokenAddress).transferUnderlyingTo(msg.sender, amount);

        // Update totals
        reserve.totalBorrow += amount;
        reserve.totalBorrowScaled += scaledDebt;
        userReserves[onBehalfOf][asset].scaledBorrowBalance += scaledDebt;

        // Validate health factor AFTER the borrow
        _validateHealthFactor(onBehalfOf);

        // Recalculate rates
        _updateInterestRates(asset);

        emit Borrow(
            asset,
            msg.sender,
            onBehalfOf,
            amount,
            reserve.currentVariableBorrowRate
        );
    }

    // ============================================================
    //    CORE: REPAY (Fluid's _borrowOrPayback with negative amount)
    // ============================================================

    /**
     * @notice Repays a borrowed amount on a specific reserve.
     * @dev Mirrors Fluid's payback logic:
     *      1. Update state
     *      2. Calculate actual debt
     *      3. Burn debt tokens
     *      4. Transfer underlying from repayer to aToken
     *      5. Update totals and rates
     */
    function repay(
        address asset,
        uint256 amount,
        address onBehalfOf
    ) external nonReentrant returns (uint256) {
        DataTypes.ReserveData storage reserve = reserves[asset];

        require(reserve.isActive, "RESERVE_INACTIVE");

        // Accrue interest first
        _updateState(asset);

        // Calculate actual debt
        uint256 currentDebt = userReserves[onBehalfOf][asset]
            .scaledBorrowBalance
            .rayMul(reserve.variableBorrowIndex);
        require(currentDebt > 0, "NO_DEBT_TO_REPAY");

        uint256 paybackAmount = amount > currentDebt ? currentDebt : amount;

        // Burn debt tokens
        uint256 scaledPayback = paybackAmount.rayDiv(
            reserve.variableBorrowIndex
        );
        VariableDebtToken(reserve.variableDebtTokenAddress).burn(
            onBehalfOf,
            paybackAmount,
            reserve.variableBorrowIndex
        );

        // Transfer underlying to aToken (replenish liquidity)
        IERC20(asset).safeTransferFrom(
            msg.sender,
            reserve.aTokenAddress,
            paybackAmount
        );

        // Update totals
        reserve.totalBorrow = reserve.totalBorrow >= paybackAmount
            ? reserve.totalBorrow - paybackAmount
            : 0;
        reserve.totalBorrowScaled = reserve.totalBorrowScaled >= scaledPayback
            ? reserve.totalBorrowScaled - scaledPayback
            : 0;
        userReserves[onBehalfOf][asset].scaledBorrowBalance -= scaledPayback;

        // Recalculate rates
        _updateInterestRates(asset);

        emit Repay(asset, onBehalfOf, msg.sender, paybackAmount);
        return paybackAmount;
    }

    // ============================================================
    //                  CORE: LIQUIDATION
    //     (Adapted from Fluid's liquidateModule)
    // ============================================================

    /**
     * @notice Liquidates an undercollateralized position.
     * @dev Mirrors Fluid Money Market's liquidation logic:
     *      1. Verify position is liquidatable (healthFactor < 1.0)
     *      2. Calculate max liquidatable amount (close factor = 50%)
     *      3. Calculate collateral to seize (with liquidation bonus)
     *      4. Execute: repay debt, seize collateral
     *
     * @param collateralAsset The collateral asset to seize
     * @param debtAsset The debt asset being repaid
     * @param user The user being liquidated
     * @param debtToCover Amount of debt the liquidator wants to repay
     * @param receiveAToken Whether to receive aTokens or underlying
     */
    function liquidate(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover,
        bool receiveAToken
    ) external nonReentrant {
        // Accrue interest on both assets
        _updateState(collateralAsset);
        _updateState(debtAsset);

        DataTypes.ReserveData storage collateralReserve = reserves[
            collateralAsset
        ];
        DataTypes.ReserveData storage debtReserve = reserves[debtAsset];

        // 1. Verify position is liquidatable
        uint256 healthFactor = _calculateHealthFactor(user);
        require(
            healthFactor < MathUtils.WAD,
            "HEALTH_FACTOR_NOT_BELOW_THRESHOLD"
        );

        // 2. Calculate max liquidatable amount (50% close factor)
        uint256 userDebt = userReserves[user][debtAsset]
            .scaledBorrowBalance
            .rayMul(debtReserve.variableBorrowIndex);
        uint256 maxLiquidatable = userDebt / 2; // 50% close factor
        uint256 actualDebtToCover = debtToCover > maxLiquidatable
            ? maxLiquidatable
            : debtToCover;

        // 3. Calculate collateral to seize
        uint256 debtAssetPrice = _getAssetPrice(debtAsset);
        uint256 collateralPrice = _getAssetPrice(collateralAsset);

        // collateralAmount = debtToCover * debtPrice / collateralPrice * liquidationBonus
        uint256 collateralToSeize = (actualDebtToCover *
            debtAssetPrice *
            collateralReserve.liquidationBonus) /
            (collateralPrice * MathUtils.PERCENTAGE_FACTOR);

        // Adjust for decimals
        uint256 debtDecimals = debtReserve.decimals;
        uint256 collDecimals = collateralReserve.decimals;
        if (debtDecimals > collDecimals) {
            collateralToSeize =
                collateralToSeize /
                (10 ** (debtDecimals - collDecimals));
        } else if (collDecimals > debtDecimals) {
            collateralToSeize =
                collateralToSeize *
                (10 ** (collDecimals - debtDecimals));
        }

        // Validate user has enough collateral
        uint256 userCollateral = userReserves[user][collateralAsset]
            .scaledSupplyBalance
            .rayMul(collateralReserve.liquidityIndex);
        require(collateralToSeize <= userCollateral, "NOT_ENOUGH_COLLATERAL");

        // 4. Execute liquidation

        // Repay the debt: liquidator pays debt
        IERC20(debtAsset).safeTransferFrom(
            msg.sender,
            debtReserve.aTokenAddress,
            actualDebtToCover
        );

        // Burn debt tokens for the user
        uint256 scaledDebt = actualDebtToCover.rayDiv(
            debtReserve.variableBorrowIndex
        );
        VariableDebtToken(debtReserve.variableDebtTokenAddress).burn(
            user,
            actualDebtToCover,
            debtReserve.variableBorrowIndex
        );
        debtReserve.totalBorrow -= actualDebtToCover;
        debtReserve.totalBorrowScaled -= scaledDebt;
        userReserves[user][debtAsset].scaledBorrowBalance -= scaledDebt;

        // Transfer collateral to liquidator
        uint256 scaledCollateral = collateralToSeize.rayDiv(
            collateralReserve.liquidityIndex
        );
        if (receiveAToken) {
            AToken(collateralReserve.aTokenAddress).transferOnLiquidation(
                user,
                msg.sender,
                collateralToSeize,
                collateralReserve.liquidityIndex
            );
        } else {
            AToken(collateralReserve.aTokenAddress).burn(
                user,
                msg.sender,
                collateralToSeize,
                collateralReserve.liquidityIndex
            );
        }
        collateralReserve.totalSupply -= collateralToSeize;
        collateralReserve.totalSupplyScaled -= scaledCollateral;
        userReserves[user][collateralAsset]
            .scaledSupplyBalance -= scaledCollateral;

        // Update rates for both assets
        _updateInterestRates(collateralAsset);
        _updateInterestRates(debtAsset);

        emit Liquidate(
            collateralAsset,
            debtAsset,
            user,
            actualDebtToCover,
            collateralToSeize
        );
    }

    // ============================================================
    //              COLLATERAL MANAGEMENT
    // ============================================================

    /**
     * @notice Enable/disable an asset as collateral for the caller.
     */
    function setUserUseReserveAsCollateral(
        address asset,
        bool useAsCollateral
    ) external {
        DataTypes.UserReserveData storage userData = userReserves[msg.sender][
            asset
        ];

        if (!useAsCollateral) {
            // Ensure removing collateral doesn't break health factor
            _validateHealthFactorAfterWithdraw(msg.sender, asset, 0);
        }

        userData.isCollateral = useAsCollateral;
        emit CollateralToggled(msg.sender, asset, useAsCollateral);
    }

    // ============================================================
    //         INTERNAL: STATE UPDATE (Fluid's calcExchangePrices)
    // ============================================================

    /**
     * @notice Accrues interest by updating exchange prices (indices).
     * @dev This is the AION equivalent of Fluid's calcExchangePrices() logic:
     *
     *      Fluid formula:
     *        borrowExchangePrice_ += (borrowExchangePrice_ * borrowRate * secondsSinceLastUpdate) / (SECONDS_PER_YEAR * FOUR_DECIMALS)
     *        supplyExchangePrice_ += (supplyExchangePrice_ * supplyRate * secondsSinceLastUpdate) / (SECONDS_PER_YEAR * FOUR_DECIMALS * ...)
     *
     *      Our equivalent (using RAY precision):
     *        newBorrowIndex = oldBorrowIndex * (1 + borrowRate * timeDelta / SECONDS_PER_YEAR)
     *        newSupplyIndex = oldSupplyIndex * (1 + supplyRate * timeDelta / SECONDS_PER_YEAR)
     */
    function _updateState(address asset) internal {
        DataTypes.ReserveData storage reserve = reserves[asset];

        if (reserve.lastUpdateTimestamp == uint40(block.timestamp)) {
            return; // Already updated this block
        }

        // Calculate new indices using linear interest (same as Fluid)
        if (reserve.totalBorrow > 0) {
            // Borrow index grows based on borrow rate
            uint256 borrowCumulativeInterest = MathUtils
                .calculateLinearInterest(
                    reserve.currentVariableBorrowRate,
                    reserve.lastUpdateTimestamp
                );
            uint256 newBorrowIndex = uint256(reserve.variableBorrowIndex)
                .rayMul(borrowCumulativeInterest);
            reserve.variableBorrowIndex = uint128(newBorrowIndex);

            // Supply index grows based on supply rate
            uint256 supplyCumulativeInterest = MathUtils
                .calculateLinearInterest(
                    reserve.currentLiquidityRate,
                    reserve.lastUpdateTimestamp
                );
            uint256 newSupplyIndex = uint256(reserve.liquidityIndex).rayMul(
                supplyCumulativeInterest
            );

            // Mint protocol revenue to treasury (Fluid's revenue collection)
            _mintToTreasury(asset, reserve, newSupplyIndex);

            reserve.liquidityIndex = uint128(newSupplyIndex);

            // Update actual totals based on new indices
            reserve.totalSupply = reserve.totalSupplyScaled.rayMul(
                newSupplyIndex
            );
            reserve.totalBorrow = reserve.totalBorrowScaled.rayMul(
                newBorrowIndex
            );
        }

        reserve.lastUpdateTimestamp = uint40(block.timestamp);

        emit ReserveStateUpdated(
            asset,
            reserve.liquidityIndex,
            reserve.variableBorrowIndex,
            reserve.currentLiquidityRate,
            reserve.currentVariableBorrowRate
        );
    }

    /**
     * @notice Mints accrued protocol revenue to the treasury.
     * @dev Mirrors Fluid's calcRevenue() logic.
     */
    function _mintToTreasury(
        address asset,
        DataTypes.ReserveData storage reserve,
        uint256 newLiquidityIndex
    ) internal {
        if (reserve.reserveFactor == 0) return;

        // Revenue = totalBorrow * borrowRate * timeDelta * reserveFactor
        // Simplified: mint the difference between total interest earned (by borrow index)
        // and total interest distributed (by supply index)
        uint256 prevTotalSupply = reserve.totalSupplyScaled.rayMul(
            reserve.liquidityIndex
        );
        uint256 newTotalSupply = reserve.totalSupplyScaled.rayMul(
            newLiquidityIndex
        );

        if (newTotalSupply > prevTotalSupply) {
            uint256 interestAccrued = newTotalSupply - prevTotalSupply;
            uint256 treasuryShare = (interestAccrued * reserve.reserveFactor) /
                MathUtils.PERCENTAGE_FACTOR;

            if (treasuryShare > 0 && treasury != address(0)) {
                AToken(reserve.aTokenAddress).mintToTreasury(
                    treasury,
                    treasuryShare,
                    newLiquidityIndex
                );
            }
        }
    }

    /**
     * @notice Recalculates interest rates after a state change.
     * @dev Calls the InterestRateModel (our clean version of Fluid's calcRateV1/V2)
     *      to get new rates based on current utilization.
     */
    function _updateInterestRates(address asset) internal {
        DataTypes.ReserveData storage reserve = reserves[asset];

        (uint256 newLiquidityRate, uint256 newBorrowRate) = interestRateModel
            .calculateInterestRates(
                asset,
                reserve.totalSupply,
                reserve.totalBorrow,
                reserve.reserveFactor
            );

        reserve.currentLiquidityRate = uint128(newLiquidityRate);
        reserve.currentVariableBorrowRate = uint128(newBorrowRate);
    }

    // ============================================================
    //        INTERNAL: HEALTH FACTOR (Fluid Money Market Pattern)
    // ============================================================

    /**
     * @notice Calculates the health factor for a user.
     * @dev Health Factor = Σ(collateral_i * price_i * liquidationThreshold_i) / Σ(debt_j * price_j)
     *
     *      This mirrors Fluid Money Market's health factor calculation where:
     *      - Each collateral position contributes based on its weight and LTV
     *      - Each debt position is valued at market price
     *      - HF >= 1.0 means safe, HF < 1.0 means liquidatable
     *
     * @param user The user to calculate HF for
     * @return healthFactor in WAD (1e18 = 1.0)
     */
    function _calculateHealthFactor(
        address user
    ) internal view returns (uint256) {
        uint256 totalCollateralUSD = 0;
        uint256 totalDebtUSD = 0;

        for (uint256 i = 0; i < reservesList.length; i++) {
            address asset = reservesList[i];
            DataTypes.ReserveData storage reserve = reserves[asset];
            DataTypes.UserReserveData storage userData = userReserves[user][
                asset
            ];

            uint256 assetPrice = _getAssetPrice(asset);

            // Add collateral value (weighted by liquidation threshold)
            if (userData.isCollateral && userData.scaledSupplyBalance > 0) {
                uint256 supplyBalance = userData.scaledSupplyBalance.rayMul(
                    reserve.liquidityIndex
                );
                uint256 collateralValueUSD = (supplyBalance * assetPrice) /
                    (10 ** reserve.decimals);
                totalCollateralUSD +=
                    (collateralValueUSD * reserve.liquidationThreshold) /
                    MathUtils.PERCENTAGE_FACTOR;
            }

            // Add debt value
            if (userData.scaledBorrowBalance > 0) {
                uint256 borrowBalance = userData.scaledBorrowBalance.rayMul(
                    reserve.variableBorrowIndex
                );
                totalDebtUSD +=
                    (borrowBalance * assetPrice) /
                    (10 ** reserve.decimals);
            }
        }

        if (totalDebtUSD == 0) return type(uint256).max; // No debt = infinite health factor

        return (totalCollateralUSD * MathUtils.WAD) / totalDebtUSD;
    }

    function _validateHealthFactor(address user) internal view {
        uint256 hf = _calculateHealthFactor(user);
        require(hf >= MathUtils.WAD, "HEALTH_FACTOR_TOO_LOW");
    }

    function _validateHealthFactorAfterWithdraw(
        address user,
        address asset,
        uint256 withdrawAmount
    ) internal view {
        // Simulate health factor after withdrawal by subtracting the
        // collateral value that would be removed
        uint256 totalCollateralUSD = 0;
        uint256 totalDebtUSD = 0;

        for (uint256 i = 0; i < reservesList.length; i++) {
            address reserveAsset = reservesList[i];
            DataTypes.ReserveData storage reserve = reserves[reserveAsset];
            DataTypes.UserReserveData storage userData = userReserves[user][
                reserveAsset
            ];

            uint256 assetPrice = _getAssetPrice(reserveAsset);

            // Add collateral value (weighted by liquidation threshold)
            if (userData.isCollateral && userData.scaledSupplyBalance > 0) {
                uint256 supplyBalance = userData.scaledSupplyBalance.rayMul(
                    reserve.liquidityIndex
                );

                // Subtract withdrawal amount for the target asset
                if (reserveAsset == asset && withdrawAmount > 0) {
                    supplyBalance = supplyBalance > withdrawAmount
                        ? supplyBalance - withdrawAmount
                        : 0;
                }

                uint256 collateralValueUSD = (supplyBalance * assetPrice) /
                    (10 ** reserve.decimals);
                totalCollateralUSD +=
                    (collateralValueUSD * reserve.liquidationThreshold) /
                    MathUtils.PERCENTAGE_FACTOR;
            }

            // Add debt value
            if (userData.scaledBorrowBalance > 0) {
                uint256 borrowBalance = userData.scaledBorrowBalance.rayMul(
                    reserve.variableBorrowIndex
                );
                totalDebtUSD +=
                    (borrowBalance * assetPrice) /
                    (10 ** reserve.decimals);
            }
        }

        // No debt = always safe
        if (totalDebtUSD == 0) return;

        uint256 simulatedHF = (totalCollateralUSD * MathUtils.WAD) /
            totalDebtUSD;
        require(simulatedHF >= MathUtils.WAD, "WITHDRAWAL_WOULD_BREAK_HF");
    }

    // ============================================================
    //                ORACLE: PRICE FEEDS
    //       (Chainlink Data Feeds integration)
    // ============================================================

    /**
     * @notice Gets the price of an asset from Chainlink Data Feeds.
     * @dev In Fluid, the oracle system is complex with multiple fallback layers.
     *      We integrate directly with Chainlink for the hackathon.
     * @param asset The asset to get the price for
     * @return price in USD with 8 decimals (Chainlink standard)
     */
    function _getAssetPrice(address asset) internal view returns (uint256) {
        address feed = priceFeeds[asset];
        if (feed == address(0)) {
            // Fallback: return 1 USD for stablecoins in testing
            return 1e8;
        }

        // Chainlink AggregatorV3Interface
        (, int256 price, , , ) = IChainlinkAggregator(feed).latestRoundData();
        require(price > 0, "INVALID_PRICE");
        return uint256(price);
    }

    // ============================================================
    //            AI YIELD ENGINE HOOKS (CRE Integration)
    // ============================================================

    /**
     * @notice Sets the AI yield engine address for CRE workflow integration.
     */
    function setAIYieldEngine(address engine) external onlyOwner {
        aiYieldEngine = engine;
        emit AIYieldEngineUpdated(engine);
    }

    /**
     * @notice Hook for AI-driven rate adjustment via Chainlink CRE.
     * @dev Called by the AI yield engine after CRE workflow execution.
     *      Allows AI to influence interest rate parameters based on market conditions.
     */
    function aiAdjustRateParams(
        address asset,
        uint256 baseRate,
        uint256 rateSlope1,
        uint256 rateSlope2,
        uint256 optimalUtilization
    ) external {
        require(msg.sender == aiYieldEngine, "Only AI engine");
        interestRateModel.setRateParams(
            asset,
            baseRate,
            rateSlope1,
            rateSlope2,
            optimalUtilization
        );
    }

    // ============================================================
    //                    VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Returns comprehensive user account data across all reserves.
     * @dev Calculates total collateral, total debt, and health factor.
     */
    function getUserAccountData(
        address user
    ) external view returns (DataTypes.UserAccountData memory) {
        uint256 totalCollateralUSD = 0;
        uint256 totalDebtUSD = 0;
        uint256 weightedLtvSum = 0;
        uint256 weightedThresholdSum = 0;

        for (uint256 i = 0; i < reservesList.length; i++) {
            address asset = reservesList[i];
            DataTypes.ReserveData storage reserve = reserves[asset];
            DataTypes.UserReserveData storage userData = userReserves[user][
                asset
            ];

            uint256 assetPrice = _getAssetPrice(asset);

            if (userData.isCollateral && userData.scaledSupplyBalance > 0) {
                uint256 supplyBalance = userData.scaledSupplyBalance.rayMul(
                    reserve.liquidityIndex
                );
                uint256 valueUSD = (supplyBalance * assetPrice) /
                    (10 ** reserve.decimals);
                totalCollateralUSD += valueUSD;
                weightedLtvSum += valueUSD * reserve.ltv;
                weightedThresholdSum += valueUSD * reserve.liquidationThreshold;
            }

            if (userData.scaledBorrowBalance > 0) {
                uint256 borrowBalance = userData.scaledBorrowBalance.rayMul(
                    reserve.variableBorrowIndex
                );
                totalDebtUSD +=
                    (borrowBalance * assetPrice) /
                    (10 ** reserve.decimals);
            }
        }

        uint256 avgLtv = totalCollateralUSD > 0
            ? weightedLtvSum / totalCollateralUSD
            : 0;
        uint256 avgThreshold = totalCollateralUSD > 0
            ? weightedThresholdSum / totalCollateralUSD
            : 0;
        uint256 availableBorrows = totalCollateralUSD > 0
            ? ((totalCollateralUSD * avgLtv) / MathUtils.PERCENTAGE_FACTOR) -
                totalDebtUSD
            : 0;
        uint256 hf = totalDebtUSD > 0
            ? (totalCollateralUSD * avgThreshold * MathUtils.WAD) /
                (totalDebtUSD * MathUtils.PERCENTAGE_FACTOR)
            : type(uint256).max;

        return
            DataTypes.UserAccountData({
                totalCollateralUSD: totalCollateralUSD,
                totalDebtUSD: totalDebtUSD,
                availableBorrowsUSD: availableBorrows,
                currentLiquidationThreshold: avgThreshold,
                ltv: avgLtv,
                healthFactor: hf
            });
    }

    /**
     * @notice Returns the reserve data for an asset.
     */
    function getReserveData(
        address asset
    ) external view returns (DataTypes.ReserveData memory) {
        return reserves[asset];
    }

    /**
     * @notice Returns the number of active reserves.
     */
    function getReservesCount() external view returns (uint256) {
        return reservesList.length;
    }

    /**
     * @notice Returns the current health factor for a user.
     */
    function getHealthFactor(address user) external view returns (uint256) {
        return _calculateHealthFactor(user);
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setPriceFeed(address asset, address feed) external onlyOwner {
        priceFeeds[asset] = feed;
    }

    function setTreasury(address treasury_) external onlyOwner {
        treasury = treasury_;
    }

    function setReserveFrozen(address asset, bool frozen) external onlyOwner {
        reserves[asset].isFrozen = frozen;
    }

    function setBorrowingEnabled(
        address asset,
        bool enabled
    ) external onlyOwner {
        reserves[asset].borrowingEnabled = enabled;
    }
}

// ============================================================
//          CHAINLINK INTERFACE (minimal for compilation)
// ============================================================

interface IChainlinkAggregator {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );
}
