// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "./IPolicy.sol";

/**
 * @title CertifiedActionValidatorPolicy
 * @author ChainNomads (AION Yield)
 * @notice Chainlink ACE policy that requires EIP-712 signed certificates for AI agent actions.
 *
 * @dev This policy ensures that every AI agent action (rate adjustment, allocation rebalance,
 *      prediction submission) carries a cryptographic certificate signed by an authorized signer.
 *
 *      This answers the critical question: "What stops the AI from going rogue?"
 *
 *      CERTIFICATE FLOW:
 *      ┌──────────┐     ┌─────────────┐     ┌──────────────────────┐
 *      │ AI Agent  │ ──→ │ Certifier   │ ──→ │ EIP-712 Certificate  │
 *      │ (off-chain)│    │ (DON/Signer)│     │ (action + nonce +    │
 *      └──────────┘     └─────────────┘     │  deadline + params)  │
 *                                            └──────────┬───────────┘
 *                                                       │
 *                                                       ▼
 *                                            ┌──────────────────────┐
 *                                            │ This Policy validates │
 *                                            │ signature on-chain    │
 *                                            └──────────────────────┘
 *
 *      CERTIFICATE TYPES:
 *      - RATE_ADJUSTMENT: Certifies an AI rate recommendation is valid
 *      - ALLOCATION_REBALANCE: Certifies an AI allocation instruction is valid
 *      - PREDICTION: Certifies a yield prediction from a known AI agent
 *
 *      SECURITY MODEL:
 *      - Authorized signers can be individual keys, multisigs, or Chainlink DON
 *      - Certificates have deadlines (expire) and nonces (replay protection)
 *      - Each AI agent must be registered before its actions are certified
 */
contract CertifiedActionValidatorPolicy is IPolicy, EIP712, Ownable {
    using ECDSA for bytes32;

    // ============================================================
    //                      CONSTANTS
    // ============================================================

    bytes32 public constant ACTION_CERTIFICATE_TYPEHASH = keccak256(
        "ActionCertificate(address agent,address target,bytes4 selector,bytes32 paramsHash,uint256 nonce,uint256 deadline)"
    );

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Authorized certificate signers (can be DON address, multisig, or trusted key)
    mapping(address => bool) public authorizedSigners;

    /// @dev Registered AI agents that can submit certified actions
    mapping(address => bool) public registeredAgents;

    /// @dev Nonces per agent to prevent replay attacks
    mapping(address => uint256) public agentNonces;

    /// @dev Pending certificates: hash(agent, target, selector, nonce) => certificate data
    /// Used to validate actions when they arrive at the protected contract
    mapping(bytes32 => Certificate) public pendingCertificates;

    /// @dev Whether this policy is currently active
    bool public active = true;

    /// @dev The PolicyEngine that calls postExecutionUpdate
    address public policyEngine;

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    struct Certificate {
        address agent;          // The AI agent this certificate is for
        address target;         // The contract the agent wants to call
        bytes4 selector;        // The function the agent wants to call
        bytes32 paramsHash;     // Hash of the action parameters
        uint256 nonce;          // Replay protection
        uint256 deadline;       // Certificate expiration timestamp
        address signer;         // Who signed this certificate
        bool used;              // Whether this certificate has been consumed
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event CertificateSubmitted(
        address indexed agent,
        address indexed target,
        bytes4 selector,
        uint256 nonce,
        uint256 deadline,
        address indexed signer
    );
    event CertificateConsumed(address indexed agent, uint256 nonce);
    event SignerUpdated(address indexed signer, bool authorized);
    event AgentRegistered(address indexed agent, bool registered);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address initialSigner
    ) EIP712("AION-ACE-CertifiedAction", "1") Ownable(initialOwner) {
        authorizedSigners[initialSigner] = true;
        emit SignerUpdated(initialSigner, true);
    }

    // ============================================================
    //          CERTIFICATE SUBMISSION (Off-chain → On-chain)
    // ============================================================

    /**
     * @notice Submit a signed certificate that authorizes an AI agent action.
     * @dev Called before the actual action. The certificate is stored and validated
     *      when the PolicyEngine checks the action via validate().
     *
     * @param agent The AI agent address performing the action
     * @param target The contract the agent will call
     * @param selector The function selector the agent will call
     * @param paramsHash Hash of the action parameters (for binding certificate to specific params)
     * @param deadline Timestamp after which this certificate expires
     * @param signature EIP-712 signature from an authorized signer
     */
    function submitCertificate(
        address agent,
        address target,
        bytes4 selector,
        bytes32 paramsHash,
        uint256 deadline,
        bytes calldata signature
    ) external {
        require(deadline > block.timestamp, "Certificate expired");
        require(registeredAgents[agent], "Agent not registered");

        uint256 nonce = agentNonces[agent];

        // Verify EIP-712 signature
        bytes32 structHash = keccak256(abi.encode(
            ACTION_CERTIFICATE_TYPEHASH,
            agent,
            target,
            selector,
            paramsHash,
            nonce,
            deadline
        ));
        bytes32 digest = _hashTypedDataV4(structHash);
        address signer = ECDSA.recover(digest, signature);

        require(authorizedSigners[signer], "Invalid signer");

        // Store the certificate
        bytes32 certKey = _certKey(agent, target, selector, nonce);
        pendingCertificates[certKey] = Certificate({
            agent: agent,
            target: target,
            selector: selector,
            paramsHash: paramsHash,
            nonce: nonce,
            deadline: deadline,
            signer: signer,
            used: false
        });

        // Increment nonce
        agentNonces[agent] = nonce + 1;

        emit CertificateSubmitted(agent, target, selector, nonce, deadline, signer);
    }

    // ============================================================
    //          IPolicy IMPLEMENTATION
    // ============================================================

    /**
     * @notice Validates that the caller has a valid, unexpired certificate for this action.
     * @dev The `data` parameter is expected to be abi.encode(paramsHash) to bind
     *      the certificate to the specific action parameters.
     */
    function validate(
        address caller,
        address target,
        bytes4 selector,
        bytes calldata data
    ) external view override returns (bool valid, string memory reason) {
        if (!active) return (true, "");

        // If caller is not a registered agent, skip this policy (allow non-agent callers)
        if (!registeredAgents[caller]) return (true, "");

        // Decode the params hash from the data
        bytes32 paramsHash;
        if (data.length >= 32) {
            paramsHash = abi.decode(data, (bytes32));
        }

        // Look for a valid certificate (check current nonce - 1, since nonce was incremented on submit)
        uint256 currentNonce = agentNonces[caller];
        // Search recent certificates (check last 5 nonces for flexibility)
        uint256 searchStart = currentNonce > 5 ? currentNonce - 5 : 0;

        for (uint256 n = searchStart; n < currentNonce; n++) {
            bytes32 certKey = _certKey(caller, target, selector, n);
            Certificate storage cert = pendingCertificates[certKey];

            if (cert.agent == caller &&
                cert.target == target &&
                cert.selector == selector &&
                !cert.used &&
                cert.deadline > block.timestamp)
            {
                // If paramsHash is provided, verify it matches
                if (paramsHash != bytes32(0) && cert.paramsHash != paramsHash) {
                    continue;
                }
                return (true, "");
            }
        }

        return (false, "No valid certificate for this action");
    }

    /**
     * @notice Marks the certificate as consumed after successful execution.
     */
    function postExecutionUpdate(
        address caller,
        address target,
        bytes4 selector,
        bytes calldata /* data */
    ) external override {
        require(msg.sender == policyEngine, "Only PolicyEngine");

        if (!registeredAgents[caller]) return;

        // Find and consume the certificate
        uint256 currentNonce = agentNonces[caller];
        uint256 searchStart = currentNonce > 5 ? currentNonce - 5 : 0;

        for (uint256 n = searchStart; n < currentNonce; n++) {
            bytes32 certKey = _certKey(caller, target, selector, n);
            Certificate storage cert = pendingCertificates[certKey];

            if (cert.agent == caller &&
                cert.target == target &&
                cert.selector == selector &&
                !cert.used &&
                cert.deadline > block.timestamp)
            {
                cert.used = true;
                emit CertificateConsumed(caller, n);
                return;
            }
        }
    }

    function policyName() external pure override returns (string memory) {
        return "CertifiedActionValidator";
    }

    function isActive() external view override returns (bool) {
        return active;
    }

    // ============================================================
    //                   ADMIN FUNCTIONS
    // ============================================================

    function setAuthorizedSigner(address signer, bool authorized) external onlyOwner {
        authorizedSigners[signer] = authorized;
        emit SignerUpdated(signer, authorized);
    }

    function registerAgent(address agent, bool registered) external onlyOwner {
        registeredAgents[agent] = registered;
        emit AgentRegistered(agent, registered);
    }

    function setActive(bool _active) external onlyOwner {
        active = _active;
    }

    function setPolicyEngine(address engine) external onlyOwner {
        policyEngine = engine;
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getCertificate(
        address agent,
        address target,
        bytes4 selector,
        uint256 nonce
    ) external view returns (Certificate memory) {
        return pendingCertificates[_certKey(agent, target, selector, nonce)];
    }

    function getAgentNonce(address agent) external view returns (uint256) {
        return agentNonces[agent];
    }

    /**
     * @notice Returns the EIP-712 domain separator for off-chain signing.
     */
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // ============================================================
    //                     INTERNALS
    // ============================================================

    function _certKey(
        address agent,
        address target,
        bytes4 selector,
        uint256 nonce
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(agent, target, selector, nonce));
    }
}
