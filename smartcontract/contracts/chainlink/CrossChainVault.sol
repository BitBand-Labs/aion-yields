// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ILendingPool.sol";

/**
 * @title CrossChainVault
 * @author ChainNomads (AION Yield)
 * @notice CCIP-enabled vault for cross-chain deposits and liquidity management.
 * @dev Uses message-only CCIP (lock & mint pattern):
 *      - Source chain: locks tokens in the vault, sends a CCIP message
 *      - Destination chain: receives message, deposits from vault reserves into LendingPool
 *
 *      This avoids requiring tokens to be in CCIP's token pool whitelist.
 */
contract CrossChainVault is CCIPReceiver, Ownable {
    using SafeERC20 for IERC20;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev The lending pool on THIS chain
    ILendingPool public lendingPool;

    /// @dev Mapping of supported destination chains (chainSelector => allowed)
    mapping(uint64 => bool) public supportedChains;

    /// @dev Mapping of authorized cross-chain vault addresses on other chains
    mapping(uint64 => address) public remoteVaults;

    /// @dev Mapping of token on source chain => equivalent token on this chain
    mapping(uint64 => mapping(address => address)) public tokenMappings;

    /// @dev Link token for paying CCIP fees
    IERC20 public linkToken;

    /// @dev Total locked per token (for accounting)
    mapping(address => uint256) public lockedBalance;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event CrossChainDepositSent(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        address indexed user,
        address token,
        uint256 amount,
        uint256 fees
    );

    event CrossChainDepositReceived(
        bytes32 indexed messageId,
        uint64 indexed sourceChainSelector,
        address indexed user,
        address token,
        uint256 amount
    );

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address router,
        address link,
        address lendingPool_,
        address initialOwner
    ) CCIPReceiver(router) Ownable(initialOwner) {
        linkToken = IERC20(link);
        lendingPool = ILendingPool(lendingPool_);
    }

    // ============================================================
    //              CROSS-CHAIN SENDING (Source Chain)
    // ============================================================

    /**
     * @notice Lock tokens on this chain and send a CCIP message to credit
     *         the user on the destination chain's LendingPool.
     * @param destinationChainSelector CCIP chain selector for the target chain.
     * @param receiver Address of the CrossChainVault on the destination chain.
     * @param token Address of the token to lock.
     * @param amount Amount to lock and credit cross-chain.
     */
    function depositCrossChain(
        uint64 destinationChainSelector,
        address receiver,
        address token,
        uint256 amount
    ) external returns (bytes32 messageId) {
        require(
            supportedChains[destinationChainSelector],
            "Chain not supported"
        );

        // 1. Lock tokens from user into this vault
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        lockedBalance[token] += amount;

        // 2. Prepare message-only CCIP payload (no token transfer)
        //    Encode: user address, source token address, amount
        bytes memory payload = abi.encode(msg.sender, token, amount);

        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(receiver),
            data: payload,
            tokenAmounts: new Client.EVMTokenAmount[](0), // No token transfer via CCIP
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: 300_000})
            ),
            feeToken: address(linkToken)
        });

        // 3. Calculate and pay fees
        uint256 fees = IRouterClient(getRouter()).getFee(
            destinationChainSelector,
            message
        );
        require(
            linkToken.balanceOf(address(this)) >= fees,
            "Insufficient LINK for fees"
        );
        linkToken.approve(getRouter(), fees);

        // 4. Send CCIP Message
        messageId = IRouterClient(getRouter()).ccipSend(
            destinationChainSelector,
            message
        );

        emit CrossChainDepositSent(
            messageId,
            destinationChainSelector,
            msg.sender,
            token,
            amount,
            fees
        );
    }

    // ============================================================
    //          CROSS-CHAIN RECEIVING (Destination Chain)
    // ============================================================

    /**
     * @notice Callback called by CCIP Router when a message is received.
     * @dev Deposits from vault reserves into the LendingPool on behalf of the user.
     */
    function _ccipReceive(
        Client.Any2EVMMessage memory message
    ) internal override {
        // 1. Validate sender is an authorized vault on the source chain
        uint64 sourceChain = message.sourceChainSelector;
        address sender = abi.decode(message.sender, (address));
        require(remoteVaults[sourceChain] == sender, "Invalid remote sender");

        // 2. Decode payload: user, sourceToken, amount
        (address user, address sourceToken, uint256 amount) = abi.decode(
            message.data,
            (address, address, uint256)
        );

        // 3. Resolve the local token equivalent
        address localToken = tokenMappings[sourceChain][sourceToken];
        require(localToken != address(0), "Token mapping not set");

        // 4. Deposit from vault reserves into LendingPool for the user
        IERC20(localToken).approve(address(lendingPool), amount);
        lendingPool.deposit(localToken, amount, user);

        emit CrossChainDepositReceived(
            message.messageId,
            sourceChain,
            user,
            localToken,
            amount
        );
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setSupportedChain(
        uint64 chainSelector,
        bool supported
    ) external onlyOwner {
        supportedChains[chainSelector] = supported;
    }

    function setRemoteVault(
        uint64 chainSelector,
        address vault
    ) external onlyOwner {
        remoteVaults[chainSelector] = vault;
    }

    /// @notice Map a token on a source chain to its equivalent on this chain
    function setTokenMapping(
        uint64 sourceChainSelector,
        address sourceToken,
        address localToken
    ) external onlyOwner {
        tokenMappings[sourceChainSelector][sourceToken] = localToken;
    }

    function setLendingPool(address pool) external onlyOwner {
        lendingPool = ILendingPool(pool);
    }

    /// @notice Fund the vault with tokens for cross-chain deposits
    function fundVault(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Allows owner to withdraw stuck LINK or tokens
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
    }
}
