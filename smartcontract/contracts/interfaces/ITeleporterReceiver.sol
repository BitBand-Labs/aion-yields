// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ITeleporterReceiver
 * @notice Interface for contracts that receive Teleporter messages.
 * @dev Based on ava-labs/icm-contracts ITeleporterReceiver.sol
 */
interface ITeleporterReceiver {
    /**
     * @notice Called by TeleporterMessenger when a cross-chain message is delivered.
     * @param sourceBlockchainID The blockchain ID of the source chain.
     * @param originSenderAddress The address of the sender on the source chain.
     * @param message The message payload.
     */
    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes calldata message
    ) external;
}
