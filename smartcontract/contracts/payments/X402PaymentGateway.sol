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

    /// @dev Whether native token (ETH) payments are enabled
    bool public nativePaymentsEnabled;

    /// @dev Payment history per payer
    mapping(address => bytes32[]) public payerHistory;

    /// @dev Payment history per provider
    mapping(address => bytes32[]) public providerHistory;

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
    event InferencePaymentSettled(
        bytes32 indexed paymentId,
        address indexed payer,
        address indexed provider,
        uint256 amount,
        uint256 fee,
        bytes32 requestId,
        string inferenceType
    );
    event NativePaymentReceived(address indexed payer, uint256 amount);
    event NativePaymentSent(address indexed provider, uint256 amount);
    event NativePaymentsToggled(bool enabled);
    event BatchPaymentProcessed(uint256 count, uint256 totalAmount);

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
    //      NATIVE TOKEN (ETH) PAYMENT SETTLEMENT
    // ============================================================

    /**
     * @notice Deposit native tokens (ETH) into escrow.
     */
    function depositNative() external payable {
        require(nativePaymentsEnabled, "Native payments disabled");
        require(msg.value > 0, "Invalid amount");
        escrowBalances[msg.sender] += msg.value;
        emit NativePaymentReceived(msg.sender, msg.value);
    }

    /**
     * @notice Process a payment using native token escrow.
     */
    function processNativePayment(
        bytes32 requestId,
        address payer,
        address provider
    ) external {
        require(nativePaymentsEnabled, "Native payments disabled");
        require(authorizedProviders[provider], "Provider not authorized");

        uint256 price = providerPrices[provider];
        require(price > 0, "Price not set");
        require(escrowBalances[payer] >= price, "Insufficient escrow");

        uint256 fee = (price * protocolFee) / 10000;
        uint256 providerAmount = price - fee;

        escrowBalances[payer] -= price;

        // Pay provider in ETH
        (bool sent, ) = provider.call{value: providerAmount}("");
        require(sent, "ETH transfer failed");
        emit NativePaymentSent(provider, providerAmount);

        // Pay protocol fee in ETH
        if (fee > 0 && feeRecipient != address(0)) {
            (bool feeSent, ) = feeRecipient.call{value: fee}("");
            require(feeSent, "Fee transfer failed");
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
        payerHistory[payer].push(paymentId);
        providerHistory[provider].push(paymentId);

        emit PaymentProcessed(paymentId, payer, provider, price);
    }

    // ============================================================
    //       ENRICHED AI INFERENCE EVENT EMISSION
    // ============================================================

    /**
     * @notice Process an AI inference payment with detailed result tracking.
     * @param requestId Unique request identifier
     * @param payer Entity paying for the inference
     * @param provider AI agent providing the inference
     * @param inferenceType Type of inference (e.g., "yield_prediction", "risk_assessment")
     */
    function processInferencePayment(
        bytes32 requestId,
        address payer,
        address provider,
        string calldata inferenceType
    ) external {
        require(authorizedProviders[provider], "Provider not authorized");

        uint256 price = providerPrices[provider];
        require(price > 0, "Price not set");
        require(escrowBalances[payer] >= price, "Insufficient escrow");

        uint256 fee = (price * protocolFee) / 10000;
        uint256 providerAmount = price - fee;

        escrowBalances[payer] -= price;

        paymentToken.safeTransfer(provider, providerAmount);
        if (fee > 0 && feeRecipient != address(0)) {
            paymentToken.safeTransfer(feeRecipient, fee);
        }

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
        payerHistory[payer].push(paymentId);
        providerHistory[provider].push(paymentId);

        emit InferencePaymentSettled(
            paymentId,
            payer,
            provider,
            price,
            fee,
            requestId,
            inferenceType
        );
    }

    // ============================================================
    //                 BATCH PAYMENTS
    // ============================================================

    /**
     * @notice Process multiple payments in a single transaction.
     */
    function batchProcessPayments(
        bytes32[] calldata requestIds,
        address[] calldata payers,
        address[] calldata providers
    ) external {
        require(
            requestIds.length == payers.length &&
                payers.length == providers.length,
            "Array length mismatch"
        );

        uint256 totalAmount = 0;
        for (uint256 i = 0; i < requestIds.length; i++) {
            require(
                authorizedProviders[providers[i]],
                "Provider not authorized"
            );
            uint256 price = providerPrices[providers[i]];
            require(price > 0, "Price not set");
            require(escrowBalances[payers[i]] >= price, "Insufficient escrow");

            uint256 fee = (price * protocolFee) / 10000;
            uint256 providerAmount = price - fee;

            escrowBalances[payers[i]] -= price;
            paymentToken.safeTransfer(providers[i], providerAmount);
            if (fee > 0 && feeRecipient != address(0)) {
                paymentToken.safeTransfer(feeRecipient, fee);
            }

            bytes32 paymentId = keccak256(
                abi.encode(requestIds[i], providers[i], block.timestamp)
            );
            payments[paymentId] = PaymentRecord({
                payer: payers[i],
                provider: providers[i],
                amount: price,
                fee: fee,
                timestamp: block.timestamp,
                requestId: requestIds[i],
                status: PaymentStatus.COMPLETED
            });

            totalPayments++;
            totalPaymentVolume += price;
            totalAmount += price;
            payerHistory[payers[i]].push(paymentId);
            providerHistory[providers[i]].push(paymentId);

            emit PaymentProcessed(paymentId, payers[i], providers[i], price);
        }

        emit BatchPaymentProcessed(requestIds.length, totalAmount);
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

    function getPayerHistory(
        address payer
    ) external view returns (bytes32[] memory) {
        return payerHistory[payer];
    }

    function getProviderHistory(
        address provider
    ) external view returns (bytes32[] memory) {
        return providerHistory[provider];
    }

    function getProviderEarnings(
        address provider
    ) external view returns (uint256 total) {
        bytes32[] memory history = providerHistory[provider];
        for (uint256 i = 0; i < history.length; i++) {
            PaymentRecord memory record = payments[history[i]];
            if (record.status == PaymentStatus.COMPLETED) {
                total += record.amount - record.fee;
            }
        }
    }

    function setNativePaymentsEnabled(bool enabled) external onlyOwner {
        nativePaymentsEnabled = enabled;
        emit NativePaymentsToggled(enabled);
    }

    receive() external payable {
        // Accept native token deposits
    }
}
