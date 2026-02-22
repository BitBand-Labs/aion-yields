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
 * @dev This contract uses Chainlink CCIP to transfer assets and instruction data
 *      across chains to interact with the AION Yield LendingPool.
 *
 *      Use Cases:
 *      1. Cross-chain Deposit: Deposit tokens on Chain A -> Mint aTokens on Chain B.
 *      2. Cross-chain Rebalancing: AI engine sends rebalancing signals across chains.
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

    /// @dev Link token for paying CCIP fees (if not using native)
    IERC20 public linkToken;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event MessageSent(
        bytes32 indexed messageId,
        uint64 indexed destinationChainSelector,
        address receiver,
        Client.EVMTokenAmount tokenAmount,
        uint256 fees
    );

    event MessageReceived(
        bytes32 indexed messageId,
        uint64 indexed sourceChainSelector,
        address sender,
        address user,
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
    //              CROSS-CHAIN SENDING (Chain A)
    // ============================================================

    /**
     * @notice Deposits tokens on this chain to be credited in the LendingPool on a destination chain.
     * @param destinationChainSelector CCIP chain selector for the target chain.
     * @param receiver Address of the CrossChainVault on the destination chain.
     * @param token Address of the token to transfer.
     * @param amount Amount to transfer.
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

        // 1. Transfer tokens from user to this vault
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);

        // 2. Approve CCIP Router
        IERC20(token).approve(getRouter(), amount);

        // 3. Prepare token amounts for CCIP
        Client.EVMTokenAmount[]
            memory tokenAmounts = new Client.EVMTokenAmount[](1);
        tokenAmounts[0] = Client.EVMTokenAmount({token: token, amount: amount});

        // 4. Prepare CCIP Message
        // Data contains the user's address so Chain B knows who to credit
        Client.EVM2AnyMessage memory message = Client.EVM2AnyMessage({
            receiver: abi.encode(receiver),
            data: abi.encode(msg.sender),
            tokenAmounts: tokenAmounts,
            extraArgs: Client._argsToBytes(
                Client.EVMExtraArgsV1({gasLimit: 200_000})
            ),
            feeToken: address(linkToken)
        });

        // 5. Calculate and pay fees
        uint256 fees = IRouterClient(getRouter()).getFee(
            destinationChainSelector,
            message
        );
        require(
            linkToken.balanceOf(address(this)) >= fees,
            "Insufficient LINK for fees"
        );
        linkToken.approve(getRouter(), fees);

        // 6. Send CCIP Message
        messageId = IRouterClient(getRouter()).ccipSend(
            destinationChainSelector,
            message
        );

        emit MessageSent(
            messageId,
            destinationChainSelector,
            receiver,
            tokenAmounts[0],
            fees
        );
    }

    // ============================================================
    //              CROSS-CHAIN RECEIVING (Chain B)
    // ============================================================

    /**
     * @notice Callback called by CCIP Router when a message is received.
     * @dev Automatically deposits the received tokens into the LendingPool on behalf of the user.
     */
    function _ccipReceive(
        Client.Any2EVMMessage memory message
    ) internal override {
        // 1. Validate sender is an authorized vault on the source chain
        uint64 sourceChain = message.sourceChainSelector;
        address sender = abi.decode(message.sender, (address));
        require(remoteVaults[sourceChain] == sender, "Invalid remote sender");

        // 2. Decode user address from data
        address user = abi.decode(message.data, (address));

        // 3. Process each received token
        for (uint256 i = 0; i < message.destTokenAmounts.length; i++) {
            address token = message.destTokenAmounts[i].token;
            uint256 amount = message.destTokenAmounts[i].amount;

            // 4. Deposit into LendingPool for the user
            IERC20(token).approve(address(lendingPool), amount);
            lendingPool.deposit(token, amount, user);

            emit MessageReceived(
                message.messageId,
                sourceChain,
                sender,
                user,
                amount
            );
        }
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

    function setLendingPool(address pool) external onlyOwner {
        lendingPool = ILendingPool(pool);
    }

    /// @notice Allows owner to withdraw stuck LINK or tokens
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
    }
}
