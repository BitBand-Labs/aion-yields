// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TeleporterFeeInfo
 * @notice Fee configuration for Teleporter messages.
 */
struct TeleporterFeeInfo {
    address feeTokenAddress; // ERC20 token for fee (address(0) = no fee)
    uint256 amount;
}

/**
 * @title TeleporterMessageInput
 * @notice Input struct for sending a cross-chain message via Teleporter.
 */
struct TeleporterMessageInput {
    bytes32 destinationBlockchainID;
    address destinationAddress;
    TeleporterFeeInfo feeInfo;
    uint256 requiredGasLimit;
    address[] allowedRelayerAddresses;
    bytes message;
}

/**
 * @title ITeleporterMessenger
 * @notice Minimal interface for Avalanche Teleporter Messenger.
 * @dev Based on ava-labs/icm-contracts ITeleporterMessenger.sol
 */
interface ITeleporterMessenger {
    /**
     * @notice Send a cross-chain message via Avalanche Warp Messaging.
     * @param messageInput The message input struct.
     * @return messageID Unique identifier for the sent message.
     */
    function sendCrossChainMessage(
        TeleporterMessageInput calldata messageInput
    ) external returns (bytes32 messageID);

    /**
     * @notice Gets the next message ID for a given destination blockchain.
     */
    function getNextMessageID(
        bytes32 destinationBlockchainID
    ) external view returns (bytes32);
}
