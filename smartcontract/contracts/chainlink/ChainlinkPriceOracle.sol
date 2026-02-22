// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title ChainlinkPriceOracle
 * @author ChainNomads (AION Yield)
 * @notice Chainlink Data Feed price oracle adapter for the AION Yield protocol.
 * @dev Provides a unified interface for fetching asset prices from Chainlink Data Feeds.
 *      Includes staleness checks and fallback logic inspired by Fluid's oracle module.
 *
 *      Fluid has a complex oracle system with multiple fallback layers. We implement
 *      a simpler but robust version that:
 *      1. Reads from Chainlink AggregatorV3Interface
 *      2. Validates freshness (staleness check)
 *      3. Supports fallback price feeds
 *      4. Provides price in standardized format
 */
contract ChainlinkPriceOracle is Ownable {
    // ============================================================
    //                      STORAGE
    // ============================================================

    struct PriceFeedConfig {
        address primaryFeed; // Primary Chainlink price feed
        address fallbackFeed; // Fallback feed if primary is stale
        uint256 maxStaleness; // Maximum allowed staleness in seconds
        uint8 feedDecimals; // Decimals of the price feed (usually 8)
        bool isActive; // Whether this feed is active
    }

    /// @dev Price feed configuration per asset
    mapping(address => PriceFeedConfig) public feedConfigs;

    /// @dev Standard price decimals (Chainlink uses 8 for USD pairs)
    uint8 public constant PRICE_DECIMALS = 8;

    /// @dev Default max staleness: 1 hour
    uint256 public constant DEFAULT_MAX_STALENESS = 3600;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event PriceFeedSet(
        address indexed asset,
        address indexed feed,
        address fallbackFeed
    );
    event StalePrice(
        address indexed asset,
        uint256 updatedAt,
        uint256 currentTime
    );

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Sets the Chainlink price feed for an asset.
     * @param asset The asset address (e.g., WETH, USDC)
     * @param primaryFeed The Chainlink AggregatorV3 address (e.g., ETH/USD)
     * @param fallbackFeed Optional fallback feed address
     * @param maxStaleness Maximum allowed time since last update
     * @param feedDecimals Number of decimals in the feed price
     */
    function setPriceFeed(
        address asset,
        address primaryFeed,
        address fallbackFeed,
        uint256 maxStaleness,
        uint8 feedDecimals
    ) external onlyOwner {
        require(primaryFeed != address(0), "Invalid primary feed");

        feedConfigs[asset] = PriceFeedConfig({
            primaryFeed: primaryFeed,
            fallbackFeed: fallbackFeed,
            maxStaleness: maxStaleness > 0
                ? maxStaleness
                : DEFAULT_MAX_STALENESS,
            feedDecimals: feedDecimals,
            isActive: true
        });

        emit PriceFeedSet(asset, primaryFeed, fallbackFeed);
    }

    // ============================================================
    //                 PRICE FETCHING
    // ============================================================

    /**
     * @notice Gets the latest price for an asset.
     * @dev Attempts primary feed first, falls back to secondary if stale.
     *      Inspired by Fluid's multi-oracle fallback pattern.
     *
     * @param asset The asset to get the price for
     * @return price Asset price in USD with PRICE_DECIMALS precision
     * @return isValid Whether the price is considered valid (not stale)
     */
    function getAssetPrice(
        address asset
    ) external view returns (uint256 price, bool isValid) {
        PriceFeedConfig memory config = feedConfigs[asset];

        if (!config.isActive || config.primaryFeed == address(0)) {
            return (0, false);
        }

        // Try primary feed
        (price, isValid) = _fetchPrice(config.primaryFeed, config.maxStaleness);

        // If primary is stale, try fallback
        if (!isValid && config.fallbackFeed != address(0)) {
            (price, isValid) = _fetchPrice(
                config.fallbackFeed,
                config.maxStaleness
            );
        }

        // Normalize to standard decimals if needed
        if (isValid && config.feedDecimals != PRICE_DECIMALS) {
            if (config.feedDecimals > PRICE_DECIMALS) {
                price = price / (10 ** (config.feedDecimals - PRICE_DECIMALS));
            } else {
                price = price * (10 ** (PRICE_DECIMALS - config.feedDecimals));
            }
        }

        return (price, isValid);
    }

    /**
     * @notice Gets price or reverts if invalid.
     * @param asset The asset address
     * @return price in USD with PRICE_DECIMALS
     */
    function getAssetPriceOrRevert(
        address asset
    ) external view returns (uint256) {
        PriceFeedConfig memory config = feedConfigs[asset];
        require(
            config.isActive && config.primaryFeed != address(0),
            "Feed not configured"
        );

        (uint256 price, bool isValid) = _fetchPrice(
            config.primaryFeed,
            config.maxStaleness
        );

        if (!isValid && config.fallbackFeed != address(0)) {
            (price, isValid) = _fetchPrice(
                config.fallbackFeed,
                config.maxStaleness
            );
        }

        require(isValid, "Stale price");
        require(price > 0, "Zero price");

        if (config.feedDecimals != PRICE_DECIMALS) {
            if (config.feedDecimals > PRICE_DECIMALS) {
                price = price / (10 ** (config.feedDecimals - PRICE_DECIMALS));
            } else {
                price = price * (10 ** (PRICE_DECIMALS - config.feedDecimals));
            }
        }

        return price;
    }

    // ============================================================
    //                  INTERNAL FUNCTIONS
    // ============================================================

    /**
     * @notice Fetches price from a Chainlink AggregatorV3 with staleness validation.
     */
    function _fetchPrice(
        address feed,
        uint256 maxStaleness
    ) internal view returns (uint256 price, bool isValid) {
        try IChainlinkAggregatorV3(feed).latestRoundData() returns (
            uint80,
            int256 answer,
            uint256,
            uint256 updatedAt,
            uint80
        ) {
            if (answer <= 0) return (0, false);
            if (block.timestamp - updatedAt > maxStaleness)
                return (uint256(answer), false);
            return (uint256(answer), true);
        } catch {
            return (0, false);
        }
    }
}

// ============================================================
//                 CHAINLINK INTERFACE
// ============================================================

interface IChainlinkAggregatorV3 {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function decimals() external view returns (uint8);
}
