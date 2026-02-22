// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/MathUtils.sol";
import "../libraries/DataTypes.sol";

/**
 * @title InterestRateModel
 * @author ChainNomads (AION Yield)
 * @notice Kink-based interest rate model adapted from Fluid DEX V2's rate calculation.
 *
 * @dev This implements the core interest rate logic from Fluid's `calcRateV1` in liquidityCalcs.sol:
 *      - Below optimal utilization: low, linear rate increase
 *      - Above optimal utilization: steep rate increase (the "kink")
 *
 *      Fluid's formula (from calcRateV1):
 *        y = mx + c  (slope-intercept form)
 *        where y = borrow rate, x = utilization
 *        m = (y2 - y1) / (x2 - x1), c = y1 - m * x1
 *
 *      Fluid uses two segments (below/above kink). We implement the same pattern
 *      but with RAY precision instead of Fluid's 1e2 precision for better accuracy.
 *
 *      The supply rate is then derived from the borrow rate:
 *        supplyRate = borrowRate * utilization * (1 - reserveFactor)
 *      This matches Fluid's ratioSupplyYield calculation in calcExchangePrices().
 */
contract InterestRateModel {
    using MathUtils for uint256;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event InterestRateParamsUpdated(
        address indexed asset,
        uint256 baseRate,
        uint256 rateSlope1,
        uint256 rateSlope2,
        uint256 optimalUtilization
    );

    // ============================================================
    //                    DEFAULT PARAMS
    // (Standard Aave/Fluid-style kink model defaults)
    // ============================================================

    /// @dev 2% base rate at 0% utilization
    uint256 public constant DEFAULT_BASE_RATE = 0.02e27;

    /// @dev 4% slope below kink (gentle increase)
    uint256 public constant DEFAULT_SLOPE_1 = 0.04e27;

    /// @dev 300% slope above kink (aggressive increase to discourage over-utilization)
    uint256 public constant DEFAULT_SLOPE_2 = 3.00e27;

    /// @dev 80% optimal utilization (the "kink" point)
    uint256 public constant DEFAULT_OPTIMAL_UTILIZATION = 0.80e27;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Per-asset rate parameters
    mapping(address => DataTypes.InterestRateParams) public rateParams;

    // ============================================================
    //                 CORE RATE CALCULATION
    //     (Adapted from Fluid's calcRateV1 in liquidityCalcs.sol)
    // ============================================================

    /**
     * @notice Calculate interest rates based on utilization.
     * @dev Implements Fluid's kink model:
     *      - if utilization < kink: rate = baseRate + slope1 * (utilization / kink)
     *      - if utilization >= kink: rate = baseRate + slope1 + slope2 * ((utilization - kink) / (1 - kink))
     *
     *      This is equivalent to Fluid's y = mx + c formula with two segments.
     *
     * @param asset The reserve asset address
     * @param totalSupply Total supply in the reserve
     * @param totalBorrow Total borrow from the reserve
     * @param reserveFactor Revenue fee in bps (maps to Fluid's BITS_EXCHANGE_PRICES_FEE)
     * @return liquidityRate Supply rate (RAY)
     * @return variableBorrowRate Borrow rate (RAY)
     */
    function calculateInterestRates(
        address asset,
        uint256 totalSupply,
        uint256 totalBorrow,
        uint256 reserveFactor
    )
        external
        view
        returns (uint256 liquidityRate, uint256 variableBorrowRate)
    {
        DataTypes.InterestRateParams memory params = rateParams[asset];

        // Use defaults if not configured
        if (params.optimalUtilization == 0) {
            params = DataTypes.InterestRateParams({
                baseRate: DEFAULT_BASE_RATE,
                rateSlope1: DEFAULT_SLOPE_1,
                rateSlope2: DEFAULT_SLOPE_2,
                optimalUtilization: DEFAULT_OPTIMAL_UTILIZATION
            });
        }

        // Calculate utilization rate: totalBorrow / totalSupply
        // In Fluid, utilization is stored as 1e4 (100% = 10000)
        // We use RAY (1e27) for precision
        uint256 utilization = 0;
        if (totalSupply > 0) {
            utilization = totalBorrow.rayDiv(totalSupply);
            // Cap utilization at 100%
            if (utilization > MathUtils.RAY) {
                utilization = MathUtils.RAY;
            }
        }

        // Calculate borrow rate using kink model
        // This is the clean version of Fluid's calcRateV1:
        //   if utilization < kink: y = baseRate + slope1 * (x / kink)
        //   if utilization >= kink: y = baseRate + slope1 + slope2 * ((x - kink) / (1 - kink))
        if (utilization < params.optimalUtilization) {
            // Below kink: gentle slope
            // borrowRate = baseRate + rateSlope1 * utilization / optimalUtilization
            variableBorrowRate =
                params.baseRate +
                params.rateSlope1.rayMul(
                    utilization.rayDiv(params.optimalUtilization)
                );
        } else {
            // Above kink: steep slope (penalizes high utilization)
            // borrowRate = baseRate + rateSlope1 + rateSlope2 * (utilization - optimalUtilization) / (1 - optimalUtilization)
            uint256 excessUtilization = utilization - params.optimalUtilization;
            uint256 maxExcessUtilization = MathUtils.RAY -
                params.optimalUtilization;

            variableBorrowRate =
                params.baseRate +
                params.rateSlope1 +
                params.rateSlope2.rayMul(
                    excessUtilization.rayDiv(maxExcessUtilization)
                );
        }

        // Calculate supply rate from borrow rate
        // This mirrors Fluid's supply rate derivation in calcExchangePrices():
        //   supplyRate = borrowRate * (1 - reserveFee) * ratioSupplyYield
        //
        // For our simplified model (no interest-free supply/borrow):
        //   supplyRate = borrowRate * utilization * (1 - reserveFactor)
        //
        // This means suppliers earn (borrow payments - protocol fee) proportional to utilization
        if (totalSupply > 0) {
            liquidityRate = variableBorrowRate.rayMul(utilization).rayMul(
                MathUtils.RAY -
                    ((uint256(reserveFactor) * MathUtils.RAY) /
                        MathUtils.PERCENTAGE_FACTOR)
            );
        }

        return (liquidityRate, variableBorrowRate);
    }

    /**
     * @notice Set rate parameters for a specific asset.
     * @dev Mirrors Fluid's per-token rateData_ configuration.
     */
    function setRateParams(
        address asset,
        uint256 baseRate,
        uint256 rateSlope1,
        uint256 rateSlope2,
        uint256 optimalUtilization
    ) external {
        require(
            optimalUtilization > 0 && optimalUtilization < MathUtils.RAY,
            "Invalid optimal utilization"
        );

        rateParams[asset] = DataTypes.InterestRateParams({
            baseRate: baseRate,
            rateSlope1: rateSlope1,
            rateSlope2: rateSlope2,
            optimalUtilization: optimalUtilization
        });

        emit InterestRateParamsUpdated(
            asset,
            baseRate,
            rateSlope1,
            rateSlope2,
            optimalUtilization
        );
    }

    /**
     * @notice Get the current utilization rate for a reserve.
     * @return Utilization in RAY (1e27 = 100%)
     */
    function getUtilizationRate(
        uint256 totalSupply,
        uint256 totalBorrow
    ) external pure returns (uint256) {
        if (totalSupply == 0) return 0;
        uint256 util = totalBorrow.rayDiv(totalSupply);
        return util > MathUtils.RAY ? MathUtils.RAY : util;
    }
}
