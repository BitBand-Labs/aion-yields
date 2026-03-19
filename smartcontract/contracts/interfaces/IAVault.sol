// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";

/**
 * @title IAionVault
 * @author ChainNomads (AION Finance)
 * @notice Interface for the AION ERC4626 yield vault with tranche-based risk
 *         segmentation, strategy management, and harvest/rebalance system.
 */
interface IAionVault is IERC4626 {
    // ============================================================
    //                        ENUMS
    // ============================================================

    enum VaultType {
        STABLE,     // Stablecoins (USDC, USDT, DAI) — conservative defaults
        VOLATILE    // Volatile assets (ETH, AVAX, BTC) — aggressive defaults
    }

    // ============================================================
    //                        STRUCTS
    // ============================================================

    struct StrategyParams {
        uint256 activation;
        uint256 lastReport;
        uint256 currentDebt;
        uint256 maxDebt;
        uint256 totalGain;
        uint256 totalLoss;
    }

    struct Tranche {
        uint256 totalAssets;
        uint256 totalShares;
        uint256 yieldMultiplier;
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event StrategyAdded(address indexed strategy, uint256 maxDebt);
    event StrategyRemoved(address indexed strategy);
    event StrategyMaxDebtUpdated(address indexed strategy, uint256 oldMaxDebt, uint256 newMaxDebt);
    event DebtUpdated(address indexed strategy, uint256 oldDebt, uint256 newDebt);
    event StrategyReported(address indexed strategy, uint256 gain, uint256 loss, uint256 currentDebt, uint256 protocolFees, uint256 totalFees);
    event DepositLimitUpdated(uint256 oldLimit, uint256 newLimit);
    event MinimumTotalIdleUpdated(uint256 oldIdle, uint256 newIdle);
    event VaultPaused(address indexed caller);
    event VaultUnpaused(address indexed caller);

    event TrancheDeposit(address indexed user, uint8 indexed trancheId, uint256 assets, uint256 shares, address receiver);
    event TrancheWithdraw(address indexed user, uint8 indexed trancheId, uint256 assets, uint256 shares, address receiver);
    event YieldDistributed(uint256 totalYield, uint256 seniorYield, uint256 juniorYield);
    event LossAbsorbed(uint256 totalLoss, uint256 juniorLoss, uint256 seniorLoss);
    event ProtocolFeesClaimed(address indexed recipient, uint256 amount);

    // ============================================================
    //                    TRANCHE OPERATIONS
    // ============================================================

    function depositTranche(uint256 assets, uint8 trancheId, address receiver) external returns (uint256 shares);

    function withdrawTranche(uint256 assets, uint8 trancheId, address receiver) external returns (uint256 shares);

    // ============================================================
    //                    STRATEGY MANAGEMENT
    // ============================================================

    function addStrategy(address strategy, uint256 maxDebt) external;

    function revokeStrategy(address strategy) external;

    function updateMaxDebt(address strategy, uint256 newMaxDebt) external;

    // ============================================================
    //                    DEBT MANAGEMENT
    // ============================================================

    function updateDebt(address strategy, uint256 targetDebt) external;

    // ============================================================
    //                    HARVEST / REPORTING
    // ============================================================

    function processReport(address strategy) external returns (uint256 gain, uint256 loss);

    // ============================================================
    //                    FEE CLAIMING
    // ============================================================

    function claimFees() external;

    // ============================================================
    //                    VIEW FUNCTIONS
    // ============================================================

    function strategies(address strategy) external view returns (StrategyParams memory);

    function totalDebt() external view returns (uint256);

    function totalIdle() external view returns (uint256);

    function depositLimit() external view returns (uint256);

    function minimumTotalIdle() external view returns (uint256);

    function paused() external view returns (bool);

    function vaultType() external view returns (VaultType);

    function accruedProtocolFees() external view returns (uint256);

    function getActiveStrategies() external view returns (address[] memory);

    function getTranche(uint8 trancheId) external view returns (Tranche memory);

    function getUserShares(address user, uint8 trancheId) external view returns (uint256);

    function convertToAssetsTranche(uint256 shares, uint8 trancheId) external view returns (uint256);

    function convertToSharesTranche(uint256 assets, uint8 trancheId) external view returns (uint256);

    function tranchePricePerShare(uint8 trancheId) external view returns (uint256);

    function getUserTotalValue(address user) external view returns (uint256 seniorValue, uint256 juniorValue, uint256 total);

    // ============================================================
    //                REALTIME VIEW FUNCTIONS
    // ============================================================

    function getRealtimeTotalAssets() external view returns (uint256 realTotal);

    function getUnrealizedPnL() external view returns (uint256 totalUnrealizedGain, uint256 totalUnrealizedLoss);

    function getRealtimeTranchePrice(uint8 trancheId) external view returns (uint256);

    function previewHarvest(address strategy) external view returns (
        uint256 gain,
        uint256 loss,
        uint256 estimatedFees,
        uint256 seniorImpact,
        uint256 juniorImpact,
        bool seniorExposed
    );

    function getPendingFees(address strategy) external view returns (uint256 pendingPerfFee, uint256 pendingMgmtFee, uint256 totalPending);

    function getTotalPendingFees() external view returns (uint256 total);

    function previewWithdrawTranche(uint256 assets, uint8 trancheId) external view returns (uint256 sharesNeeded, bool willPullFromStrategies);

    // ============================================================
    //                IDLE REBALANCING
    // ============================================================

    function rebalanceIdle() external;
}
