// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title AionComplianceEngine
 * @author ChainNomads (AION Yield)
 * @notice A policy engine inspired by Chainlink ACE for private transfer compliance.
 *
 * @dev This contract manages the "rules of the game" for private transactions.
 *      It can be used to:
 *      1. Register sanctioned addresses.
 *      2. Set velocity limits (e.g., max withdraw per day).
 *      3. Verify KYC/Identity status.
 */
contract AionComplianceEngine is Ownable {
    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Sanctioned addresses that are blocked from withdrawal
    mapping(address => bool) public isSanctioned;

    /// @dev Mapping of addresses with completed KYC
    mapping(address => bool) public hasKYC;

    /// @dev Daily withdrawal limits per asset (standardized to 18 decimals for simplicity)
    mapping(address => uint256) public assetDailyLimits;

    /// @dev Tracked daily volume for velocity checks
    mapping(address => mapping(uint256 => uint256)) public dailyVolume;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event SanctionStatusUpdated(address indexed addr, bool isSanctioned);
    event KYCStatusUpdated(address indexed addr, bool hasKYC);
    event AssetLimitUpdated(address indexed asset, uint256 limit);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================
    //                  COMPLIANCE CHECKS
    // ============================================================

    /**
     * @notice Check if a withdrawal is compliant with protocol policies.
     * @param user The address requesting the withdrawal
     * @param asset The asset being withdrawn
     * @param amount The amount to be withdrawn
     * @return isCompliant Whether the operation can proceed
     * @return reason Error message if not compliant
     */
    function validateWithdrawal(
        address user,
        address asset,
        uint256 amount
    ) external view returns (bool isCompliant, string memory reason) {
        // 1. Sanctions Check
        if (isSanctioned[user]) {
            return (false, "SANCTIONED_ADDRESS");
        }

        // 2. KYC Check (optional, enabled by protocol)
        if (!hasKYC[user]) {
            return (false, "KYC_PENDING");
        }

        // 3. Velocity Checks
        uint256 today = block.timestamp / 1 days;
        uint256 newVolume = dailyVolume[asset][today] + amount;
        uint256 limit = assetDailyLimits[asset];

        if (limit > 0 && newVolume > limit) {
            return (false, "DAILY_LIMIT_EXCEEDED");
        }

        return (true, "");
    }

    /**
     * @notice Record a successful withdrawal to update velocity tracking.
     */
    function recordWithdrawal(address asset, uint256 amount) external {
        uint256 today = block.timestamp / 1 days;
        dailyVolume[asset][today] += amount;
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setSanctionStatus(
        address addr,
        bool sanctioned
    ) external onlyOwner {
        isSanctioned[addr] = sanctioned;
        emit SanctionStatusUpdated(addr, sanctioned);
    }

    function setKYCStatus(address addr, bool kycDone) external onlyOwner {
        hasKYC[addr] = kycDone;
        emit KYCStatusUpdated(addr, kycDone);
    }

    function setAssetLimit(address asset, uint256 limit) external onlyOwner {
        assetDailyLimits[asset] = limit;
        emit AssetLimitUpdated(asset, limit);
    }
}
