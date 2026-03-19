// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title ProtocolFeeController
 * @author ChainNomads (AION Finance)
 * @notice Governance-level fee configuration and fee share distribution.
 *
 * @dev The AionVault executes fee logic internally (mints fee shares to feeRecipient).
 *      This controller serves as:
 *      1. Global fee config store (default performance + management fees)
 *      2. Per-vault fee overrides
 *      3. Per-strategy fee overrides
 *      4. Fee recipient (receives vault fee shares, then distributes)
 *
 *      FEE FLOW:
 *      ┌──────────────┐     ┌───────────────┐     ┌──────────────┐
 *      │ AionVault     │ --> │ This          │ --> │ Treasury     │
 *      │ mints fee     │     │ Controller    │     │ Wallet       │
 *      │ shares        │     │ (feeRecipient)│     └──────────────┘
 *      └──────────────┘     └───────────────┘           │
 *                                  ├--> Insurance Fund   │
 *                                  └--> Development Fund │
 */
contract ProtocolFeeController is Ownable {
    using SafeERC20 for IERC20;

    // ============================================================
    //                      CONSTANTS
    // ============================================================

    /// @dev Maximum vault performance fee: 50%
    uint256 public constant MAX_PERFORMANCE_FEE = 5000;

    /// @dev Maximum vault management fee: 5%
    uint256 public constant MAX_MANAGEMENT_FEE = 500;

    /// @dev Basis points denominator
    uint256 public constant BPS = 10000;

    // ============================================================
    //                      STORAGE
    // ============================================================

    // ---- Fund Addresses ----

    /// @dev Treasury address for protocol revenue
    address public treasury;

    /// @dev Insurance fund address
    address public insuranceFund;

    /// @dev Development fund address
    address public developmentFund;

    // ---- Distribution Ratios (must sum to BPS) ----

    uint256 public treasuryShare = 5000;     // 50%
    uint256 public insuranceShare = 3000;    // 30%
    uint256 public developmentShare = 2000;  // 20%

    // ---- Global Vault Fee Defaults ----

    /// @dev Default performance fee for vaults (BPS)
    uint256 public defaultPerformanceFee = 1500; // 15%

    /// @dev Default management fee for vaults (BPS)
    uint256 public defaultManagementFee = 200; // 2%

    // ---- Per-Vault Fee Overrides ----

    mapping(address => uint256) public vaultPerformanceFees;
    mapping(address => uint256) public vaultManagementFees;
    mapping(address => bool) public hasVaultOverride;

    // ---- Per-Strategy Fee Overrides ----

    mapping(address => uint256) public strategyPerformanceFees;
    mapping(address => bool) public hasStrategyOverride;

    // ---- Fee Accounting ----

    /// @dev Total fee shares redeemed and distributed per token
    mapping(address => uint256) public totalFeesDistributed;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event DefaultPerformanceFeeUpdated(uint256 oldFee, uint256 newFee);
    event DefaultManagementFeeUpdated(uint256 oldFee, uint256 newFee);
    event VaultFeeOverrideSet(address indexed vault, uint256 performanceFee, uint256 managementFee);
    event VaultFeeOverrideRemoved(address indexed vault);
    event StrategyFeeOverrideSet(address indexed strategy, uint256 performanceFee);
    event StrategyFeeOverrideRemoved(address indexed strategy);
    event DistributionRatiosUpdated(uint256 treasuryShare, uint256 insuranceShare, uint256 developmentShare);
    event FeesDistributed(address indexed token, uint256 toTreasury, uint256 toInsurance, uint256 toDevelopment);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event InsuranceFundUpdated(address indexed oldFund, address indexed newFund);
    event DevelopmentFundUpdated(address indexed oldFund, address indexed newFund);

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
    //            GLOBAL FEE CONFIGURATION
    // ============================================================

    /**
     * @notice Set the default performance fee applied to new vaults.
     * @param fee Fee in BPS (e.g., 1500 = 15%)
     */
    function setDefaultPerformanceFee(uint256 fee) external onlyOwner {
        require(fee <= MAX_PERFORMANCE_FEE, "Exceeds max");
        uint256 old = defaultPerformanceFee;
        defaultPerformanceFee = fee;
        emit DefaultPerformanceFeeUpdated(old, fee);
    }

    /**
     * @notice Set the default annual management fee applied to new vaults.
     * @param fee Fee in BPS (e.g., 200 = 2%)
     */
    function setDefaultManagementFee(uint256 fee) external onlyOwner {
        require(fee <= MAX_MANAGEMENT_FEE, "Exceeds max");
        uint256 old = defaultManagementFee;
        defaultManagementFee = fee;
        emit DefaultManagementFeeUpdated(old, fee);
    }

    // ============================================================
    //            PER-VAULT FEE OVERRIDES
    // ============================================================

    /**
     * @notice Set custom fee overrides for a specific vault.
     */
    function setVaultFeeOverride(
        address vault,
        uint256 perfFee,
        uint256 mgmtFee
    ) external onlyOwner {
        require(perfFee <= MAX_PERFORMANCE_FEE, "Exceeds max performance fee");
        require(mgmtFee <= MAX_MANAGEMENT_FEE, "Exceeds max management fee");
        vaultPerformanceFees[vault] = perfFee;
        vaultManagementFees[vault] = mgmtFee;
        hasVaultOverride[vault] = true;
        emit VaultFeeOverrideSet(vault, perfFee, mgmtFee);
    }

    /**
     * @notice Remove custom fee overrides, reverting to defaults.
     */
    function removeVaultFeeOverride(address vault) external onlyOwner {
        delete vaultPerformanceFees[vault];
        delete vaultManagementFees[vault];
        hasVaultOverride[vault] = false;
        emit VaultFeeOverrideRemoved(vault);
    }

    // ============================================================
    //            PER-STRATEGY FEE OVERRIDES
    // ============================================================

    /**
     * @notice Set a custom performance fee for a specific strategy.
     * @dev Some strategies (e.g., private deals) may warrant different fee rates.
     */
    function setStrategyFeeOverride(
        address strategy,
        uint256 perfFee
    ) external onlyOwner {
        require(perfFee <= MAX_PERFORMANCE_FEE, "Exceeds max");
        strategyPerformanceFees[strategy] = perfFee;
        hasStrategyOverride[strategy] = true;
        emit StrategyFeeOverrideSet(strategy, perfFee);
    }

    function removeStrategyFeeOverride(address strategy) external onlyOwner {
        delete strategyPerformanceFees[strategy];
        hasStrategyOverride[strategy] = false;
        emit StrategyFeeOverrideRemoved(strategy);
    }

    // ============================================================
    //            FEE DISTRIBUTION
    // ============================================================

    /**
     * @notice Distribute protocol fee tokens to treasury, insurance, and dev fund.
     * @dev The vault's feeRecipient is set to this contract. When fee shares are
     *      redeemed for underlying tokens, call this to split them.
     * @param token The ERC20 token to distribute
     */
    function distributeFees(address token) external {
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No fees to distribute");

        totalFeesDistributed[token] += balance;

        uint256 toTreasury = (balance * treasuryShare) / BPS;
        uint256 toInsurance = (balance * insuranceShare) / BPS;
        uint256 toDevelopment = balance - toTreasury - toInsurance;

        if (toTreasury > 0 && treasury != address(0)) {
            IERC20(token).safeTransfer(treasury, toTreasury);
        }
        if (toInsurance > 0 && insuranceFund != address(0)) {
            IERC20(token).safeTransfer(insuranceFund, toInsurance);
        }
        if (toDevelopment > 0 && developmentFund != address(0)) {
            IERC20(token).safeTransfer(developmentFund, toDevelopment);
        }

        emit FeesDistributed(token, toTreasury, toInsurance, toDevelopment);
    }

    // ============================================================
    //           DISTRIBUTION RATIO MANAGEMENT
    // ============================================================

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
        emit DistributionRatiosUpdated(treasuryShare_, insuranceShare_, developmentShare_);
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

    /**
     * @notice Get the applicable performance fee for a vault.
     */
    function getVaultPerformanceFee(address vault) external view returns (uint256) {
        if (hasVaultOverride[vault]) return vaultPerformanceFees[vault];
        return defaultPerformanceFee;
    }

    /**
     * @notice Get the applicable management fee for a vault.
     */
    function getVaultManagementFee(address vault) external view returns (uint256) {
        if (hasVaultOverride[vault]) return vaultManagementFees[vault];
        return defaultManagementFee;
    }

    /**
     * @notice Get the applicable performance fee for a strategy.
     */
    function getStrategyPerformanceFee(address strategy) external view returns (uint256) {
        if (hasStrategyOverride[strategy]) return strategyPerformanceFees[strategy];
        return defaultPerformanceFee;
    }

    /**
     * @notice Get pending fee balance for a token.
     */
    function getPendingFees(address token) external view returns (uint256) {
        return IERC20(token).balanceOf(address(this));
    }
}
