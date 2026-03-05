// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title AIRevenueDistributor
 * @author ChainNomads (AION Yield)
 * @notice Revenue distribution contract for AI agents participating in the protocol.
 *
 * @dev Manages the automated distribution of revenue earned by AI agents through
 *      the x402 payment protocol. Supports:
 *
 *      1. Revenue pooling from multiple inference payments
 *      2. Pro-rata distribution based on agent reputation and contribution
 *      3. Epoch-based distribution cycles
 *      4. Vesting schedules for agent earnings
 *      5. Integration with AIAgentRegistry for reputation weighting
 *
 *      REVENUE FLOW:
 *      ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
 *      │ x402 Payment │ ──→ │ Revenue Pool │ ──→ │ Distribution │
 *      │ Gateway      │     │ (This)       │     │ to Agents    │
 *      └──────────────┘     └──────────────┘     └──────────────┘
 *                                  │
 *                                  ├──→ Top Agent Bonus Pool
 *                                  ├──→ Community Pool
 *                                  └──→ Protocol Reserve
 */
contract AIRevenueDistributor is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Revenue token (typically USDC)
    IERC20 public revenueToken;

    /// @dev AI Agent Registry for reputation data
    address public agentRegistry;

    /// @dev Current distribution epoch
    uint256 public currentEpoch;

    /// @dev Duration of each epoch in seconds
    uint256 public epochDuration = 7 days;

    /// @dev Timestamp of last epoch start
    uint256 public epochStartTime;

    /// @dev Revenue accumulated in current epoch per agent
    mapping(uint256 => mapping(address => uint256)) public epochRevenue;

    /// @dev Total revenue in each epoch
    mapping(uint256 => uint256) public epochTotalRevenue;

    /// @dev Total revenue distributed in each epoch
    mapping(uint256 => uint256) public epochDistributed;

    /// @dev Whether an epoch has been finalized
    mapping(uint256 => bool) public epochFinalized;

    /// @dev Claimable balance per agent (accumulated undistributed revenue)
    mapping(address => uint256) public claimableBalance;

    /// @dev Total claimed per agent (lifetime)
    mapping(address => uint256) public totalClaimed;

    /// @dev Vesting schedule per agent per epoch
    mapping(address => mapping(uint256 => VestingSchedule))
        public vestingSchedules;

    /// @dev Revenue distribution shares (bps, must sum to 10000)
    uint256 public agentShare = 7000; // 70% to agents
    uint256 public topAgentBonus = 1500; // 15% bonus pool for top performers
    uint256 public communityShare = 1000; // 10% to community pool
    uint256 public protocolReserve = 500; // 5% to protocol reserve

    /// @dev Community pool address
    address public communityPool;

    /// @dev Protocol reserve address
    address public protocolReserveAddress;

    /// @dev Number of top agents eligible for bonus
    uint256 public topAgentCount = 5;

    /// @dev Minimum revenue threshold to participate in distribution
    uint256 public minRevenueThreshold = 0;

    /// @dev Total revenue ever received
    uint256 public totalRevenueReceived;

    /// @dev Total revenue ever distributed
    uint256 public totalRevenueDistributed;

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    struct VestingSchedule {
        uint256 totalAmount; // Total vested amount
        uint256 claimedAmount; // Already claimed
        uint256 vestingStart; // When vesting starts
        uint256 vestingDuration; // Duration of vesting
        bool isActive;
    }

    struct AgentRevenueInfo {
        address agent;
        uint256 currentEpochRevenue;
        uint256 claimable;
        uint256 totalClaimed;
        uint256 reputationScore;
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event RevenueDeposited(address indexed from, uint256 amount, uint256 epoch);
    event AgentRevenueRecorded(
        address indexed agent,
        uint256 amount,
        uint256 epoch
    );
    event EpochFinalized(
        uint256 indexed epoch,
        uint256 totalRevenue,
        uint256 distributed
    );
    event RevenueClaimed(address indexed agent, uint256 amount);
    event VestingCreated(
        address indexed agent,
        uint256 amount,
        uint256 vestingDuration
    );
    event DistributionSharesUpdated(
        uint256 agentShare,
        uint256 topAgentBonus,
        uint256 communityShare,
        uint256 protocolReserve
    );
    event EpochAdvanced(uint256 newEpoch);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address revenueToken_,
        address agentRegistry_,
        address communityPool_,
        address protocolReserve_
    ) Ownable(initialOwner) {
        revenueToken = IERC20(revenueToken_);
        agentRegistry = agentRegistry_;
        communityPool = communityPool_;
        protocolReserveAddress = protocolReserve_;
        epochStartTime = block.timestamp;
        currentEpoch = 1;
    }

    // ============================================================
    //               REVENUE DEPOSIT & RECORDING
    // ============================================================

    /**
     * @notice Deposit revenue into the distribution pool.
     * @dev Called by X402PaymentGateway after processing AI inference payments.
     * @param amount Amount of revenue tokens to deposit
     */
    function depositRevenue(uint256 amount) external {
        require(amount > 0, "Zero amount");
        revenueToken.safeTransferFrom(msg.sender, address(this), amount);
        epochTotalRevenue[currentEpoch] += amount;
        totalRevenueReceived += amount;
        emit RevenueDeposited(msg.sender, amount, currentEpoch);
    }

    /**
     * @notice Record revenue earned by a specific agent in the current epoch.
     * @dev Called when an AI agent completes a paid inference task.
     * @param agent The agent that earned the revenue
     * @param amount The revenue amount attributable to this agent
     */
    function recordAgentRevenue(address agent, uint256 amount) external {
        require(amount > 0, "Zero amount");

        // Deposit the revenue
        revenueToken.safeTransferFrom(msg.sender, address(this), amount);

        epochRevenue[currentEpoch][agent] += amount;
        epochTotalRevenue[currentEpoch] += amount;
        totalRevenueReceived += amount;

        emit AgentRevenueRecorded(agent, amount, currentEpoch);
    }

    // ============================================================
    //              EPOCH MANAGEMENT & DISTRIBUTION
    // ============================================================

    /**
     * @notice Advance to the next epoch.
     * @dev Can be called by anyone after the epoch duration has passed.
     */
    function advanceEpoch() external {
        require(
            block.timestamp >= epochStartTime + epochDuration,
            "Epoch not ended"
        );

        currentEpoch++;
        epochStartTime = block.timestamp;

        emit EpochAdvanced(currentEpoch);
    }

    /**
     * @notice Finalize a past epoch and calculate distributions.
     * @dev Distributes revenue according to the configured shares.
     *      Must be called after the epoch has ended.
     *
     * @param epoch The epoch number to finalize
     * @param agents List of agents who participated in this epoch
     * @param reputationScores Corresponding reputation scores for weighting
     */
    function finalizeEpoch(
        uint256 epoch,
        address[] calldata agents,
        uint256[] calldata reputationScores
    ) external onlyOwner {
        require(epoch < currentEpoch, "Cannot finalize current epoch");
        require(!epochFinalized[epoch], "Already finalized");
        require(agents.length == reputationScores.length, "Array mismatch");

        uint256 totalRevenue = epochTotalRevenue[epoch];
        if (totalRevenue == 0) {
            epochFinalized[epoch] = true;
            return;
        }

        // Calculate shares
        uint256 agentPool = (totalRevenue * agentShare) / 10000;
        uint256 bonusPool = (totalRevenue * topAgentBonus) / 10000;
        uint256 communityAmount = (totalRevenue * communityShare) / 10000;
        uint256 reserveAmount = totalRevenue -
            agentPool -
            bonusPool -
            communityAmount;

        // Distribute to agents based on their revenue contribution
        uint256 totalDistributed = 0;
        if (agentPool > 0 && agents.length > 0) {
            totalDistributed = _distributeToAgents(epoch, agents, agentPool);
        }

        // Distribute bonus to top agents by reputation
        if (bonusPool > 0 && agents.length > 0) {
            _distributeTopAgentBonus(agents, reputationScores, bonusPool);
            totalDistributed += bonusPool;
        }

        // Transfer community and reserve shares
        if (communityAmount > 0 && communityPool != address(0)) {
            revenueToken.safeTransfer(communityPool, communityAmount);
            totalDistributed += communityAmount;
        }
        if (reserveAmount > 0 && protocolReserveAddress != address(0)) {
            revenueToken.safeTransfer(protocolReserveAddress, reserveAmount);
            totalDistributed += reserveAmount;
        }

        epochDistributed[epoch] = totalDistributed;
        epochFinalized[epoch] = true;
        totalRevenueDistributed += totalDistributed;

        emit EpochFinalized(epoch, totalRevenue, totalDistributed);
    }

    /**
     * @notice Distribute revenue to agents proportionally based on their epoch contribution.
     */
    function _distributeToAgents(
        uint256 epoch,
        address[] calldata agents,
        uint256 pool
    ) internal returns (uint256 distributed) {
        uint256 totalAgentRevenue = 0;
        for (uint256 i = 0; i < agents.length; i++) {
            totalAgentRevenue += epochRevenue[epoch][agents[i]];
        }

        if (totalAgentRevenue == 0) return 0;

        for (uint256 i = 0; i < agents.length; i++) {
            uint256 agentRev = epochRevenue[epoch][agents[i]];
            if (agentRev >= minRevenueThreshold && totalAgentRevenue > 0) {
                uint256 share = (pool * agentRev) / totalAgentRevenue;
                claimableBalance[agents[i]] += share;
                distributed += share;
            }
        }
    }

    /**
     * @notice Distribute bonus pool to top-performing agents by reputation.
     */
    function _distributeTopAgentBonus(
        address[] calldata agents,
        uint256[] calldata reputationScores,
        uint256 pool
    ) internal {
        // Find top N agents by reputation
        uint256 count = agents.length < topAgentCount
            ? agents.length
            : topAgentCount;

        // Simple approach: sum reputation of top agents, distribute proportionally
        uint256 totalTopReputation = 0;
        uint256[] memory sortedIndices = new uint256[](count);
        bool[] memory used = new bool[](agents.length);

        // Select top N by reputation (selection sort)
        for (uint256 i = 0; i < count; i++) {
            uint256 bestScore = 0;
            uint256 bestIdx = 0;
            for (uint256 j = 0; j < agents.length; j++) {
                if (!used[j] && reputationScores[j] > bestScore) {
                    bestScore = reputationScores[j];
                    bestIdx = j;
                }
            }
            if (bestScore > 0) {
                sortedIndices[i] = bestIdx;
                used[bestIdx] = true;
                totalTopReputation += bestScore;
            }
        }

        // Distribute bonus proportionally by reputation
        if (totalTopReputation > 0) {
            for (uint256 i = 0; i < count; i++) {
                uint256 idx = sortedIndices[i];
                uint256 bonus = (pool * reputationScores[idx]) /
                    totalTopReputation;
                claimableBalance[agents[idx]] += bonus;
            }
        }
    }

    // ============================================================
    //                   CLAIMING
    // ============================================================

    /**
     * @notice Claim accumulated revenue.
     * @dev Agents call this to withdraw their earned revenue.
     */
    function claimRevenue() external nonReentrant {
        uint256 amount = claimableBalance[msg.sender];
        require(amount > 0, "Nothing to claim");

        claimableBalance[msg.sender] = 0;
        totalClaimed[msg.sender] += amount;

        revenueToken.safeTransfer(msg.sender, amount);

        emit RevenueClaimed(msg.sender, amount);
    }

    /**
     * @notice Claim a specific amount of revenue.
     */
    function claimRevenuePartial(uint256 amount) external nonReentrant {
        require(claimableBalance[msg.sender] >= amount, "Insufficient balance");
        require(amount > 0, "Zero amount");

        claimableBalance[msg.sender] -= amount;
        totalClaimed[msg.sender] += amount;

        revenueToken.safeTransfer(msg.sender, amount);

        emit RevenueClaimed(msg.sender, amount);
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setDistributionShares(
        uint256 agentShare_,
        uint256 topAgentBonus_,
        uint256 communityShare_,
        uint256 protocolReserve_
    ) external onlyOwner {
        require(
            agentShare_ + topAgentBonus_ + communityShare_ + protocolReserve_ ==
                10000,
            "Must sum to 10000"
        );
        agentShare = agentShare_;
        topAgentBonus = topAgentBonus_;
        communityShare = communityShare_;
        protocolReserve = protocolReserve_;
        emit DistributionSharesUpdated(
            agentShare_,
            topAgentBonus_,
            communityShare_,
            protocolReserve_
        );
    }

    function setEpochDuration(uint256 duration) external onlyOwner {
        require(duration >= 1 days, "Too short");
        epochDuration = duration;
    }

    function setTopAgentCount(uint256 count) external onlyOwner {
        topAgentCount = count;
    }

    function setMinRevenueThreshold(uint256 threshold) external onlyOwner {
        minRevenueThreshold = threshold;
    }

    function setCommunityPool(address pool) external onlyOwner {
        communityPool = pool;
    }

    function setProtocolReserveAddress(address reserve) external onlyOwner {
        protocolReserveAddress = reserve;
    }

    function setAgentRegistry(address registry) external onlyOwner {
        agentRegistry = registry;
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getClaimableBalance(
        address agent
    ) external view returns (uint256) {
        return claimableBalance[agent];
    }

    function getEpochRevenue(
        uint256 epoch,
        address agent
    ) external view returns (uint256) {
        return epochRevenue[epoch][agent];
    }

    function getCurrentEpochTotalRevenue() external view returns (uint256) {
        return epochTotalRevenue[currentEpoch];
    }

    function getTimeUntilNextEpoch() external view returns (uint256) {
        uint256 epochEnd = epochStartTime + epochDuration;
        if (block.timestamp >= epochEnd) return 0;
        return epochEnd - block.timestamp;
    }

    function getAgentRevenueInfo(
        address agent
    ) external view returns (AgentRevenueInfo memory) {
        return
            AgentRevenueInfo({
                agent: agent,
                currentEpochRevenue: epochRevenue[currentEpoch][agent],
                claimable: claimableBalance[agent],
                totalClaimed: totalClaimed[agent],
                reputationScore: 0 // Would be fetched from registry in production
            });
    }

    function getDistributionShares()
        external
        view
        returns (uint256, uint256, uint256, uint256)
    {
        return (agentShare, topAgentBonus, communityShare, protocolReserve);
    }
}
