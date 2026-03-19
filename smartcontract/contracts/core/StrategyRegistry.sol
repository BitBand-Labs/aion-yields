// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IStrategy} from "../interfaces/IStrategy.sol";

/**
 * @title StrategyRegistry
 * @author ChainNomads (AION Finance)
 * @notice Maintains the approved strategies list and their metadata.
 *
 * @dev Strategies must be registered here before being added to a vault.
 *      This provides a central place for governance to vet strategies,
 *      track categories, and manage approvals.
 */
contract StrategyRegistry is Ownable {
    // ============================================================
    //                      STORAGE
    // ============================================================

    struct StrategyInfo {
        address strategy;
        string name;
        StrategyCategory category;
        address asset;
        uint256 riskScore;        // 0-10000, lower = safer
        uint256 registeredAt;
        bool isApproved;
    }

    enum StrategyCategory {
        LENDING,
        LIQUIDITY_PROVISION,
        BASIS_TRADE,
        YIELD_TRADING,
        PEG_ARBITRAGE,
        LENDING_ARBITRAGE,
        PRIVATE_DEAL
    }

    /// @dev Strategy address => info
    mapping(address => StrategyInfo) public strategies;

    /// @dev All registered strategy addresses
    address[] public registeredStrategies;

    /// @dev Strategies grouped by category
    mapping(StrategyCategory => address[]) public strategiesByCategory;

    /// @dev Strategies grouped by asset
    mapping(address => address[]) public strategiesByAsset;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event StrategyRegistered(
        address indexed strategy,
        string name,
        StrategyCategory category,
        address indexed asset
    );
    event StrategyApproved(address indexed strategy);
    event StrategyRevoked(address indexed strategy);
    event StrategyRiskScoreUpdated(address indexed strategy, uint256 oldScore, uint256 newScore);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================
    //              STRATEGY REGISTRATION
    // ============================================================

    /**
     * @notice Register a new strategy.
     * @param strategy The strategy contract address
     * @param name Human-readable name
     * @param category Strategy category
     * @param riskScore Initial risk score (0-10000)
     */
    function registerStrategy(
        address strategy,
        string calldata name,
        StrategyCategory category,
        uint256 riskScore
    ) external onlyOwner {
        require(strategy != address(0), "Invalid strategy");
        require(strategies[strategy].registeredAt == 0, "Already registered");
        require(riskScore <= 10000, "Invalid risk score");

        address asset = IStrategy(strategy).asset();

        strategies[strategy] = StrategyInfo({
            strategy: strategy,
            name: name,
            category: category,
            asset: asset,
            riskScore: riskScore,
            registeredAt: block.timestamp,
            isApproved: true
        });

        registeredStrategies.push(strategy);
        strategiesByCategory[category].push(strategy);
        strategiesByAsset[asset].push(strategy);

        emit StrategyRegistered(strategy, name, category, asset);
        emit StrategyApproved(strategy);
    }

    /**
     * @notice Revoke approval for a strategy.
     */
    function revokeStrategy(address strategy) external onlyOwner {
        require(strategies[strategy].registeredAt > 0, "Not registered");
        strategies[strategy].isApproved = false;
        emit StrategyRevoked(strategy);
    }

    /**
     * @notice Re-approve a previously revoked strategy.
     */
    function approveStrategy(address strategy) external onlyOwner {
        require(strategies[strategy].registeredAt > 0, "Not registered");
        strategies[strategy].isApproved = true;
        emit StrategyApproved(strategy);
    }

    /**
     * @notice Update a strategy's risk score.
     */
    function updateRiskScore(address strategy, uint256 newScore) external onlyOwner {
        require(strategies[strategy].registeredAt > 0, "Not registered");
        require(newScore <= 10000, "Invalid risk score");
        uint256 old = strategies[strategy].riskScore;
        strategies[strategy].riskScore = newScore;
        emit StrategyRiskScoreUpdated(strategy, old, newScore);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function isApproved(address strategy) external view returns (bool) {
        return strategies[strategy].isApproved;
    }

    function getStrategyInfo(address strategy) external view returns (StrategyInfo memory) {
        return strategies[strategy];
    }

    function getRegisteredCount() external view returns (uint256) {
        return registeredStrategies.length;
    }

    function getStrategiesByCategory(StrategyCategory category) external view returns (address[] memory) {
        return strategiesByCategory[category];
    }

    function getStrategiesByAsset(address asset) external view returns (address[] memory) {
        return strategiesByAsset[asset];
    }

    function getAllApproved() external view returns (address[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < registeredStrategies.length; i++) {
            if (strategies[registeredStrategies[i]].isApproved) count++;
        }

        address[] memory approved = new address[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < registeredStrategies.length; i++) {
            if (strategies[registeredStrategies[i]].isApproved) {
                approved[idx++] = registeredStrategies[i];
            }
        }
        return approved;
    }
}
