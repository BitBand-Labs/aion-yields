// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ProtocolFeeController
 * @author ChainNomads (AION Yield)
 * @notice Centralized protocol fee management for the AION Yield money market.
 *
 * @dev Manages all protocol fee parameters and treasury fund distribution:
 *      - Reserve factors per asset (% of interest going to protocol)
 *      - Flash loan fees
 *      - Liquidation protocol share
 *      - Treasury withdrawal and distribution
 *
 *      Fee Flow:
 *      ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
 *      │ Interest      │ ──→ │ This          │ ──→ │ Treasury     │
 *      │ Accrued       │     │ Controller    │     │ Wallet       │
 *      └──────────────┘     └───────────────┘     └──────────────┘
 *                                  │
 *                                  ├──→ Insurance Fund
 *                                  ├──→ Development Fund
 *                                  └──→ Staking Rewards
 */
contract ProtocolFeeController is Ownable {
    using SafeERC20 for IERC20;

    // ============================================================
    //                      CONSTANTS
    // ============================================================

    /// @dev Maximum reserve factor: 50%
    uint256 public constant MAX_RESERVE_FACTOR = 5000;

    /// @dev Maximum flash loan fee: 1%
    uint256 public constant MAX_FLASH_LOAN_FEE = 100;

    /// @dev Maximum liquidation protocol share: 50%
    uint256 public constant MAX_LIQUIDATION_PROTOCOL_SHARE = 5000;

    /// @dev Basis points denominator
    uint256 public constant BPS = 10000;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Treasury address for protocol revenue
    address public treasury;

    /// @dev Insurance fund address (covers bad debt)
    address public insuranceFund;

    /// @dev Development fund address
    address public developmentFund;

    /// @dev Per-asset reserve factor in bps (portion of interest to protocol)
    mapping(address => uint256) public reserveFactors;

    /// @dev Flash loan fee in bps (e.g., 9 = 0.09%)
    uint256 public flashLoanFee = 9;

    /// @dev Protocol's share of liquidation bonus in bps
    uint256 public liquidationProtocolShare = 1000; // 10%

    /// @dev Treasury distribution ratios in bps (must sum to 10000)
    uint256 public treasuryShare = 5000; // 50% to treasury
    uint256 public insuranceShare = 3000; // 30% to insurance
    uint256 public developmentShare = 2000; // 20% to dev fund

    /// @dev Total fees collected per asset (for accounting)
    mapping(address => uint256) public totalFeesCollected;

    /// @dev Total fees distributed per asset
    mapping(address => uint256) public totalFeesDistributed;

    /// @dev Accrued undistributed fees per asset
    mapping(address => uint256) public accruedFees;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event ReserveFactorUpdated(
        address indexed asset,
        uint256 oldFactor,
        uint256 newFactor
    );
    event FlashLoanFeeUpdated(uint256 oldFee, uint256 newFee);
    event LiquidationProtocolShareUpdated(uint256 oldShare, uint256 newShare);
    event FeesCollected(address indexed asset, uint256 amount, string source);
    event FeesDistributed(
        address indexed asset,
        uint256 toTreasury,
        uint256 toInsurance,
        uint256 toDevelopment
    );
    event DistributionRatiosUpdated(
        uint256 treasuryShare,
        uint256 insuranceShare,
        uint256 developmentShare
    );
    event TreasuryUpdated(
        address indexed oldTreasury,
        address indexed newTreasury
    );
    event InsuranceFundUpdated(
        address indexed oldFund,
        address indexed newFund
    );
    event DevelopmentFundUpdated(
        address indexed oldFund,
        address indexed newFund
    );

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address treasury_,
        address insuranceFund_,
        address developmentFund_
    ) Ownable(initialOwner) {
        require(treasury_ != address(0), "Invalid treasury");
        treasury = treasury_;
        insuranceFund = insuranceFund_;
        developmentFund = developmentFund_;
    }

    // ============================================================
    //                FEE PARAMETER MANAGEMENT
    // ============================================================

    /**
     * @notice Set the reserve factor for a specific asset.
     * @dev Reserve factor determines what % of interest income goes to protocol.
     * @param asset The reserve asset address
     * @param factor New reserve factor in bps (e.g., 1000 = 10%)
     */
    function setReserveFactor(
        address asset,
        uint256 factor
    ) external onlyOwner {
        require(factor <= MAX_RESERVE_FACTOR, "Exceeds max reserve factor");
        uint256 oldFactor = reserveFactors[asset];
        reserveFactors[asset] = factor;
        emit ReserveFactorUpdated(asset, oldFactor, factor);
    }

    /**
     * @notice Set the flash loan fee.
     * @param fee New fee in bps (e.g., 9 = 0.09%)
     */
    function setFlashLoanFee(uint256 fee) external onlyOwner {
        require(fee <= MAX_FLASH_LOAN_FEE, "Exceeds max flash loan fee");
        uint256 oldFee = flashLoanFee;
        flashLoanFee = fee;
        emit FlashLoanFeeUpdated(oldFee, fee);
    }

    /**
     * @notice Set the protocol's share of liquidation bonus.
     * @param share New share in bps
     */
    function setLiquidationProtocolShare(uint256 share) external onlyOwner {
        require(share <= MAX_LIQUIDATION_PROTOCOL_SHARE, "Exceeds max share");
        uint256 oldShare = liquidationProtocolShare;
        liquidationProtocolShare = share;
        emit LiquidationProtocolShareUpdated(oldShare, share);
    }

    // ============================================================
    //                 FEE COLLECTION
    // ============================================================

    /**
     * @notice Record fees collected from interest accrual.
     * @dev Called by the LendingPool when minting treasury shares.
     * @param asset The asset fees were collected in
     * @param amount The fee amount
     */
    function collectFees(
        address asset,
        uint256 amount,
        string calldata source
    ) external {
        require(amount > 0, "Zero amount");
        accruedFees[asset] += amount;
        totalFeesCollected[asset] += amount;
        emit FeesCollected(asset, amount, source);
    }

    /**
     * @notice Calculate the flash loan fee for a given amount.
     * @param amount The flash loan principal
     * @return fee The fee to charge
     */
    function calculateFlashLoanFee(
        uint256 amount
    ) external view returns (uint256) {
        return (amount * flashLoanFee) / BPS;
    }

    /**
     * @notice Calculate the protocol's share of a liquidation bonus.
     * @param bonusAmount The total liquidation bonus
     * @return protocolShare The protocol's portion
     */
    function calculateLiquidationProtocolFee(
        uint256 bonusAmount
    ) external view returns (uint256) {
        return (bonusAmount * liquidationProtocolShare) / BPS;
    }

    // ============================================================
    //                FEE DISTRIBUTION
    // ============================================================

    /**
     * @notice Distribute accrued fees for an asset to treasury, insurance, and dev fund.
     * @dev Anyone can call this to trigger distribution.
     * @param asset The asset to distribute fees for
     */
    function distributeFees(address asset) external {
        uint256 amount = accruedFees[asset];
        require(amount > 0, "No fees to distribute");

        accruedFees[asset] = 0;
        totalFeesDistributed[asset] += amount;

        uint256 toTreasury = (amount * treasuryShare) / BPS;
        uint256 toInsurance = (amount * insuranceShare) / BPS;
        uint256 toDevelopment = amount - toTreasury - toInsurance; // Remainder to avoid rounding loss

        if (toTreasury > 0 && treasury != address(0)) {
            IERC20(asset).safeTransfer(treasury, toTreasury);
        }
        if (toInsurance > 0 && insuranceFund != address(0)) {
            IERC20(asset).safeTransfer(insuranceFund, toInsurance);
        }
        if (toDevelopment > 0 && developmentFund != address(0)) {
            IERC20(asset).safeTransfer(developmentFund, toDevelopment);
        }

        emit FeesDistributed(asset, toTreasury, toInsurance, toDevelopment);
    }

    // ============================================================
    //           DISTRIBUTION RATIO MANAGEMENT
    // ============================================================

    /**
     * @notice Update treasury distribution ratios.
     * @dev All three shares must sum to 10000 (100%).
     */
    function setDistributionRatios(
        uint256 treasuryShare_,
        uint256 insuranceShare_,
        uint256 developmentShare_
    ) external onlyOwner {
        require(
            treasuryShare_ + insuranceShare_ + developmentShare_ == BPS,
            "Shares must sum to 10000"
        );
        treasuryShare = treasuryShare_;
        insuranceShare = insuranceShare_;
        developmentShare = developmentShare_;
        emit DistributionRatiosUpdated(
            treasuryShare_,
            insuranceShare_,
            developmentShare_
        );
    }

    // ============================================================
    //               ADDRESS MANAGEMENT
    // ============================================================

    function setTreasury(address newTreasury) external onlyOwner {
        require(newTreasury != address(0), "Invalid address");
        address old = treasury;
        treasury = newTreasury;
        emit TreasuryUpdated(old, newTreasury);
    }

    function setInsuranceFund(address newFund) external onlyOwner {
        address old = insuranceFund;
        insuranceFund = newFund;
        emit InsuranceFundUpdated(old, newFund);
    }

    function setDevelopmentFund(address newFund) external onlyOwner {
        address old = developmentFund;
        developmentFund = newFund;
        emit DevelopmentFundUpdated(old, newFund);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getReserveFactor(address asset) external view returns (uint256) {
        return reserveFactors[asset];
    }

    function getPendingFees(address asset) external view returns (uint256) {
        return accruedFees[asset];
    }

    function getFeeStats(
        address asset
    )
        external
        view
        returns (uint256 collected, uint256 distributed, uint256 pending)
    {
        return (
            totalFeesCollected[asset],
            totalFeesDistributed[asset],
            accruedFees[asset]
        );
    }
}
