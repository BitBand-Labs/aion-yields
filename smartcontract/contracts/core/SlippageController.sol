// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title SlippageController
 * @author ChainNomads (AION Finance)
 * @notice Prevents excessive slippage during strategy execution.
 *
 * @dev Strategies check slippage limits before executing swaps or
 *      liquidity operations. This contract provides configurable
 *      per-strategy and global slippage thresholds.
 *
 *      Example: A Curve LP strategy must not lose more than 0.5%
 *      when entering/exiting a pool.
 */
contract SlippageController is Ownable {
    // ============================================================
    //                      CONSTANTS
    // ============================================================

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_SLIPPAGE = 1000; // 10% absolute max

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Default slippage tolerance in BPS (e.g., 50 = 0.5%)
    uint256 public defaultSlippageBps = 50; // 0.5%

    /// @dev Per-strategy slippage overrides
    mapping(address => uint256) public strategySlippageBps;

    /// @dev Whether a strategy has a custom slippage set
    mapping(address => bool) public hasCustomSlippage;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event DefaultSlippageUpdated(uint256 oldBps, uint256 newBps);
    event StrategySlippageUpdated(address indexed strategy, uint256 bps);
    event SlippageExceeded(
        address indexed strategy,
        uint256 expected,
        uint256 actual,
        uint256 slippageBps
    );

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================
    //              SLIPPAGE MANAGEMENT
    // ============================================================

    /**
     * @notice Set the default slippage tolerance.
     * @param bps Slippage in basis points (e.g., 50 = 0.5%)
     */
    function setDefaultSlippage(uint256 bps) external onlyOwner {
        require(bps <= MAX_SLIPPAGE, "Exceeds max slippage");
        uint256 old = defaultSlippageBps;
        defaultSlippageBps = bps;
        emit DefaultSlippageUpdated(old, bps);
    }

    /**
     * @notice Set a custom slippage tolerance for a specific strategy.
     * @param strategy The strategy address
     * @param bps Slippage in basis points
     */
    function setStrategySlippage(address strategy, uint256 bps) external onlyOwner {
        require(bps <= MAX_SLIPPAGE, "Exceeds max slippage");
        strategySlippageBps[strategy] = bps;
        hasCustomSlippage[strategy] = true;
        emit StrategySlippageUpdated(strategy, bps);
    }

    // ============================================================
    //              SLIPPAGE VALIDATION
    // ============================================================

    /**
     * @notice Get the applicable slippage tolerance for a strategy.
     * @param strategy The strategy address
     * @return bps Slippage tolerance in basis points
     */
    function getSlippage(address strategy) external view returns (uint256) {
        if (hasCustomSlippage[strategy]) return strategySlippageBps[strategy];
        return defaultSlippageBps;
    }

    /**
     * @notice Calculate the minimum acceptable output given slippage.
     * @param strategy The strategy executing the trade
     * @param expectedOutput The expected output amount
     * @return minOutput The minimum acceptable output
     */
    function getMinOutput(
        address strategy,
        uint256 expectedOutput
    ) external view returns (uint256 minOutput) {
        uint256 slippage = hasCustomSlippage[strategy]
            ? strategySlippageBps[strategy]
            : defaultSlippageBps;

        minOutput = expectedOutput - (expectedOutput * slippage) / BPS;
    }

    /**
     * @notice Check if an actual output meets slippage requirements.
     * @param strategy The strategy that executed the trade
     * @param expectedOutput Expected output amount
     * @param actualOutput Actual output received
     * @return acceptable Whether the slippage is within tolerance
     */
    function checkSlippage(
        address strategy,
        uint256 expectedOutput,
        uint256 actualOutput
    ) external view returns (bool acceptable) {
        uint256 slippage = hasCustomSlippage[strategy]
            ? strategySlippageBps[strategy]
            : defaultSlippageBps;

        uint256 minAcceptable = expectedOutput - (expectedOutput * slippage) / BPS;
        acceptable = actualOutput >= minAcceptable;
    }

    /**
     * @notice Validate slippage and revert if exceeded.
     * @dev Strategies call this after swaps to enforce slippage limits.
     */
    function enforceSlippage(
        address strategy,
        uint256 expectedOutput,
        uint256 actualOutput
    ) external view {
        uint256 slippage = hasCustomSlippage[strategy]
            ? strategySlippageBps[strategy]
            : defaultSlippageBps;

        uint256 minAcceptable = expectedOutput - (expectedOutput * slippage) / BPS;
        require(actualOutput >= minAcceptable, "Slippage exceeded");
    }
}
