// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title RiskManager
 * @author ChainNomads (AION Finance)
 * @notice Evaluates protocol risk levels and enforces risk guardrails.
 *
 * @dev Risk management guardrails:
 *      - Per-strategy allocation caps (max 40% of vault per strategy)
 *      - Protocol risk scoring (audit history, TVL stability, exploit history)
 *      - Risk threshold enforcement (strategies must pass risk check)
 *      - AI risk scoring integration
 */
contract RiskManager is Ownable {
    // ============================================================
    //                      CONSTANTS
    // ============================================================

    uint256 public constant BPS = 10_000;
    uint256 public constant MAX_RISK_SCORE = 10_000;

    // ============================================================
    //                      STORAGE
    // ============================================================

    struct ProtocolRisk {
        uint256 riskScore;         // 0-10000 (lower = safer)
        uint256 maxAllocationBps;  // Max % of vault to allocate
        bool hasAudit;
        uint256 auditCount;
        uint256 tvlStabilityScore; // 0-10000 (higher = more stable)
        uint256 incidentCount;     // Number of historical exploits
        uint256 lastAssessment;
        bool isApproved;
    }

    /// @dev Strategy address => risk assessment
    mapping(address => ProtocolRisk) public strategyRisk;

    /// @dev Global maximum allocation per strategy (BPS)
    uint256 public globalMaxAllocationBps = 4000; // 40%

    /// @dev Maximum acceptable risk score for auto-approval
    uint256 public maxAcceptableRisk = 7000; // 70/100

    /// @dev AI risk assessor address
    address public riskAssessor;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event RiskAssessed(
        address indexed strategy,
        uint256 riskScore,
        uint256 maxAllocationBps,
        bool approved
    );
    event GlobalMaxAllocationUpdated(uint256 oldBps, uint256 newBps);
    event MaxAcceptableRiskUpdated(uint256 oldScore, uint256 newScore);
    event StrategyFlagged(address indexed strategy, string reason);
    event RiskAssessorUpdated(address indexed assessor);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================
    //              RISK ASSESSMENT
    // ============================================================

    /**
     * @notice Submit a risk assessment for a strategy.
     * @param strategy The strategy address
     * @param riskScore Risk score (0-10000, lower = safer)
     * @param maxAllocationBps Maximum allocation for this strategy
     * @param hasAudit Whether the protocol has been audited
     * @param auditCount Number of audits completed
     * @param tvlStabilityScore TVL stability (0-10000)
     * @param incidentCount Historical exploit count
     */
    function assessStrategy(
        address strategy,
        uint256 riskScore,
        uint256 maxAllocationBps,
        bool hasAudit,
        uint256 auditCount,
        uint256 tvlStabilityScore,
        uint256 incidentCount
    ) external {
        require(
            msg.sender == riskAssessor || msg.sender == owner(),
            "Not authorized"
        );
        require(riskScore <= MAX_RISK_SCORE, "Invalid risk score");
        require(maxAllocationBps <= BPS, "Invalid allocation");
        require(tvlStabilityScore <= MAX_RISK_SCORE, "Invalid stability score");

        // Cap at global max
        if (maxAllocationBps > globalMaxAllocationBps) {
            maxAllocationBps = globalMaxAllocationBps;
        }

        bool approved = riskScore <= maxAcceptableRisk && hasAudit;

        strategyRisk[strategy] = ProtocolRisk({
            riskScore: riskScore,
            maxAllocationBps: maxAllocationBps,
            hasAudit: hasAudit,
            auditCount: auditCount,
            tvlStabilityScore: tvlStabilityScore,
            incidentCount: incidentCount,
            lastAssessment: block.timestamp,
            isApproved: approved
        });

        emit RiskAssessed(strategy, riskScore, maxAllocationBps, approved);
    }

    /**
     * @notice Flag a strategy as risky (e.g., after detecting an exploit).
     */
    function flagStrategy(address strategy, string calldata reason) external onlyOwner {
        strategyRisk[strategy].isApproved = false;
        emit StrategyFlagged(strategy, reason);
    }

    // ============================================================
    //              RISK VALIDATION
    // ============================================================

    /**
     * @notice Check if a strategy passes risk requirements.
     * @param strategy The strategy to check
     * @return approved Whether the strategy is risk-approved
     */
    function isApproved(address strategy) external view returns (bool) {
        return strategyRisk[strategy].isApproved;
    }

    /**
     * @notice Get the maximum allocation allowed for a strategy.
     * @param strategy The strategy address
     * @return maxBps Maximum allocation in BPS
     */
    function getMaxAllocation(address strategy) external view returns (uint256) {
        ProtocolRisk memory risk = strategyRisk[strategy];
        if (!risk.isApproved || risk.lastAssessment == 0) return 0;
        return risk.maxAllocationBps;
    }

    /**
     * @notice Validate a proposed allocation against risk limits.
     * @param strategy The strategy
     * @param allocationBps Proposed allocation in BPS
     * @return valid Whether the allocation is within risk limits
     * @return reason Rejection reason (empty if valid)
     */
    function validateAllocation(
        address strategy,
        uint256 allocationBps
    ) external view returns (bool valid, string memory reason) {
        ProtocolRisk memory risk = strategyRisk[strategy];

        if (risk.lastAssessment == 0) {
            return (false, "Strategy not assessed");
        }
        if (!risk.isApproved) {
            return (false, "Strategy not risk-approved");
        }
        if (allocationBps > risk.maxAllocationBps) {
            return (false, "Exceeds strategy max allocation");
        }
        if (allocationBps > globalMaxAllocationBps) {
            return (false, "Exceeds global max allocation");
        }

        return (true, "");
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setGlobalMaxAllocation(uint256 bps) external onlyOwner {
        require(bps <= BPS, "Invalid bps");
        uint256 old = globalMaxAllocationBps;
        globalMaxAllocationBps = bps;
        emit GlobalMaxAllocationUpdated(old, bps);
    }

    function setMaxAcceptableRisk(uint256 score) external onlyOwner {
        require(score <= MAX_RISK_SCORE, "Invalid score");
        uint256 old = maxAcceptableRisk;
        maxAcceptableRisk = score;
        emit MaxAcceptableRiskUpdated(old, score);
    }

    function setRiskAssessor(address assessor) external onlyOwner {
        riskAssessor = assessor;
        emit RiskAssessorUpdated(assessor);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getRiskScore(address strategy) external view returns (uint256) {
        return strategyRisk[strategy].riskScore;
    }

    function getFullRisk(address strategy) external view returns (ProtocolRisk memory) {
        return strategyRisk[strategy];
    }
}
