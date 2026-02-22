// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MathUtils
 * @author ChainNomads (AION Yield)
 * @notice Core math library for interest calculations.
 * @dev Uses RAY (1e27) precision for all interest rate math, inspired by
 *      Fluid's exchange price calculation patterns in liquidityCalcs.sol
 *
 *  Key formulas adapted from Fluid DEX V2:
 *  - Exchange price accrual: price += price * rate * timeDelta / SECONDS_PER_YEAR
 *  - Utilization-based rate model: y = mx + c (slope-intercept form with kink)
 *  - Supply rate derivation from borrow rate via utilization ratio
 */
library MathUtils {
    // ============================================================
    //                        CONSTANTS
    // ============================================================

    /// @dev RAY precision (1e27) - same concept as Fluid's EXCHANGE_PRICES_PRECISION but higher precision
    uint256 internal constant RAY = 1e27;
    uint256 internal constant HALF_RAY = RAY / 2;

    /// @dev WAD precision (1e18) for token amounts
    uint256 internal constant WAD = 1e18;
    uint256 internal constant HALF_WAD = WAD / 2;

    /// @dev Percentage precision (1e4) - matches Fluid's FOUR_DECIMALS
    uint256 internal constant PERCENTAGE_FACTOR = 1e4;
    uint256 internal constant HALF_PERCENTAGE = PERCENTAGE_FACTOR / 2;

    /// @dev Seconds per year - matches Fluid's SECONDS_PER_YEAR constant
    uint256 internal constant SECONDS_PER_YEAR = 365 days;

    // ============================================================
    //                      RAY MATH
    // ============================================================

    /**
     * @notice Multiplies two RAY values, rounding half up.
     * @param a First RAY value
     * @param b Second RAY value
     * @return c = a * b / RAY
     */
    function rayMul(uint256 a, uint256 b) internal pure returns (uint256) {
        if (a == 0 || b == 0) return 0;
        return (a * b + HALF_RAY) / RAY;
    }

    /**
     * @notice Divides two RAY values, rounding half up.
     * @param a Numerator (RAY)
     * @param b Denominator (RAY)
     * @return c = a * RAY / b
     */
    function rayDiv(uint256 a, uint256 b) internal pure returns (uint256) {
        require(b != 0, "MathUtils: division by zero");
        return (a * RAY + b / 2) / b;
    }

    /**
     * @notice Converts WAD to RAY precision.
     */
    function wadToRay(uint256 a) internal pure returns (uint256) {
        return a * 1e9;
    }

    /**
     * @notice Converts RAY to WAD precision.
     */
    function rayToWad(uint256 a) internal pure returns (uint256) {
        return (a + 1e9 / 2) / 1e9;
    }

    // ============================================================
    //             EXCHANGE PRICE / INTEREST CALCULATION
    //     (Adapted from Fluid's calcExchangePrices in liquidityCalcs.sol)
    // ============================================================

    /**
     * @notice Calculates the compounded interest rate over a time period.
     * @dev Mirrors Fluid's exchange price update formula:
     *      `borrowExchangePrice_ += (borrowExchangePrice_ * temp_ * secondsSinceLastUpdate_) / (SECONDS_PER_YEAR * FOUR_DECIMALS)`
     *
     *      We use a linear approximation for the hackathon MVP (same as Fluid).
     *      For production: use exponential compounding.
     *
     * @param rate Annual interest rate in RAY (e.g., 5% = 0.05e27)
     * @param lastUpdateTimestamp Last time interest was accrued
     * @return The compounded interest factor in RAY (1.0 + accrued interest)
     */
    function calculateLinearInterest(
        uint256 rate,
        uint40 lastUpdateTimestamp
    ) internal view returns (uint256) {
        uint256 timeDelta = block.timestamp - uint256(lastUpdateTimestamp);

        // Linear approximation: 1 + rate * timeDelta / SECONDS_PER_YEAR
        // This is the same approach Fluid uses for exchange price updates
        return RAY + (rate * timeDelta) / SECONDS_PER_YEAR;
    }

    /**
     * @notice Calculates compounded interest (exponential) for more accurate long-term accrual.
     * @dev Uses Taylor series expansion: e^(rt) ≈ 1 + rt + (rt)^2/2 + (rt)^3/6
     *      This provides better accuracy than Fluid's linear model for long time periods.
     * @param rate Annual rate in RAY
     * @param lastUpdateTimestamp Last update timestamp
     * @return Compounded interest factor in RAY
     */
    function calculateCompoundedInterest(
        uint256 rate,
        uint40 lastUpdateTimestamp
    ) internal view returns (uint256) {
        uint256 timeDelta = block.timestamp - uint256(lastUpdateTimestamp);

        if (timeDelta == 0) return RAY;

        uint256 expMinusOne = timeDelta - 1;
        uint256 expMinusTwo = timeDelta > 2 ? timeDelta - 2 : 0;

        // rate per second
        uint256 ratePerSecond = rate / SECONDS_PER_YEAR;

        uint256 basePowerTwo = rayMul(ratePerSecond, ratePerSecond);
        uint256 basePowerThree = rayMul(basePowerTwo, ratePerSecond);

        // Taylor expansion: 1 + rt + r²t(t-1)/2 + r³t(t-1)(t-2)/6
        uint256 secondTerm = (timeDelta * ratePerSecond);
        uint256 thirdTerm = (timeDelta * expMinusOne * basePowerTwo) / 2;
        uint256 fourthTerm = (timeDelta *
            expMinusOne *
            expMinusTwo *
            basePowerThree) / 6;

        return RAY + secondTerm + thirdTerm + fourthTerm;
    }

    // ============================================================
    //                  PERCENTAGE MATH
    // ============================================================

    /**
     * @notice Calculates percentage of a value.
     * @param value The base value
     * @param percentage Percentage in basis points (1e4 = 100%)
     * @return result = value * percentage / 1e4
     */
    function percentMul(
        uint256 value,
        uint256 percentage
    ) internal pure returns (uint256) {
        if (value == 0 || percentage == 0) return 0;
        return (value * percentage + HALF_PERCENTAGE) / PERCENTAGE_FACTOR;
    }

    /**
     * @notice Divides by percentage.
     * @param value The value to divide
     * @param percentage Percentage in basis points
     * @return result = value * 1e4 / percentage
     */
    function percentDiv(
        uint256 value,
        uint256 percentage
    ) internal pure returns (uint256) {
        require(percentage != 0, "MathUtils: division by zero");
        return (value * PERCENTAGE_FACTOR + percentage / 2) / percentage;
    }
}
