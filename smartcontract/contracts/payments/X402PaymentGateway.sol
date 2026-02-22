// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title X402PaymentGateway
 * @author ChainNomads (AION Yield)
 * @notice On-chain payment gateway for the x402 (HTTP 402 Payment Required) protocol.
 *
 * @dev Implements the on-chain settlement layer for x402 machine-to-machine payments:
 *
 *      x402 FLOW:
 *      ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
 *      │ Protocol     │ ──→ │ AI API       │ ──→ │ HTTP 402    │
 *      │ (Requester)  │     │ (Provider)   │     │ Payment Req │
 *      └─────────────┘     └──────────────┘     └─────────────┘
 *            │                                         │
 *            ↓                                         ↓
 *      ┌─────────────┐     ┌──────────────┐     ┌─────────────┐
 *      │ This Gateway │ ──→ │ USDC         │ ──→ │ AI Provider │
 *      │ Auto-pay     │     │ Transfer     │     │ Receives $  │
 *      └─────────────┘     └──────────────┘     └─────────────┘
 *            │
 *            ↓
 *      ┌─────────────┐
 *      │ AI Result    │
 *      │ Returned     │
 *      └─────────────┘
 *
 *      This enables AI agents to charge per prediction/inference,
 *      and the protocol automatically pays using escrowed funds.
 */
contract X402PaymentGateway is Ownable {
    using SafeERC20 for IERC20;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Payment token (USDC)
    IERC20 public paymentToken;

    /// @dev Escrow balances per depositor
    mapping(address => uint256) public escrowBalances;

    /// @dev Authorized service providers (AI agents)
    mapping(address => bool) public authorizedProviders;

    /// @dev Price per inference per provider (in payment token units)
    mapping(address => uint256) public providerPrices;

    /// @dev Payment records
    mapping(bytes32 => PaymentRecord) public payments;

    /// @dev Total payments made
    uint256 public totalPayments;
    uint256 public totalPaymentVolume;

    /// @dev Protocol fee in bps (e.g., 100 = 1%)
    uint256 public protocolFee = 100;

    /// @dev Protocol fee recipient
    address public feeRecipient;

    // ============================================================
    //                     DATA TYPES
    // ============================================================

    struct PaymentRecord {
        address payer; // Who paid
        address provider; // AI service provider
        uint256 amount; // Amount paid
        uint256 fee; // Protocol fee
        uint256 timestamp; // When payment was made
        bytes32 requestId; // Associated request ID
        PaymentStatus status; // Payment status
    }

    enum PaymentStatus {
        NONE,
        PENDING,
        COMPLETED,
        REFUNDED,
        DISPUTED
    }

    // ============================================================
    //                        EVENTS
    // ============================================================

    event Deposited(address indexed depositor, uint256 amount);
    event Withdrawn(address indexed depositor, uint256 amount);
    event PaymentProcessed(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed provider,
        uint256 amount
    );
    event PaymentRefunded(
        bytes32 indexed paymentId,
        address indexed payer,
        uint256 amount
    );
    event ProviderRegistered(
        address indexed provider,
        uint256 pricePerInference
    );
    event ProviderRemoved(address indexed provider);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address initialOwner,
        address paymentToken_,
        address feeRecipient_
    ) Ownable(initialOwner) {
        paymentToken = IERC20(paymentToken_);
        feeRecipient = feeRecipient_;
    }

    // ============================================================
    //                 ESCROW MANAGEMENT
    // ============================================================

    /**
     * @notice Deposit funds into the escrow for automated AI payments.
     * @dev The protocol deposits USDC that will be used to pay AI agents
     *      automatically when they provide inference results via x402.
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "Invalid amount");
        paymentToken.safeTransferFrom(msg.sender, address(this), amount);
        escrowBalances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw unused escrow funds.
     */
    function withdraw(uint256 amount) external {
        require(escrowBalances[msg.sender] >= amount, "Insufficient balance");
        escrowBalances[msg.sender] -= amount;
        paymentToken.safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, amount);
    }

    // ============================================================
    //          x402 PAYMENT PROCESSING
    //    (Automated crypto payment for AI inferences)
    // ============================================================

    /**
     * @notice Process a payment for an AI inference request.
     * @dev This simulates the x402 payment flow:
     *      1. AI API returns HTTP 402 with payment requirements
     *      2. Middleware calls this function to settle payment
     *      3. Funds move from escrow to provider
     *      4. AI API returns the inference result
     *
     * @param requestId Unique identifier for the inference request
     * @param payer The entity requesting (and paying for) the inference
     * @param provider The AI agent providing the inference
     */
    function processPayment(
        bytes32 requestId,
        address payer,
        address provider
    ) external {
        require(authorizedProviders[provider], "Provider not authorized");

        uint256 price = providerPrices[provider];
        require(price > 0, "Price not set");
        require(escrowBalances[payer] >= price, "Insufficient escrow");

        // Calculate fee
        uint256 fee = (price * protocolFee) / 10000;
        uint256 providerAmount = price - fee;

        // Deduct from escrow
        escrowBalances[payer] -= price;

        // Pay provider
        paymentToken.safeTransfer(provider, providerAmount);

        // Pay protocol fee
        if (fee > 0 && feeRecipient != address(0)) {
            paymentToken.safeTransfer(feeRecipient, fee);
        }

        // Record payment
        bytes32 paymentId = keccak256(
            abi.encode(requestId, provider, block.timestamp)
        );
        payments[paymentId] = PaymentRecord({
            payer: payer,
            provider: provider,
            amount: price,
            fee: fee,
            timestamp: block.timestamp,
            requestId: requestId,
            status: PaymentStatus.COMPLETED
        });

        totalPayments++;
        totalPaymentVolume += price;

        emit PaymentProcessed(paymentId, payer, provider, price);
    }

    /**
     * @notice Refund a payment (e.g., if AI inference failed).
     * @dev Can be called by owner for dispute resolution.
     */
    function refundPayment(bytes32 paymentId) external onlyOwner {
        PaymentRecord storage payment = payments[paymentId];
        require(payment.status == PaymentStatus.COMPLETED, "Not refundable");

        payment.status = PaymentStatus.REFUNDED;
        escrowBalances[payment.payer] += payment.amount;

        emit PaymentRefunded(paymentId, payment.payer, payment.amount);
    }

    // ============================================================
    //               PROVIDER MANAGEMENT
    // ============================================================

    /**
     * @notice Register an AI service provider with their price per inference.
     */
    function registerProvider(
        address provider,
        uint256 pricePerInference
    ) external onlyOwner {
        authorizedProviders[provider] = true;
        providerPrices[provider] = pricePerInference;
        emit ProviderRegistered(provider, pricePerInference);
    }

    /**
     * @notice Remove an AI service provider.
     */
    function removeProvider(address provider) external onlyOwner {
        authorizedProviders[provider] = false;
        emit ProviderRemoved(provider);
    }

    /**
     * @notice Update a provider's price per inference.
     */
    function updateProviderPrice(address provider, uint256 newPrice) external {
        require(
            msg.sender == provider || msg.sender == owner(),
            "Not authorized"
        );
        require(authorizedProviders[provider], "Not a provider");
        providerPrices[provider] = newPrice;
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setProtocolFee(uint256 newFee) external onlyOwner {
        require(newFee <= 1000, "Fee too high"); // Max 10%
        protocolFee = newFee;
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        feeRecipient = newRecipient;
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getEscrowBalance(
        address depositor
    ) external view returns (uint256) {
        return escrowBalances[depositor];
    }

    function getProviderPrice(
        address provider
    ) external view returns (uint256) {
        return providerPrices[provider];
    }

    function isProviderActive(address provider) external view returns (bool) {
        return authorizedProviders[provider];
    }
}
