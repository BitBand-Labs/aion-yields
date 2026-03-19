// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title WithdrawalQueue
 * @author ChainNomads (AION Finance)
 * @notice Defines the priority order for withdrawing capital from strategies.
 *
 * @dev When a vault withdrawal requires pulling funds from strategies
 *      (because idle reserve is insufficient), the vault iterates through
 *      strategies in the order defined by this queue.
 *
 *      The AI/allocator can update the queue order to optimize for:
 *      - Lowest slippage strategies first
 *      - Most liquid strategies first
 *      - Lowest-performing strategies first (preserve high-yield positions)
 */
contract WithdrawalQueue is Ownable {
    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Vault => ordered list of strategies for withdrawal priority
    mapping(address => address[]) internal _queues;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event QueueUpdated(address indexed vault, address[] newQueue);
    event StrategyAddedToQueue(address indexed vault, address indexed strategy);
    event StrategyRemovedFromQueue(address indexed vault, address indexed strategy);

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ============================================================
    //              QUEUE MANAGEMENT
    // ============================================================

    /**
     * @notice Set the full withdrawal queue for a vault.
     * @param vault The vault address
     * @param queue Ordered array of strategy addresses (first = withdrawn from first)
     */
    function setQueue(address vault, address[] calldata queue) external onlyOwner {
        _queues[vault] = queue;
        emit QueueUpdated(vault, queue);
    }

    /**
     * @notice Add a strategy to the end of a vault's withdrawal queue.
     */
    function addToQueue(address vault, address strategy) external onlyOwner {
        _queues[vault].push(strategy);
        emit StrategyAddedToQueue(vault, strategy);
    }

    /**
     * @notice Remove a strategy from a vault's withdrawal queue.
     */
    function removeFromQueue(address vault, address strategy) external onlyOwner {
        address[] storage queue = _queues[vault];
        uint256 len = queue.length;

        for (uint256 i = 0; i < len; i++) {
            if (queue[i] == strategy) {
                queue[i] = queue[len - 1];
                queue.pop();
                emit StrategyRemovedFromQueue(vault, strategy);
                return;
            }
        }
        revert("Strategy not in queue");
    }

    /**
     * @notice Swap positions of two strategies in the queue.
     * @param vault The vault address
     * @param indexA First strategy index
     * @param indexB Second strategy index
     */
    function swapPositions(address vault, uint256 indexA, uint256 indexB) external onlyOwner {
        address[] storage queue = _queues[vault];
        require(indexA < queue.length && indexB < queue.length, "Invalid index");

        address temp = queue[indexA];
        queue[indexA] = queue[indexB];
        queue[indexB] = temp;

        emit QueueUpdated(vault, queue);
    }

    // ============================================================
    //                   VIEW FUNCTIONS
    // ============================================================

    function getQueue(address vault) external view returns (address[] memory) {
        return _queues[vault];
    }

    function getQueueLength(address vault) external view returns (uint256) {
        return _queues[vault].length;
    }

    function getStrategyAt(address vault, uint256 index) external view returns (address) {
        return _queues[vault][index];
    }
}
