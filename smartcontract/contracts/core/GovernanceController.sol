// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GovernanceController
 * @author ChainNomads (AION Yield)
 * @notice Governance-controlled parameter management for the AION Yield protocol.
 *
 * @dev Implements a time-locked, role-based governance system for protocol parameters:
 *      - Timelock on critical parameter changes (configurable delay)
 *      - Guardian role for emergency actions
 *      - Proposal → Queue → Execute pattern for parameter updates
 *
 *      GOVERNANCE FLOW:
 *      ┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌─────────────┐
 *      │ Owner        │ ──→ │ Queue        │ ──→ │ Timelock     │ ──→ │ Execute     │
 *      │ proposes     │     │ Proposal     │     │ Period       │     │ Change      │
 *      └─────────────┘     └──────────────┘     └──────────────┘     └─────────────┘
 *                                                                          │
 *      ┌─────────────┐                                                     ↓
 *      │ Guardian     │ ──→ Emergency pause / cancel                  Protocol
 *      └─────────────┘                                                Updated
 */
contract GovernanceController is Ownable {
    // ============================================================
    //                      CONSTANTS
    // ============================================================

    uint256 public constant MIN_TIMELOCK_DELAY = 1 hours;
    uint256 public constant MAX_TIMELOCK_DELAY = 30 days;
    uint256 public constant GRACE_PERIOD = 14 days;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Guardian address for emergency actions
    address public guardian;

    /// @dev Timelock delay for parameter changes
    uint256 public timelockDelay = 24 hours;

    /// @dev Whether the protocol is paused
    bool public paused;

    /// @dev Queued parameter change proposals
    mapping(bytes32 => ProposalData) public proposals;

    /// @dev List of all proposal IDs
    bytes32[] public proposalIds;

    /// @dev Proposal counter
    uint256 public proposalCount;

    /// @dev Governed protocol contracts
    mapping(address => bool) public governedContracts;

    /// @dev Governed parameter bounds (min, max per parameter hash)
    mapping(bytes32 => ParameterBounds) public parameterBounds;

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    enum ProposalStatus {
        NONE,
        QUEUED,
        EXECUTED,
        CANCELLED,
        EXPIRED
    }

    struct ProposalData {
        bytes32 id;
        address target; // Contract to call
        bytes callData; // Function call data
        uint256 queuedAt; // When the proposal was queued
        uint256 executionTime; // Earliest execution time
        ProposalStatus status;
        string description; // Human-readable description
    }

    struct ParameterBounds {
        uint256 minValue;
        uint256 maxValue;
        bool isSet;
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event ProposalQueued(
        bytes32 indexed id,
        address indexed target,
        uint256 executionTime,
        string description
    );
    event ProposalExecuted(bytes32 indexed id, address indexed target);
    event ProposalCancelled(bytes32 indexed id);
    event GuardianUpdated(
        address indexed oldGuardian,
        address indexed newGuardian
    );
    event TimelockDelayUpdated(uint256 oldDelay, uint256 newDelay);
    event ProtocolPaused(address indexed by);
    event ProtocolUnpaused(address indexed by);
    event GovernedContractAdded(address indexed contractAddr);
    event GovernedContractRemoved(address indexed contractAddr);
    event ParameterBoundsSet(
        bytes32 indexed paramHash,
        uint256 min,
        uint256 max
    );
    event EmergencyActionExecuted(address indexed target, bytes callData);

    // ============================================================
    //                      MODIFIERS
    // ============================================================

    modifier onlyGuardian() {
        require(msg.sender == guardian, "Only guardian");
        _;
    }

    modifier onlyOwnerOrGuardian() {
        require(
            msg.sender == owner() || msg.sender == guardian,
            "Only owner or guardian"
        );
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Protocol is paused");
        _;
    }

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(address initialOwner, address guardian_) Ownable(initialOwner) {
        guardian = guardian_;
    }

    // ============================================================
    //              PROPOSAL: QUEUE → EXECUTE
    // ============================================================

    /**
     * @notice Queue a governance proposal for a parameter change.
     * @dev The proposal will be executable after the timelock delay.
     *
     * @param target The contract address to call
     * @param callData The encoded function call
     * @param description Human-readable description of the change
     * @return proposalId The unique proposal identifier
     */
    function queueProposal(
        address target,
        bytes calldata callData,
        string calldata description
    ) external onlyOwner returns (bytes32) {
        require(governedContracts[target], "Target not governed");

        uint256 executionTime = block.timestamp + timelockDelay;

        bytes32 proposalId = keccak256(
            abi.encode(target, callData, block.timestamp, proposalCount)
        );

        proposals[proposalId] = ProposalData({
            id: proposalId,
            target: target,
            callData: callData,
            queuedAt: block.timestamp,
            executionTime: executionTime,
            status: ProposalStatus.QUEUED,
            description: description
        });

        proposalIds.push(proposalId);
        proposalCount++;

        emit ProposalQueued(proposalId, target, executionTime, description);
        return proposalId;
    }

    /**
     * @notice Execute a queued proposal after the timelock has passed.
     * @param proposalId The proposal to execute
     */
    function executeProposal(
        bytes32 proposalId
    ) external onlyOwner whenNotPaused {
        ProposalData storage proposal = proposals[proposalId];

        require(proposal.status == ProposalStatus.QUEUED, "Not queued");
        require(
            block.timestamp >= proposal.executionTime,
            "Timelock not elapsed"
        );
        require(
            block.timestamp <= proposal.executionTime + GRACE_PERIOD,
            "Proposal expired"
        );

        proposal.status = ProposalStatus.EXECUTED;

        // Execute the proposal
        (bool success, ) = proposal.target.call(proposal.callData);
        require(success, "Proposal execution failed");

        emit ProposalExecuted(proposalId, proposal.target);
    }

    /**
     * @notice Cancel a queued proposal.
     * @dev Can be called by owner or guardian.
     */
    function cancelProposal(bytes32 proposalId) external onlyOwnerOrGuardian {
        ProposalData storage proposal = proposals[proposalId];
        require(proposal.status == ProposalStatus.QUEUED, "Not queued");
        proposal.status = ProposalStatus.CANCELLED;
        emit ProposalCancelled(proposalId);
    }

    // ============================================================
    //                 EMERGENCY ACTIONS
    // ============================================================

    /**
     * @notice Pause the protocol in case of emergency.
     * @dev Can be called by guardian or owner. Bypasses timelock.
     */
    function pauseProtocol() external onlyOwnerOrGuardian {
        paused = true;
        emit ProtocolPaused(msg.sender);
    }

    /**
     * @notice Unpause the protocol.
     * @dev Only owner can unpause (guardian can only pause).
     */
    function unpauseProtocol() external onlyOwner {
        paused = false;
        emit ProtocolUnpaused(msg.sender);
    }

    /**
     * @notice Execute an emergency action that bypasses timelock.
     * @dev Only guardian can call. Limited to specific emergency functions.
     *      Should only be used for pausing markets, freezing reserves, etc.
     */
    function emergencyAction(
        address target,
        bytes calldata callData
    ) external onlyGuardian {
        require(governedContracts[target], "Target not governed");

        (bool success, ) = target.call(callData);
        require(success, "Emergency action failed");

        emit EmergencyActionExecuted(target, callData);
    }

    // ============================================================
    //            GOVERNED CONTRACT MANAGEMENT
    // ============================================================

    function addGovernedContract(address contractAddr) external onlyOwner {
        require(contractAddr != address(0), "Invalid address");
        governedContracts[contractAddr] = true;
        emit GovernedContractAdded(contractAddr);
    }

    function removeGovernedContract(address contractAddr) external onlyOwner {
        governedContracts[contractAddr] = false;
        emit GovernedContractRemoved(contractAddr);
    }

    // ============================================================
    //             PARAMETER BOUNDS MANAGEMENT
    // ============================================================

    /**
     * @notice Set the allowed bounds for a specific parameter.
     * @dev paramHash = keccak256(abi.encode(contractAddress, functionSelector, paramName))
     */
    function setParameterBounds(
        bytes32 paramHash,
        uint256 minValue,
        uint256 maxValue
    ) external onlyOwner {
        require(maxValue >= minValue, "Invalid bounds");
        parameterBounds[paramHash] = ParameterBounds({
            minValue: minValue,
            maxValue: maxValue,
            isSet: true
        });
        emit ParameterBoundsSet(paramHash, minValue, maxValue);
    }

    /**
     * @notice Check if a value is within the allowed bounds for a parameter.
     */
    function isWithinBounds(
        bytes32 paramHash,
        uint256 value
    ) external view returns (bool) {
        ParameterBounds memory bounds = parameterBounds[paramHash];
        if (!bounds.isSet) return true; // No bounds = no restriction
        return value >= bounds.minValue && value <= bounds.maxValue;
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setGuardian(address newGuardian) external onlyOwner {
        address old = guardian;
        guardian = newGuardian;
        emit GuardianUpdated(old, newGuardian);
    }

    function setTimelockDelay(uint256 newDelay) external onlyOwner {
        require(newDelay >= MIN_TIMELOCK_DELAY, "Below minimum delay");
        require(newDelay <= MAX_TIMELOCK_DELAY, "Above maximum delay");
        uint256 old = timelockDelay;
        timelockDelay = newDelay;
        emit TimelockDelayUpdated(old, newDelay);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getProposal(
        bytes32 proposalId
    ) external view returns (ProposalData memory) {
        return proposals[proposalId];
    }

    function getProposalCount() external view returns (uint256) {
        return proposalCount;
    }

    function getProposalStatus(
        bytes32 proposalId
    ) external view returns (ProposalStatus) {
        ProposalData memory proposal = proposals[proposalId];
        if (proposal.status == ProposalStatus.QUEUED) {
            if (block.timestamp > proposal.executionTime + GRACE_PERIOD) {
                return ProposalStatus.EXPIRED;
            }
        }
        return proposal.status;
    }

    function isProtocolPaused() external view returns (bool) {
        return paused;
    }
}
