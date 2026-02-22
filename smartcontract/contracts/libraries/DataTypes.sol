// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DataTypes
 * @author ChainNomads (AION Yield)
 * @notice Central data type definitions for the AION Yield protocol.
 * @dev Uses clean struct-based approach instead of Fluid's bit-packing for readability.
 *      Fluid packs everything into uint256 slots for gas optimization.
 *      We use explicit structs for hackathon clarity while maintaining the same logical fields.
 */
library DataTypes {
    // ============================================================
    //                    RESERVE DATA
    // ============================================================

    struct ReserveData {
        // --- Configuration ---
        address aTokenAddress; // Interest-bearing deposit receipt token
        address variableDebtTokenAddress; // Debt tracking token
        address interestRateStrategyAddress; // Rate calculation contract
        address chainlinkPriceFeed; // Chainlink Data Feed address
        // --- Exchange Prices (inspired by Fluid's exchangePricesAndConfig_) ---
        // In Fluid, these are packed into a single uint256 with bit manipulation.
        // We store them explicitly for clarity.
        uint128 liquidityIndex; // Supply exchange price (RAY) - maps to Fluid's supplyExchangePrice_
        uint128 variableBorrowIndex; // Borrow exchange price (RAY) - maps to Fluid's borrowExchangePrice_
        // --- Current Rates ---
        uint128 currentLiquidityRate; // Current supply APY (RAY)
        uint128 currentVariableBorrowRate; // Current borrow APY (RAY)
        // --- Timestamps ---
        uint40 lastUpdateTimestamp; // Maps to Fluid's BITS_EXCHANGE_PRICES_LAST_TIMESTAMP
        // --- Reserve Configuration ---
        uint16 reserveFactor; // % of interest going to treasury (in bps, 1e4 = 100%)
        // Maps to Fluid's BITS_EXCHANGE_PRICES_FEE
        uint16 liquidationThreshold; // LTV at which positions become liquidatable (bps)
        uint16 liquidationBonus; // Bonus for liquidators (bps, e.g. 10500 = 5% bonus)
        uint16 ltv; // Max Loan-to-Value ratio allowed (bps)
        // --- Totals (inspired by Fluid's totalAmounts_) ---
        uint256 totalSupply; // Total deposited (in underlying token decimals)
        uint256 totalBorrow; // Total borrowed
        uint256 totalSupplyScaled; // Total supply in scaled (ray-divided) units
        uint256 totalBorrowScaled; // Total borrow in scaled units
        // --- Flags ---
        bool isActive;
        bool isFrozen;
        bool borrowingEnabled;
        // --- Decimals ---
        uint8 decimals; // Underlying asset decimals
    }

    // ============================================================
    //                USER ACCOUNT DATA
    // ============================================================

    struct UserAccountData {
        uint256 totalCollateralUSD; // Total collateral value in USD (8 decimals from Chainlink)
        uint256 totalDebtUSD; // Total debt value in USD
        uint256 availableBorrowsUSD; // Remaining borrowing capacity in USD
        uint256 currentLiquidationThreshold; // Weighted average liquidation threshold
        uint256 ltv; // Weighted average LTV
        uint256 healthFactor; // health factor (WAD, >= 1e18 means safe)
    }

    // ============================================================
    //         USER RESERVE DATA (per asset per user)
    // ============================================================

    struct UserReserveData {
        uint256 scaledSupplyBalance; // User's supply in scaled units (divide by index to get actual)
        uint256 scaledBorrowBalance; // User's borrow in scaled units
        bool isCollateral; // Whether this asset is used as collateral
    }

    // ============================================================
    //           INTEREST RATE MODEL PARAMS
    //  (Clean version of Fluid's packed rateData_ with kink model)
    // ============================================================

    struct InterestRateParams {
        uint256 baseRate; // Rate at 0% utilization (RAY) - Fluid's RATE_AT_UTILIZATION_ZERO
        uint256 rateSlope1; // Slope before kink (RAY)
        uint256 rateSlope2; // Slope after kink (RAY) - much steeper
        uint256 optimalUtilization; // Kink point (RAY) - Fluid's UTILIZATION_AT_KINK
    }

    // ============================================================
    //                LIQUIDATION PARAMS
    // ============================================================

    struct LiquidationParams {
        address collateralAsset;
        address debtAsset;
        address user;
        uint256 debtToCover;
        bool receiveAToken;
    }

    // ============================================================
    //            AI AGENT DATA (ERC-8004 inspired)
    // ============================================================

    struct AIAgentData {
        address agentAddress; // On-chain agent address
        string metadataURI; // IPFS URI for agent metadata
        uint256 reputationScore; // Cumulative reputation (higher = better)
        uint256 totalTasks; // Number of tasks completed
        uint256 stakedAmount; // Amount staked as collateral for good behavior
        uint256 registrationTime; // When agent was registered
        bool isActive; // Whether agent is currently active
        bool isSlashed; // Whether agent has been slashed
    }

    // ============================================================
    //                CRE WORKFLOW DATA
    // ============================================================

    struct YieldPrediction {
        address targetAsset; // Asset the prediction is about
        uint256 predictedAPY; // AI-predicted APY (in bps)
        uint256 riskScore; // Risk rating (0-10000, lower = safer)
        uint256 confidence; // Confidence level (0-10000)
        uint256 timestamp; // When prediction was made
        address agentId; // Which AI agent made the prediction
    }
}
