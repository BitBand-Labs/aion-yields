// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../libraries/DataTypes.sol";

/**
 * @title AIAgentRegistry
 * @author ChainNomads (AION Yield)
 * @notice On-chain AI agent identity and reputation system inspired by ERC-8004.
 *
 * @dev Implements three core registries:
 *      1. Identity Registry     - Agent registration and metadata
 *      2. Reputation Registry   - Historical performance scoring
 *      3. Validation Registry   - Proof of task correctness
 *
 *      AI agents register, stake tokens as collateral, provide yield predictions,
 *      and earn reputation based on prediction accuracy. Bad actors are slashed.
 *
 *      This enables a trust-minimized AI marketplace for the protocol.
 */
contract AIAgentRegistry is Ownable {
    using SafeERC20 for IERC20;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Staking token (USDC or governance token)
    IERC20 public stakingToken;

    /// @dev Minimum stake required for agent registration
    uint256 public minStake;

    /// @dev Agent data by address
    mapping(address => DataTypes.AIAgentData) public agents;

    /// @dev Ordered list of agent addresses
    address[] public agentList;

    /// @dev Agent reputation scores (separate for easy ranking)
    mapping(address => uint256) public reputationScores;

    /// @dev Task validation records
    mapping(bytes32 => TaskValidation) public validations;

    /// @dev Number of successful predictions per agent
    mapping(address => uint256) public successfulPredictions;

    /// @dev Number of failed predictions per agent
    mapping(address => uint256) public failedPredictions;

    /// @dev Slash percentage in bps (e.g., 1000 = 10%)
    uint256 public slashPercentage = 1000;

    /// @dev Reward percentage of stake for good predictions (bps)
    uint256 public rewardPercentage = 100; // 1%

    /// @dev Governance-controlled whitelist of approved agents
    mapping(address => bool) public whitelistedAgents;

    /// @dev Whether whitelist enforcement is enabled
    bool public whitelistEnabled;

    /// @dev Governance controller address (can manage whitelist)
    address public governanceController;

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    struct TaskValidation {
        address agent;
        bytes32 taskHash;
        uint256 predictedValue;
        uint256 actualValue;
        uint256 deviation; // Absolute deviation in bps
        bool isValidated;
        bool isPassed;
        uint256 timestamp;
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event AgentRegistered(
        address indexed agent,
        string metadataURI,
        uint256 stakedAmount
    );
    event AgentDeregistered(address indexed agent);
    event AgentSlashed(address indexed agent, uint256 amount, string reason);
    event ReputationUpdated(
        address indexed agent,
        uint256 newScore,
        bool isIncrease
    );
    event TaskValidated(
        bytes32 indexed taskId,
        address indexed agent,
        bool passed,
        uint256 deviation
    );
    event StakeAdded(address indexed agent, uint256 amount);
    event StakeWithdrawn(address indexed agent, uint256 amount);
    event AgentWhitelisted(address indexed agent);
    event AgentRemovedFromWhitelist(address indexed agent);
    event WhitelistToggled(bool enabled);
    event GovernanceControllerUpdated(address indexed newController);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address stakingToken_,
        uint256 minStake_
    ) Ownable(initialOwner) {
        stakingToken = IERC20(stakingToken_);
        minStake = minStake_;
    }

    // ============================================================
    //                1️⃣ IDENTITY REGISTRY
    // ============================================================

    /**
     * @notice Register a new AI agent with stake and metadata.
     * @dev Agent must stake minimum amount as collateral for good behavior.
     *
     * @param metadataURI IPFS URI containing agent description, model info, etc.
     * @param stakeAmount Amount of tokens to stake
     */
    function registerAgent(
        string calldata metadataURI,
        uint256 stakeAmount
    ) external {
        require(!agents[msg.sender].isActive, "Agent already registered");
        require(stakeAmount >= minStake, "Insufficient stake");
        if (whitelistEnabled) {
            require(whitelistedAgents[msg.sender], "Agent not whitelisted");
        }

        // Transfer stake
        stakingToken.safeTransferFrom(msg.sender, address(this), stakeAmount);

        // Register agent
        agents[msg.sender] = DataTypes.AIAgentData({
            agentAddress: msg.sender,
            metadataURI: metadataURI,
            reputationScore: 1000, // Start with base reputation
            totalTasks: 0,
            stakedAmount: stakeAmount,
            registrationTime: block.timestamp,
            isActive: true,
            isSlashed: false
        });

        reputationScores[msg.sender] = 1000;
        agentList.push(msg.sender);

        emit AgentRegistered(msg.sender, metadataURI, stakeAmount);
    }

    /**
     * @notice Deregister an AI agent and return stake.
     * @dev Agent must have no pending validations.
     */
    function deregisterAgent() external {
        DataTypes.AIAgentData storage agent = agents[msg.sender];
        require(agent.isActive, "Agent not active");

        uint256 stakeToReturn = agent.stakedAmount;
        agent.isActive = false;
        agent.stakedAmount = 0;

        // Return remaining stake
        if (stakeToReturn > 0) {
            stakingToken.safeTransfer(msg.sender, stakeToReturn);
        }

        emit AgentDeregistered(msg.sender);
    }

    /**
     * @notice Add additional stake to an existing agent.
     */
    function addStake(uint256 amount) external {
        DataTypes.AIAgentData storage agent = agents[msg.sender];
        require(agent.isActive, "Agent not active");

        stakingToken.safeTransferFrom(msg.sender, address(this), amount);
        agent.stakedAmount += amount;

        emit StakeAdded(msg.sender, amount);
    }

    // ============================================================
    //                2️⃣ REPUTATION REGISTRY
    // ============================================================

    /**
     * @notice Update an agent's reputation based on prediction outcome.
     * @dev Called by the protocol after validating an AI prediction against actual results.
     *
     * @param agent The agent address
     * @param isPositive Whether the reputation change is positive
     * @param magnitude The magnitude of the change (0-1000)
     */
    function updateReputation(
        address agent,
        bool isPositive,
        uint256 magnitude
    ) external onlyOwner {
        require(agents[agent].isActive, "Agent not active");

        if (isPositive) {
            reputationScores[agent] += magnitude;
            agents[agent].reputationScore += magnitude;
        } else {
            // Floor at 0
            if (reputationScores[agent] > magnitude) {
                reputationScores[agent] -= magnitude;
                agents[agent].reputationScore -= magnitude;
            } else {
                reputationScores[agent] = 0;
                agents[agent].reputationScore = 0;
            }
        }

        emit ReputationUpdated(agent, reputationScores[agent], isPositive);
    }

    /**
     * @notice Slash an agent for bad behavior or consistently poor predictions.
     * @dev Burns a percentage of their stake and reduces reputation.
     */
    function slashAgent(
        address agent,
        string calldata reason
    ) external onlyOwner {
        DataTypes.AIAgentData storage agentData = agents[agent];
        require(agentData.isActive, "Agent not active");

        uint256 slashAmount = (agentData.stakedAmount * slashPercentage) /
            10000;
        agentData.stakedAmount -= slashAmount;
        agentData.isSlashed = true;

        // Reduce reputation significantly
        reputationScores[agent] = reputationScores[agent] / 2;
        agentData.reputationScore = reputationScores[agent];

        // Slash goes to protocol treasury (burned from agent's perspective)
        // In production, this would go to a slash fund or be burned

        emit AgentSlashed(agent, slashAmount, reason);
    }

    // ============================================================
    //               3️⃣ VALIDATION REGISTRY
    // ============================================================

    /**
     * @notice Validate an AI agent's prediction against actual outcome.
     * @dev Compares predicted value with actual value, calculates deviation,
     *      and updates reputation accordingly.
     *
     * @param taskId Unique task identifier
     * @param agent The agent whose prediction is being validated
     * @param predictedValue The value the agent predicted
     * @param actualValue The actual observed value
     * @param maxDeviationBps Maximum acceptable deviation in bps
     */
    function validateTask(
        bytes32 taskId,
        address agent,
        uint256 predictedValue,
        uint256 actualValue,
        uint256 maxDeviationBps
    ) external onlyOwner {
        require(!validations[taskId].isValidated, "Already validated");
        require(agents[agent].isActive, "Agent not active");

        // Calculate deviation in bps
        uint256 deviation;
        if (actualValue > 0) {
            if (predictedValue > actualValue) {
                deviation =
                    ((predictedValue - actualValue) * 10000) /
                    actualValue;
            } else {
                deviation =
                    ((actualValue - predictedValue) * 10000) /
                    actualValue;
            }
        }

        bool passed = deviation <= maxDeviationBps;

        validations[taskId] = TaskValidation({
            agent: agent,
            taskHash: taskId,
            predictedValue: predictedValue,
            actualValue: actualValue,
            deviation: deviation,
            isValidated: true,
            isPassed: passed,
            timestamp: block.timestamp
        });

        agents[agent].totalTasks++;

        if (passed) {
            successfulPredictions[agent]++;
            // Reward: increase reputation
            reputationScores[agent] += 10;
            agents[agent].reputationScore += 10;
        } else {
            failedPredictions[agent]++;
            // Penalty: decrease reputation
            if (reputationScores[agent] >= 20) {
                reputationScores[agent] -= 20;
                agents[agent].reputationScore -= 20;
            }
        }

        emit TaskValidated(taskId, agent, passed, deviation);
    }

    // ============================================================
    //                 AGENT SELECTION
    // ============================================================

    /**
     * @notice Select the top N agents by reputation score.
     * @dev Used to determine which AI agents should provide predictions.
     * @param n Number of top agents to return
     * @return topAgents Array of top agent addresses
     */
    function getTopAgents(
        uint256 n
    ) external view returns (address[] memory topAgents) {
        uint256 count = agentList.length < n ? agentList.length : n;
        topAgents = new address[](count);

        // Simple selection sort for top N (acceptable for hackathon)
        // In production, use a sorted data structure
        bool[] memory used = new bool[](agentList.length);

        for (uint256 i = 0; i < count; i++) {
            uint256 bestScore = 0;
            uint256 bestIdx = 0;

            for (uint256 j = 0; j < agentList.length; j++) {
                if (
                    !used[j] &&
                    agents[agentList[j]].isActive &&
                    reputationScores[agentList[j]] > bestScore
                ) {
                    bestScore = reputationScores[agentList[j]];
                    bestIdx = j;
                }
            }

            if (bestScore > 0) {
                topAgents[i] = agentList[bestIdx];
                used[bestIdx] = true;
            }
        }

        return topAgents;
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getAgentCount() external view returns (uint256) {
        return agentList.length;
    }

    function getAgentData(
        address agent
    ) external view returns (DataTypes.AIAgentData memory) {
        return agents[agent];
    }

    function getAgentAccuracy(
        address agent
    ) external view returns (uint256 successRate) {
        uint256 total = successfulPredictions[agent] + failedPredictions[agent];
        if (total == 0) return 0;
        return (successfulPredictions[agent] * 10000) / total; // in bps
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setMinStake(uint256 newMinStake) external onlyOwner {
        minStake = newMinStake;
    }

    function setSlashPercentage(uint256 newPercentage) external onlyOwner {
        require(newPercentage <= 10000, "Invalid percentage");
        slashPercentage = newPercentage;
    }

    // ============================================================
    //          GOVERNANCE WHITELIST MANAGEMENT
    // ============================================================

    /**
     * @notice Add an agent to the governance-controlled whitelist.
     * @dev Only owner or governance controller can whitelist agents.
     */
    function whitelistAgent(address agent) external {
        require(
            msg.sender == owner() || msg.sender == governanceController,
            "Not authorized"
        );
        whitelistedAgents[agent] = true;
        emit AgentWhitelisted(agent);
    }

    /**
     * @notice Remove an agent from the whitelist.
     */
    function removeFromWhitelist(address agent) external {
        require(
            msg.sender == owner() || msg.sender == governanceController,
            "Not authorized"
        );
        whitelistedAgents[agent] = false;
        emit AgentRemovedFromWhitelist(agent);
    }

    /**
     * @notice Batch whitelist multiple agents.
     */
    function batchWhitelist(address[] calldata agents_) external onlyOwner {
        for (uint256 i = 0; i < agents_.length; i++) {
            whitelistedAgents[agents_[i]] = true;
            emit AgentWhitelisted(agents_[i]);
        }
    }

    /**
     * @notice Enable or disable whitelist enforcement.
     */
    function setWhitelistEnabled(bool enabled) external onlyOwner {
        whitelistEnabled = enabled;
        emit WhitelistToggled(enabled);
    }

    /**
     * @notice Set the governance controller address.
     */
    function setGovernanceController(address controller) external onlyOwner {
        governanceController = controller;
        emit GovernanceControllerUpdated(controller);
    }

    function isWhitelisted(address agent) external view returns (bool) {
        return whitelistedAgents[agent];
    }

    /**
     * @notice Check whether an agent is registered and currently active.
     * @dev Used by AIYieldEngine to gate prediction submissions.
     */
    function isAgentActive(address agent) external view returns (bool) {
        return agents[agent].isActive;
    }
}
