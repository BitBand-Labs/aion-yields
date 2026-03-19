// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DataTypes
 * @author ChainNomads (AION Finance)
 * @notice Central data type definitions for the AION Finance protocol.
 */
library DataTypes {
    // ============================================================
    //            AI AGENT DATA (ERC-8004 inspired)
    // ============================================================

    struct AIAgentData {
        address agentAddress;     // On-chain agent address
        string metadataURI;       // IPFS URI for agent metadata
        uint256 reputationScore;  // Cumulative reputation (higher = better)
        uint256 totalTasks;       // Number of tasks completed
        uint256 stakedAmount;     // Amount staked as collateral for good behavior
        uint256 registrationTime; // When agent was registered
        bool isActive;            // Whether agent is currently active
        bool isSlashed;           // Whether agent has been slashed
    }

    // ============================================================
    //                CRE WORKFLOW DATA
    // ============================================================

    struct YieldPrediction {
        address targetAsset;   // Asset the prediction is about
        uint256 predictedAPY;  // AI-predicted APY (in bps)
        uint256 riskScore;     // Risk rating (0-10000, lower = safer)
        uint256 confidence;    // Confidence level (0-10000)
        uint256 timestamp;     // When prediction was made
        address agentId;       // Which AI agent made the prediction
    }
}
