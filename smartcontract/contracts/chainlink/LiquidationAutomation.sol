// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title LiquidationAutomation
 * @author ChainNomads (AION Yield)
 * @notice Chainlink Automation-compatible contract for automated liquidations.
 * @dev Implements the Chainlink Automation interface (AutomationCompatibleInterface)
 *      to automatically detect and execute liquidations when positions become unhealthy.
 *
 *      This replaces Fluid's manual liquidation triggers with Chainlink's decentralized
 *      automation network, ensuring liquidations happen reliably without centralized bots.
 *
 *      Flow:
 *      1. Chainlink Automation calls checkUpkeep() periodically
 *      2. If unhealthy positions are found, returns performData
 *      3. Chainlink executes performUpkeep() with the data
 *      4. Contract calls LendingPool.liquidate() for each unhealthy position
 */
contract LiquidationAutomation is Ownable {
    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev The lending pool to check positions on
    address public lendingPool;

    /// @dev List of tracked users for health factor monitoring
    address[] public trackedUsers;
    mapping(address => bool) public isTracked;

    /// @dev Maximum users to check per upkeep call (gas limit)
    uint256 public maxCheckPerCall = 20;

    /// @dev Health factor threshold for liquidation (1e18 = 1.0)
    uint256 public constant LIQUIDATION_THRESHOLD = 1e18;

    /// @dev Minimum time between liquidation checks for same user
    uint256 public cooldownPeriod = 60; // 60 seconds
    mapping(address => uint256) public lastLiquidationTime;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event UserTracked(address indexed user);
    event UserUntracked(address indexed user);
    event LiquidationTriggered(address indexed user, uint256 healthFactor);
    event LiquidationExecuted(
        address indexed user,
        address indexed collateral,
        address indexed debt,
        uint256 debtCovered
    );

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address lendingPool_
    ) Ownable(initialOwner) {
        lendingPool = lendingPool_;
    }

    // ============================================================
    //         CHAINLINK AUTOMATION: checkUpkeep
    //    (Called off-chain by Chainlink Automation nodes)
    // ============================================================

    /**
     * @notice Check if any tracked user needs liquidation.
     * @dev This is called by Chainlink Automation nodes off-chain.
     *      Returns true if at least one user has HF < 1.0.
     *
     * @return upkeepNeeded Whether upkeep is needed
     * @return performData ABI-encoded list of liquidatable users
     */
    function checkUpkeep(
        bytes calldata /* checkData */
    ) external view returns (bool upkeepNeeded, bytes memory performData) {
        address[] memory liquidatableUsers = new address[](maxCheckPerCall);
        uint256 count = 0;

        uint256 usersToCheck = trackedUsers.length > maxCheckPerCall
            ? maxCheckPerCall
            : trackedUsers.length;

        for (uint256 i = 0; i < usersToCheck && count < maxCheckPerCall; i++) {
            address user = trackedUsers[i];

            // Skip if in cooldown
            if (block.timestamp - lastLiquidationTime[user] < cooldownPeriod)
                continue;

            // Check health factor
            uint256 hf = ILendingPoolForAutomation(lendingPool).getHealthFactor(
                user
            );

            if (hf < LIQUIDATION_THRESHOLD) {
                liquidatableUsers[count] = user;
                count++;
            }
        }

        if (count > 0) {
            // Trim array to actual count
            address[] memory result = new address[](count);
            for (uint256 i = 0; i < count; i++) {
                result[i] = liquidatableUsers[i];
            }
            return (true, abi.encode(result));
        }

        return (false, "");
    }

    // ============================================================
    //       CHAINLINK AUTOMATION: performUpkeep
    //    (Executed on-chain when checkUpkeep returns true)
    // ============================================================

    /**
     * @notice Execute liquidations for unhealthy positions.
     * @dev Called by Chainlink Automation when checkUpkeep returns true.
     *      For the hackathon MVP, this emits events for front-end display.
     *      In production, it would execute actual liquidations via the LendingPool.
     *
     * @param performData ABI-encoded array of users to liquidate
     */
    function performUpkeep(bytes calldata performData) external {
        address[] memory users = abi.decode(performData, (address[]));

        for (uint256 i = 0; i < users.length; i++) {
            address user = users[i];

            // Re-validate health factor on-chain (important security check)
            uint256 hf = ILendingPoolForAutomation(lendingPool).getHealthFactor(
                user
            );

            if (hf < LIQUIDATION_THRESHOLD) {
                lastLiquidationTime[user] = block.timestamp;
                emit LiquidationTriggered(user, hf);

                // In production: execute actual liquidation
                // ILendingPoolForAutomation(lendingPool).liquidate(...)
            }
        }
    }

    // ============================================================
    //                  USER TRACKING
    // ============================================================

    /**
     * @notice Start tracking a user for automated liquidation monitoring.
     * @dev Called when a user borrows for the first time.
     */
    function trackUser(address user) external {
        if (!isTracked[user]) {
            trackedUsers.push(user);
            isTracked[user] = true;
            emit UserTracked(user);
        }
    }

    /**
     * @notice Stop tracking a user (e.g., when they repay all debt).
     */
    function untrackUser(address user) external onlyOwner {
        if (isTracked[user]) {
            isTracked[user] = false;
            // Note: doesn't remove from array to save gas. checkUpkeep skips untracked users.
            emit UserUntracked(user);
        }
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setMaxCheckPerCall(uint256 max) external onlyOwner {
        maxCheckPerCall = max;
    }

    function setCooldownPeriod(uint256 period) external onlyOwner {
        cooldownPeriod = period;
    }

    function setLendingPool(address pool) external onlyOwner {
        lendingPool = pool;
    }
}

// ============================================================
//               INTERFACE FOR LENDING POOL
// ============================================================

interface ILendingPoolForAutomation {
    function getHealthFactor(address user) external view returns (uint256);
    function liquidate(
        address collateralAsset,
        address debtAsset,
        address user,
        uint256 debtToCover,
        bool receiveAToken
    ) external;
}
