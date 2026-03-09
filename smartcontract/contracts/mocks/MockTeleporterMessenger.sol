// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ITeleporterMessenger, TeleporterMessageInput, TeleporterFeeInfo} from "../interfaces/ITeleporterMessenger.sol";
import {ITeleporterReceiver} from "../interfaces/ITeleporterReceiver.sol";

/**
 * @title MockTeleporterMessenger
 * @notice Simulates the Avalanche Teleporter Messenger for local testing of CrossChainVault.
 *         Stores sent messages and allows manual delivery to receiver contracts.
 */
contract MockTeleporterMessenger is ITeleporterMessenger {
    uint256 public messageCount;

    struct SentMessage {
        bytes32 destinationBlockchainID;
        address destinationAddress;
        bytes message;
        bytes32 messageId;
        address sender;
        uint256 requiredGasLimit;
    }

    SentMessage[] public sentMessages;

    // Track supported blockchains
    mapping(bytes32 => bool) public supportedBlockchains;

    constructor() {
        // Support common test blockchain IDs
        supportedBlockchains[keccak256("fuji")] = true;
        supportedBlockchains[keccak256("sepolia")] = true;
        supportedBlockchains[keccak256("c-chain")] = true;
    }

    function sendCrossChainMessage(
        TeleporterMessageInput calldata messageInput
    ) external override returns (bytes32 messageID) {
        messageCount++;
        messageID = keccak256(abi.encode(messageCount, messageInput.destinationBlockchainID, msg.sender));

        // Store the sent message for inspection
        sentMessages.push(SentMessage({
            destinationBlockchainID: messageInput.destinationBlockchainID,
            destinationAddress: messageInput.destinationAddress,
            message: messageInput.message,
            messageId: messageID,
            sender: msg.sender,
            requiredGasLimit: messageInput.requiredGasLimit
        }));

        // Collect fee if specified
        if (messageInput.feeInfo.feeTokenAddress != address(0) && messageInput.feeInfo.amount > 0) {
            // In production, Teleporter handles fee collection
            // For testing, we skip actual token transfers
        }

        return messageID;
    }

    function getNextMessageID(
        bytes32 destinationBlockchainID
    ) external view override returns (bytes32) {
        return keccak256(abi.encode(messageCount + 1, destinationBlockchainID, msg.sender));
    }

    /// @notice Simulate delivering a Teleporter message to a receiver contract
    function deliverMessage(
        address receiverContract,
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes memory message
    ) external {
        messageCount++;

        ITeleporterReceiver(receiverContract).receiveTeleporterMessage(
            sourceBlockchainID,
            originSenderAddress,
            message
        );
    }

    /// @notice Get the count of sent messages (for test assertions)
    function getSentMessagesCount() external view returns (uint256) {
        return sentMessages.length;
    }

    /// @notice Get a sent message's data by index
    function getSentMessageData(uint256 index) external view returns (bytes memory) {
        return sentMessages[index].message;
    }

    /// @notice Get a sent message's destination by index
    function getSentMessageDestination(uint256 index) external view returns (bytes32, address) {
        SentMessage memory m = sentMessages[index];
        return (m.destinationBlockchainID, m.destinationAddress);
    }
}
