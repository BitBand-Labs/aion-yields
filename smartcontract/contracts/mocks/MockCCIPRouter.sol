// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Client} from "@chainlink/contracts-ccip/contracts/libraries/Client.sol";
import {IRouterClient} from "@chainlink/contracts-ccip/contracts/interfaces/IRouterClient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CCIPReceiver} from "@chainlink/contracts-ccip/contracts/applications/CCIPReceiver.sol";

/**
 * @title MockCCIPRouter
 * @notice Simulates CCIP Router for local testing of CrossChainVault.
 *         Stores sent messages and allows manual delivery to receiver contracts.
 */
contract MockCCIPRouter is IRouterClient {
    uint256 public constant FIXED_FEE = 0.01 ether; // Fixed fee in LINK
    uint256 public messageCount;

    struct SentMessage {
        uint64 destinationChainSelector;
        Client.EVM2AnyMessage message;
        bytes32 messageId;
    }

    SentMessage[] public sentMessages;

    // Track supported chains
    mapping(uint64 => bool) public supportedChains;

    constructor() {
        // Support common test selectors
        supportedChains[14767482510784806043] = true; // Fuji
        supportedChains[16015286601757825753] = true; // Sepolia
    }

    function isChainSupported(uint64 destChainSelector) external view override returns (bool) {
        return supportedChains[destChainSelector];
    }

    function getFee(
        uint64 /* destinationChainSelector */,
        Client.EVM2AnyMessage memory /* message */
    ) external pure override returns (uint256) {
        return FIXED_FEE;
    }

    function ccipSend(
        uint64 destinationChainSelector,
        Client.EVM2AnyMessage calldata message
    ) external payable override returns (bytes32 messageId) {
        messageCount++;
        messageId = keccak256(abi.encode(messageCount, destinationChainSelector, msg.sender));

        // Collect LINK fee from sender (already approved)
        address feeToken = message.feeToken;
        if (feeToken != address(0)) {
            IERC20(feeToken).transferFrom(msg.sender, address(this), FIXED_FEE);
        }

        return messageId;
    }

    /// @notice Simulate delivering a CCIP message to a receiver contract
    function deliverMessage(
        address receiverContract,
        uint64 sourceChainSelector,
        address senderOnSource,
        bytes memory data
    ) external {
        messageCount++;
        bytes32 messageId = keccak256(abi.encode("deliver", messageCount));

        Client.Any2EVMMessage memory message = Client.Any2EVMMessage({
            messageId: messageId,
            sourceChainSelector: sourceChainSelector,
            sender: abi.encode(senderOnSource),
            data: data,
            destTokenAmounts: new Client.EVMTokenAmount[](0)
        });

        CCIPReceiver(receiverContract).ccipReceive(message);
    }
}
