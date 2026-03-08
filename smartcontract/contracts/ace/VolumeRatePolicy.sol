// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./IPolicy.sol";

/**
 * @title VolumeRatePolicy
 * @author ChainNomads (AION Yield)
 * @notice Chainlink ACE policy that enforces volume and rate limits on AI agent actions.
 *
 * @dev Even with valid certificates, an AI agent shouldn't move 100% of TVL in one tx.
 *      This policy caps:
 *      1. Per-action volume: Max amount movable in a single transaction
 *      2. Rolling window volume: Max cumulative amount movable within a time window
 *      3. Action frequency: Max number of actions per time window
 *
 *      EXAMPLE LIMITS:
 *      - "No single rebalance can move more than 10% of TVL"
 *      - "Max $500K cumulative movement per hour"
 *      - "Max 5 rate adjustments per 6 hours"
 *
 *      WINDOW MECHANISM:
 *      Uses a sliding window approach — tracks cumulative volume and action count
 *      within configurable time periods. Resets when the window expires.
 */
contract VolumeRatePolicy is IPolicy, Ownable {
    // ============================================================
    //                      CONSTANTS
    // ============================================================

    uint256 public constant BPS = 10000;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Rate limit configuration per target+selector
    /// keccak256(target, selector) => RateLimit
    mapping(bytes32 => RateLimit) public rateLimits;

    /// @dev Current window state per target+selector per caller
    /// keccak256(target, selector, caller) => WindowState
    mapping(bytes32 => WindowState) public windowStates;

    /// @dev Whether this policy is currently active
    bool public active = true;

    /// @dev The PolicyEngine that calls postExecutionUpdate
    address public policyEngine;

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    struct RateLimit {
        uint256 maxSingleAmountBps;    // Max per-action amount as BPS of reference value (0 = unlimited)
        uint256 maxWindowAmount;        // Max cumulative amount within the window (absolute, in token units)
        uint256 maxActionsPerWindow;    // Max number of actions within the window (0 = unlimited)
        uint256 windowDuration;         // Duration of the rolling window in seconds
        bool configured;                // Whether this limit has been set
    }

    struct WindowState {
        uint256 windowStart;           // When the current window began
        uint256 cumulativeAmount;      // Total amount moved in current window
        uint256 actionCount;           // Number of actions in current window
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event RateLimitSet(
        address indexed target,
        bytes4 indexed selector,
        uint256 maxSingleAmountBps,
        uint256 maxWindowAmount,
        uint256 maxActionsPerWindow,
        uint256 windowDuration
    );
    event WindowReset(address indexed target, bytes4 indexed selector, address indexed caller);
    event VolumeRecorded(
        address indexed caller,
        address indexed target,
        bytes4 selector,
        uint256 amount,
        uint256 windowCumulative
    );

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================
    //         RATE LIMIT CONFIGURATION (Governance)
    // ============================================================

    /**
     * @notice Configure rate limits for a specific target+selector combination.
     * @param target The contract address (e.g., AutonomousAllocator)
     * @param selector The function selector (e.g., executeAllocation)
     * @param maxSingleAmountBps Max per-action amount as BPS of a reference value (0 = no per-action limit)
     * @param maxWindowAmount Max cumulative amount in the window (0 = no cumulative limit)
     * @param maxActionsPerWindow Max actions per window (0 = no action count limit)
     * @param windowDuration Window duration in seconds
     */
    function setRateLimit(
        address target,
        bytes4 selector,
        uint256 maxSingleAmountBps,
        uint256 maxWindowAmount,
        uint256 maxActionsPerWindow,
        uint256 windowDuration
    ) external onlyOwner {
        require(windowDuration > 0, "VolumeRatePolicy: zero window");

        bytes32 key = _limitKey(target, selector);
        rateLimits[key] = RateLimit({
            maxSingleAmountBps: maxSingleAmountBps,
            maxWindowAmount: maxWindowAmount,
            maxActionsPerWindow: maxActionsPerWindow,
            windowDuration: windowDuration,
            configured: true
        });

        emit RateLimitSet(
            target,
            selector,
            maxSingleAmountBps,
            maxWindowAmount,
            maxActionsPerWindow,
            windowDuration
        );
    }

    // ============================================================
    //          IPolicy IMPLEMENTATION
    // ============================================================

    /**
     * @notice Validates that the action doesn't exceed volume/rate limits.
     * @dev The `data` parameter is expected to be abi.encode(amount, referenceValue)
     *      where `amount` is the action amount and `referenceValue` is the TVL/total for BPS calc.
     */
    function validate(
        address caller,
        address target,
        bytes4 selector,
        bytes calldata data
    ) external view override returns (bool valid, string memory reason) {
        if (!active) return (true, "");

        bytes32 limitKey = _limitKey(target, selector);
        RateLimit storage limit = rateLimits[limitKey];

        // If no rate limit configured for this target+selector, allow
        if (!limit.configured) return (true, "");

        // Decode amount and reference value from data
        uint256 amount;
        uint256 referenceValue;
        if (data.length >= 64) {
            (amount, referenceValue) = abi.decode(data, (uint256, uint256));
        } else if (data.length >= 32) {
            amount = abi.decode(data, (uint256));
        }

        // 1. Check per-action volume limit (BPS of reference value)
        if (limit.maxSingleAmountBps > 0 && referenceValue > 0) {
            uint256 maxSingleAmount = (referenceValue * limit.maxSingleAmountBps) / BPS;
            if (amount > maxSingleAmount) {
                return (false, "Single action exceeds max volume");
            }
        }

        // 2. Check rolling window state
        bytes32 stateKey = _stateKey(target, selector, caller);
        WindowState storage state = windowStates[stateKey];

        // If window has expired, the check passes (window will reset on execution)
        if (block.timestamp >= state.windowStart + limit.windowDuration) {
            return (true, "");
        }

        // 3. Check cumulative volume within window
        if (limit.maxWindowAmount > 0) {
            if (state.cumulativeAmount + amount > limit.maxWindowAmount) {
                return (false, "Window cumulative volume exceeded");
            }
        }

        // 4. Check action count within window
        if (limit.maxActionsPerWindow > 0) {
            if (state.actionCount + 1 > limit.maxActionsPerWindow) {
                return (false, "Window action count exceeded");
            }
        }

        return (true, "");
    }

    /**
     * @notice Updates the rolling window state after a successful action.
     */
    function postExecutionUpdate(
        address caller,
        address target,
        bytes4 selector,
        bytes calldata data
    ) external override {
        require(msg.sender == policyEngine, "Only PolicyEngine");
        if (!active) return;

        bytes32 limitKey = _limitKey(target, selector);
        RateLimit storage limit = rateLimits[limitKey];
        if (!limit.configured) return;

        // Decode amount from data
        uint256 amount;
        if (data.length >= 32) {
            amount = abi.decode(data, (uint256));
        }

        bytes32 stateKey = _stateKey(target, selector, caller);
        WindowState storage state = windowStates[stateKey];

        // Reset window if expired
        if (block.timestamp >= state.windowStart + limit.windowDuration) {
            state.windowStart = block.timestamp;
            state.cumulativeAmount = 0;
            state.actionCount = 0;
            emit WindowReset(target, selector, caller);
        }

        // Update state
        state.cumulativeAmount += amount;
        state.actionCount += 1;

        emit VolumeRecorded(caller, target, selector, amount, state.cumulativeAmount);
    }

    function policyName() external pure override returns (string memory) {
        return "VolumeRateLimit";
    }

    function isActive() external view override returns (bool) {
        return active;
    }

    // ============================================================
    //                   ADMIN FUNCTIONS
    // ============================================================

    function setActive(bool _active) external onlyOwner {
        active = _active;
    }

    function setPolicyEngine(address engine) external onlyOwner {
        policyEngine = engine;
    }

    /**
     * @notice Emergency: reset a window for a specific caller+target+selector.
     */
    function resetWindow(
        address target,
        bytes4 selector,
        address caller
    ) external onlyOwner {
        bytes32 stateKey = _stateKey(target, selector, caller);
        delete windowStates[stateKey];
        emit WindowReset(target, selector, caller);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getRateLimit(
        address target,
        bytes4 selector
    ) external view returns (RateLimit memory) {
        return rateLimits[_limitKey(target, selector)];
    }

    function getWindowState(
        address target,
        bytes4 selector,
        address caller
    ) external view returns (WindowState memory) {
        return windowStates[_stateKey(target, selector, caller)];
    }

    function getRemainingWindowCapacity(
        address target,
        bytes4 selector,
        address caller
    ) external view returns (uint256 remainingAmount, uint256 remainingActions, uint256 windowExpiresAt) {
        bytes32 limitKey = _limitKey(target, selector);
        RateLimit storage limit = rateLimits[limitKey];
        if (!limit.configured) return (type(uint256).max, type(uint256).max, 0);

        bytes32 stateKey = _stateKey(target, selector, caller);
        WindowState storage state = windowStates[stateKey];

        windowExpiresAt = state.windowStart + limit.windowDuration;

        // If window expired, full capacity available
        if (block.timestamp >= windowExpiresAt) {
            return (limit.maxWindowAmount, limit.maxActionsPerWindow, 0);
        }

        remainingAmount = limit.maxWindowAmount > state.cumulativeAmount
            ? limit.maxWindowAmount - state.cumulativeAmount
            : 0;

        remainingActions = limit.maxActionsPerWindow > state.actionCount
            ? limit.maxActionsPerWindow - state.actionCount
            : 0;
    }

    // ============================================================
    //                     INTERNALS
    // ============================================================

    function _limitKey(address target, bytes4 selector) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(target, selector));
    }

    function _stateKey(address target, bytes4 selector, address caller) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(target, selector, caller));
    }
}
