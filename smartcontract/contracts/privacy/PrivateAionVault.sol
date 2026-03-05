// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ILendingPool.sol";

/**
 * @title PrivateAionVault
 * @author ChainNomads (AION Yield)
 * @notice A privacy-preserving vault inspired by Chainlink's Compliant Private Transfer (CPT).
 *
 * @dev This contract allows users to deposit funds into a "shielded" pool.
 *      The pooled funds are then deposited into the AION LendingPool to earn yield.
 *      Individual user balances are managed off-chain for privacy, but all withdrawals
 *      require a compliance-verified "ticket" signed by the protocol's PolicyEngine.
 *
 *      ARCHITECTURE:
 *      1. User deposits USDC -> Vault deposits into LendingPool.
 *      2. User moves private balance to another user (Off-chain API).
 *      3. User wants to withdraw -> Requests ticket from Off-chain API.
 *      4. Off-chain API (ACE) checks compliance rules.
 *      5. API provides EIP-712 signed ticket.
 *      6. User submits ticket to this Vault on-chain to receive funds.
 */
contract PrivateAionVault is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev The token being shielded (e.g., USDC)
    IERC20 public immutable underlyingAsset;

    /// @dev The AION Lending Pool
    ILendingPool public immutable lendingPool;

    /// @dev The authorized compliance signer (Policy Engine / API)
    address public policySigner;

    /// @dev The on-chain Compliance Engine for secondary verification
    address public complianceEngine;

    /// @dev Domain separator for EIP-712 tickets
    bytes32 private immutable DOMAIN_SEPARATOR;

    /// @dev Mapping of used ticket hashes to prevent replay attacks
    mapping(bytes32 => bool) public usedTickets;

    /// @dev Total amount currently in the shielded pool (including accrued yield)
    uint256 public totalShieldedBalance;

    // ============================================================
    //                     EIP-712 TYPES
    // ============================================================

    bytes32 public constant WITHDRAW_TICKET_TYPEHASH =
        keccak256(
            "WithdrawTicket(address owner,address recipient,uint256 amount,uint256 nonce,uint256 deadline)"
        );

    // ============================================================
    //                        EVENTS
    // ============================================================

    event ShieldedDeposit(address indexed user, uint256 amount);
    event ShieldedWithdrawal(
        address indexed user,
        address indexed recipient,
        uint256 amount
    );
    event PolicySignerBatchUpdated(
        address indexed oldSigner,
        address indexed newSigner
    );
    event ComplianceEngineUpdated(
        address indexed oldEngine,
        address indexed newEngine
    );

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address _underlyingAsset,
        address _lendingPool,
        address _policySigner,
        address _complianceEngine
    ) Ownable(initialOwner) {
        underlyingAsset = IERC20(_underlyingAsset);
        lendingPool = ILendingPool(_lendingPool);
        policySigner = _policySigner;
        complianceEngine = _complianceEngine;

        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256("PrivateAionVault"),
                keccak256("1"),
                block.chainid,
                address(this)
            )
        );

        // Approve LendingPool to spend the underlying asset
        underlyingAsset.forceApprove(_lendingPool, type(uint256).max);
    }

    // ============================================================
    //                  SHIELDED OPERATIONS
    // ============================================================

    /**
     * @notice Deposit funds into the shielded pool.
     * @dev Funds are immediately moved to the LendingPool to earn interest.
     * @param amount The amount to deposit
     */
    function depositShielded(uint256 amount) external nonReentrant {
        require(amount > 0, "Amount must be > 0");

        // 1. Transfer funds from user to this vault
        underlyingAsset.safeTransferFrom(msg.sender, address(this), amount);

        // 2. Deposit into LendingPool
        lendingPool.deposit(address(underlyingAsset), amount, address(this));

        // 3. Update internal accounting
        totalShieldedBalance += amount;

        emit ShieldedDeposit(msg.sender, amount);
    }

    /**
     * @notice Withdraw funds from the shielded pool using a verified compliance ticket.
     * @dev The ticket must be signed by the authorized `policySigner`.
     *
     * @param owner The private balance owner (off-chain identity)
     * @param recipient The address receiving the funds on-chain
     * @param amount The amount to withdraw
     * @param nonce A unique nonce to prevent replay
     * @param deadline Expiration timestamp for the ticket
     * @param signature The EIP-712 signature from the policySigner
     */
    function withdrawShielded(
        address owner,
        address recipient,
        uint256 amount,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external nonReentrant {
        require(block.timestamp <= deadline, "Ticket expired");
        require(amount > 0, "Amount must be > 0");

        // 1. Verify ticket hash and prevent replay
        bytes32 structHash = keccak256(
            abi.encode(
                WITHDRAW_TICKET_TYPEHASH,
                owner,
                recipient,
                amount,
                nonce,
                deadline
            )
        );

        bytes32 digest = MessageHashUtils.toTypedDataHash(
            DOMAIN_SEPARATOR,
            structHash
        );
        require(!usedTickets[digest], "Ticket already used");
        usedTickets[digest] = true;

        // 2. Verify signature from authorized policy signer
        address signer = digest.recover(signature);
        require(signer == policySigner, "Invalid policy signature");

        // 3. Optional On-chain Compliance Check (Redundant protection)
        if (complianceEngine != address(0)) {
            (bool isCompliant, string memory reason) = IAionComplianceEngine(
                complianceEngine
            ).validateWithdrawal(recipient, address(underlyingAsset), amount);
            require(isCompliant, reason);

            // Record the withdrawal for velocity limits
            IAionComplianceEngine(complianceEngine).recordWithdrawal(
                address(underlyingAsset),
                amount
            );
        }

        // 4. Withdraw from LendingPool
        lendingPool.withdraw(address(underlyingAsset), amount, recipient);

        // 5. Update accounting
        totalShieldedBalance -= amount;

        emit ShieldedWithdrawal(owner, recipient, amount);
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Update the policy signer address.
     */
    function setPolicySigner(address _newSigner) external onlyOwner {
        require(_newSigner != address(0), "Invalid signer");
        address oldSigner = policySigner;
        policySigner = _newSigner;
        emit PolicySignerBatchUpdated(oldSigner, _newSigner);
    }

    /**
     * @notice Update the compliance engine address.
     */
    function setComplianceEngine(address _newEngine) external onlyOwner {
        address oldEngine = complianceEngine;
        complianceEngine = _newEngine;
        emit ComplianceEngineUpdated(oldEngine, _newEngine);
    }

    /**
     * @notice Emergency function to withdraw all funds to owner.
     */
    function emergencyExit() external onlyOwner {
        uint256 balance = underlyingAsset.balanceOf(address(this));
        if (balance > 0) {
            underlyingAsset.safeTransfer(owner(), balance);
        }
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Returns the total value held in the LendingPool for this vault.
     */
    function getVaultValueInPool() external view returns (uint256) {
        // Simple return for MVP - in production this would query aToken balance
        return totalShieldedBalance;
    }
}

/**
 * @dev Simple interface for the Compliance Engine.
 */
interface IAionComplianceEngine {
    function validateWithdrawal(
        address user,
        address asset,
        uint256 amount
    ) external view returns (bool isCompliant, string memory reason);

    function recordWithdrawal(address asset, uint256 amount) external;
}
