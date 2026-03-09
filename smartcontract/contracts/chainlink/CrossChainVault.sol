// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ITeleporterMessenger, TeleporterMessageInput, TeleporterFeeInfo} from "../interfaces/ITeleporterMessenger.sol";
import {ITeleporterReceiver} from "../interfaces/ITeleporterReceiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/ILendingPool.sol";

/**
 * @title CrossChainVault
 * @author ChainNomads (AION Yield)
 * @notice Avalanche Teleporter-enabled vault implementing Warp Messaging for cross-chain
 *         deposits, withdrawals, and multi-chain state synchronization.
 * @dev Uses Avalanche Interchain Messaging (ICM) via Teleporter with typed messages:
 *
 *      Message Types:
 *      - DEPOSIT:           Lock tokens on source, credit on destination LendingPool
 *      - WITHDRAW:          Request withdrawal on destination, unlock on source
 *      - RATE_SYNC:         Broadcast interest rate/utilization data to remote chains
 *      - LIQUIDITY_REPORT:  Announce available liquidity for AI-driven cross-chain rebalancing
 *
 *      Multi-chain awareness:
 *      - Tracks remote chain state (rates, utilization, TVL) via RATE_SYNC messages
 *      - Maintains a chain registry for coordinated multi-chain operations
 *      - Enables AI rebalancer to make informed cross-chain allocation decisions
 *
 *      Avalanche Warp Messaging benefits:
 *      - No LINK token fees — optional relayer incentives via any ERC20
 *      - Sub-second finality via BLS validator signatures
 *      - Native to Avalanche L1s, Subnets, and C-Chain
 */
contract CrossChainVault is ITeleporterReceiver, Ownable {
    using SafeERC20 for IERC20;

    // ============================================================
    //                    MESSAGE TYPES
    // ============================================================

    uint8 public constant MSG_DEPOSIT = 1;
    uint8 public constant MSG_WITHDRAW = 2;
    uint8 public constant MSG_RATE_SYNC = 3;
    uint8 public constant MSG_LIQUIDITY_REPORT = 4;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Avalanche Teleporter Messenger contract
    ITeleporterMessenger public teleporterMessenger;

    /// @dev The lending pool on THIS chain
    ILendingPool public lendingPool;

    /// @dev Mapping of supported destination blockchains (blockchainID => allowed)
    mapping(bytes32 => bool) public supportedChains;

    /// @dev Mapping of authorized cross-chain vault addresses on other chains
    mapping(bytes32 => address) public remoteVaults;

    /// @dev Mapping of token on source chain => equivalent token on this chain
    mapping(bytes32 => mapping(address => address)) public tokenMappings;

    /// @dev Total locked per token (for accounting)
    mapping(address => uint256) public lockedBalance;

    /// @dev Gas limit for cross-chain messages
    uint256 public messageGasLimit = 300_000;

    // ─── Warp Messaging: Multi-Chain State ────────────────────────

    /// @dev Remote chain rate data: blockchainID => asset => RateData
    struct RateData {
        uint256 supplyRate;      // Current supply APY (RAY)
        uint256 borrowRate;      // Current borrow APY (RAY)
        uint256 utilization;     // Current utilization (RAY)
        uint256 totalSupply;     // Total deposited
        uint256 totalBorrow;     // Total borrowed
        uint256 lastSyncTime;    // When this data was last synced
    }
    mapping(bytes32 => mapping(address => RateData)) public remoteRates;

    /// @dev Remote chain liquidity: blockchainID => asset => available liquidity
    struct LiquidityData {
        uint256 availableLiquidity;
        uint256 timestamp;
    }
    mapping(bytes32 => mapping(address => LiquidityData)) public remoteLiquidity;

    /// @dev Chain registry for multi-chain awareness
    struct ChainInfo {
        bytes32 blockchainID;
        string chainName;
        address vaultAddress;
        bool isActive;
        uint256 registeredAt;
    }
    bytes32[] public registeredChains;
    mapping(bytes32 => ChainInfo) public chainRegistry;

    /// @dev Pending cross-chain withdrawal nonces
    uint256 public withdrawalNonce;
    struct PendingWithdrawal {
        address user;
        address token;
        uint256 amount;
        bytes32 sourceChain;
        bool fulfilled;
    }
    mapping(uint256 => PendingWithdrawal) public pendingWithdrawals;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event CrossChainDepositSent(
        bytes32 indexed messageId,
        bytes32 indexed destinationBlockchainID,
        address indexed user,
        address token,
        uint256 amount
    );

    event CrossChainDepositReceived(
        bytes32 indexed sourceBlockchainID,
        address indexed user,
        address token,
        uint256 amount
    );

    event CrossChainWithdrawalRequested(
        bytes32 indexed messageId,
        bytes32 indexed destinationBlockchainID,
        address indexed user,
        address token,
        uint256 amount,
        uint256 nonce
    );

    event CrossChainWithdrawalFulfilled(
        bytes32 indexed sourceBlockchainID,
        address indexed user,
        address token,
        uint256 amount,
        uint256 nonce
    );

    event RateSyncSent(
        bytes32 indexed messageId,
        bytes32 indexed destinationBlockchainID,
        address asset,
        uint256 supplyRate,
        uint256 borrowRate
    );

    event RateSyncReceived(
        bytes32 indexed sourceBlockchainID,
        address indexed asset,
        uint256 supplyRate,
        uint256 borrowRate,
        uint256 utilization
    );

    event LiquidityReportSent(
        bytes32 indexed messageId,
        bytes32 indexed destinationBlockchainID,
        address asset,
        uint256 availableLiquidity
    );

    event LiquidityReportReceived(
        bytes32 indexed sourceBlockchainID,
        address indexed asset,
        uint256 availableLiquidity
    );

    event ChainRegistered(
        bytes32 indexed blockchainID,
        string chainName,
        address vaultAddress
    );

    // ============================================================
    //                    CONSTRUCTOR
    // ============================================================

    constructor(
        address teleporter_,
        address lendingPool_,
        address initialOwner
    ) Ownable(initialOwner) {
        teleporterMessenger = ITeleporterMessenger(teleporter_);
        lendingPool = ILendingPool(lendingPool_);
    }

    // ============================================================
    //              CROSS-CHAIN SENDING (Source Chain)
    // ============================================================

    /**
     * @notice Lock tokens on this chain and send a Teleporter message to credit
     *         the user on the destination chain's LendingPool.
     */
    function depositCrossChain(
        bytes32 destinationBlockchainID,
        address receiver,
        address token,
        uint256 amount
    ) external returns (bytes32 messageId) {
        require(supportedChains[destinationBlockchainID], "Chain not supported");

        // 1. Lock tokens from user into this vault
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        lockedBalance[token] += amount;

        // 2. Prepare typed payload: MSG_DEPOSIT
        bytes memory payload = abi.encode(
            MSG_DEPOSIT,
            abi.encode(msg.sender, token, amount)
        );

        messageId = _sendTeleporterMessage(destinationBlockchainID, receiver, payload);

        emit CrossChainDepositSent(
            messageId,
            destinationBlockchainID,
            msg.sender,
            token,
            amount
        );
    }

    /**
     * @notice Request a cross-chain withdrawal: sends a message to the source chain
     *         to unlock tokens that were previously locked via depositCrossChain.
     * @param destinationBlockchainID The blockchain where tokens are locked.
     * @param receiver The CrossChainVault address on the destination chain.
     * @param token The token address (on THIS chain) to withdraw.
     * @param amount The amount to withdraw.
     */
    function withdrawCrossChain(
        bytes32 destinationBlockchainID,
        address receiver,
        address token,
        uint256 amount
    ) external returns (bytes32 messageId) {
        require(supportedChains[destinationBlockchainID], "Chain not supported");

        uint256 nonce = withdrawalNonce++;

        // Encode: MSG_WITHDRAW + (user, token, amount, nonce)
        bytes memory payload = abi.encode(
            MSG_WITHDRAW,
            abi.encode(msg.sender, token, amount, nonce)
        );

        messageId = _sendTeleporterMessage(destinationBlockchainID, receiver, payload);

        emit CrossChainWithdrawalRequested(
            messageId,
            destinationBlockchainID,
            msg.sender,
            token,
            amount,
            nonce
        );
    }

    // ============================================================
    //         WARP MESSAGING: STATE SYNC (Multi-Chain Awareness)
    // ============================================================

    /**
     * @notice Broadcast current interest rates and utilization for an asset
     *         to a remote chain, enabling multi-chain rate awareness.
     * @param destinationBlockchainID Target blockchain to sync rates to.
     * @param asset The local asset whose rates to broadcast.
     */
    function syncRates(
        bytes32 destinationBlockchainID,
        address asset
    ) external returns (bytes32 messageId) {
        require(supportedChains[destinationBlockchainID], "Chain not supported");

        DataTypes.ReserveData memory reserve = lendingPool.getReserveData(asset);

        uint256 utilization = 0;
        if (reserve.totalSupply > 0) {
            utilization = (reserve.totalBorrow * 1e27) / reserve.totalSupply;
        }

        bytes memory ratePayload = abi.encode(
            asset,
            uint256(reserve.currentLiquidityRate),
            uint256(reserve.currentVariableBorrowRate),
            utilization,
            reserve.totalSupply,
            reserve.totalBorrow
        );

        bytes memory payload = abi.encode(MSG_RATE_SYNC, ratePayload);

        address receiver = remoteVaults[destinationBlockchainID];
        require(receiver != address(0), "Remote vault not set");

        messageId = _sendTeleporterMessage(destinationBlockchainID, receiver, payload);

        emit RateSyncSent(
            messageId,
            destinationBlockchainID,
            asset,
            reserve.currentLiquidityRate,
            reserve.currentVariableBorrowRate
        );
    }

    /**
     * @notice Broadcast available liquidity for an asset to a remote chain.
     *         Used by the AI rebalancer to identify cross-chain rebalancing opportunities.
     * @param destinationBlockchainID Target blockchain.
     * @param asset The local asset to report liquidity for.
     */
    function reportLiquidity(
        bytes32 destinationBlockchainID,
        address asset
    ) external returns (bytes32 messageId) {
        require(supportedChains[destinationBlockchainID], "Chain not supported");

        DataTypes.ReserveData memory reserve = lendingPool.getReserveData(asset);
        uint256 available = reserve.totalSupply - reserve.totalBorrow;

        bytes memory payload = abi.encode(
            MSG_LIQUIDITY_REPORT,
            abi.encode(asset, available)
        );

        address receiver = remoteVaults[destinationBlockchainID];
        require(receiver != address(0), "Remote vault not set");

        messageId = _sendTeleporterMessage(destinationBlockchainID, receiver, payload);

        emit LiquidityReportSent(
            messageId,
            destinationBlockchainID,
            asset,
            available
        );
    }

    /**
     * @notice Broadcast rates to ALL registered remote chains for a given asset.
     *         Enables protocol-wide multi-chain awareness in a single call.
     */
    function syncRatesToAll(address asset) external {
        for (uint256 i = 0; i < registeredChains.length; i++) {
            bytes32 chainId = registeredChains[i];
            if (chainRegistry[chainId].isActive && supportedChains[chainId]) {
                // Use try/catch so one chain failure doesn't block others
                try this.syncRates(chainId, asset) {} catch {}
            }
        }
    }

    // ============================================================
    //          CROSS-CHAIN RECEIVING (Destination Chain)
    // ============================================================

    /**
     * @notice Callback called by Teleporter Messenger when a message is received.
     * @dev Routes to the appropriate handler based on message type.
     * @param sourceBlockchainID The blockchain ID of the source chain.
     * @param originSenderAddress The sender address on the source chain.
     * @param message The message payload.
     */
    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes calldata message
    ) external override {
        // 1. Only the Teleporter Messenger can call this
        require(msg.sender == address(teleporterMessenger), "Unauthorized: not Teleporter");

        // 2. Validate sender is an authorized vault on the source chain
        require(remoteVaults[sourceBlockchainID] == originSenderAddress, "Invalid remote sender");

        // 3. Decode message type
        (uint8 msgType, bytes memory msgData) = abi.decode(
            message,
            (uint8, bytes)
        );

        // 4. Route to handler
        if (msgType == MSG_DEPOSIT) {
            _handleDeposit(sourceBlockchainID, msgData);
        } else if (msgType == MSG_WITHDRAW) {
            _handleWithdraw(sourceBlockchainID, msgData);
        } else if (msgType == MSG_RATE_SYNC) {
            _handleRateSync(sourceBlockchainID, msgData);
        } else if (msgType == MSG_LIQUIDITY_REPORT) {
            _handleLiquidityReport(sourceBlockchainID, msgData);
        } else {
            revert("Unknown message type");
        }
    }

    function _handleDeposit(
        bytes32 sourceBlockchainID,
        bytes memory data
    ) internal {
        (address user, address sourceToken, uint256 amount) = abi.decode(
            data,
            (address, address, uint256)
        );

        address localToken = tokenMappings[sourceBlockchainID][sourceToken];
        require(localToken != address(0), "Token mapping not set");

        IERC20(localToken).approve(address(lendingPool), amount);
        lendingPool.deposit(localToken, amount, user);

        emit CrossChainDepositReceived(
            sourceBlockchainID,
            user,
            localToken,
            amount
        );
    }

    function _handleWithdraw(
        bytes32 sourceBlockchainID,
        bytes memory data
    ) internal {
        (address user, address token, uint256 amount, uint256 nonce) = abi.decode(
            data,
            (address, address, uint256, uint256)
        );

        // Resolve local token
        address localToken = tokenMappings[sourceBlockchainID][token];
        if (localToken == address(0)) {
            localToken = token; // Same-token assumption if no mapping
        }

        // Unlock from locked balance and transfer to user
        require(lockedBalance[localToken] >= amount, "Insufficient locked balance");
        lockedBalance[localToken] -= amount;

        IERC20(localToken).safeTransfer(user, amount);

        pendingWithdrawals[nonce] = PendingWithdrawal({
            user: user,
            token: localToken,
            amount: amount,
            sourceChain: sourceBlockchainID,
            fulfilled: true
        });

        emit CrossChainWithdrawalFulfilled(
            sourceBlockchainID,
            user,
            localToken,
            amount,
            nonce
        );
    }

    function _handleRateSync(
        bytes32 sourceBlockchainID,
        bytes memory data
    ) internal {
        (
            address asset,
            uint256 supplyRate,
            uint256 borrowRate,
            uint256 utilization,
            uint256 totalSupply,
            uint256 totalBorrow
        ) = abi.decode(data, (address, uint256, uint256, uint256, uint256, uint256));

        remoteRates[sourceBlockchainID][asset] = RateData({
            supplyRate: supplyRate,
            borrowRate: borrowRate,
            utilization: utilization,
            totalSupply: totalSupply,
            totalBorrow: totalBorrow,
            lastSyncTime: block.timestamp
        });

        emit RateSyncReceived(sourceBlockchainID, asset, supplyRate, borrowRate, utilization);
    }

    function _handleLiquidityReport(
        bytes32 sourceBlockchainID,
        bytes memory data
    ) internal {
        (address asset, uint256 availableLiquidity) = abi.decode(
            data,
            (address, uint256)
        );

        remoteLiquidity[sourceBlockchainID][asset] = LiquidityData({
            availableLiquidity: availableLiquidity,
            timestamp: block.timestamp
        });

        emit LiquidityReportReceived(sourceBlockchainID, asset, availableLiquidity);
    }

    // ============================================================
    //          MULTI-CHAIN AWARENESS: VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Get the best supply rate across all known chains for an asset.
     * @return bestRate The highest supply rate found.
     * @return bestChain The blockchain ID offering the best rate (bytes32(0) = local).
     */
    function getBestSupplyRate(
        address asset
    ) external view returns (uint256 bestRate, bytes32 bestChain) {
        // Check local rate first
        DataTypes.ReserveData memory localReserve = lendingPool.getReserveData(asset);
        bestRate = localReserve.currentLiquidityRate;
        bestChain = bytes32(0); // 0 = local chain

        // Compare with remote chains
        for (uint256 i = 0; i < registeredChains.length; i++) {
            bytes32 chainId = registeredChains[i];
            RateData memory remote = remoteRates[chainId][asset];
            if (remote.lastSyncTime > 0 && remote.supplyRate > bestRate) {
                bestRate = remote.supplyRate;
                bestChain = chainId;
            }
        }
    }

    /**
     * @notice Get the lowest borrow rate across all known chains for an asset.
     * @return bestRate The lowest borrow rate found.
     * @return bestChain The blockchain ID offering the best rate (bytes32(0) = local).
     */
    function getBestBorrowRate(
        address asset
    ) external view returns (uint256 bestRate, bytes32 bestChain) {
        DataTypes.ReserveData memory localReserve = lendingPool.getReserveData(asset);
        bestRate = localReserve.currentVariableBorrowRate;
        bestChain = bytes32(0);

        for (uint256 i = 0; i < registeredChains.length; i++) {
            bytes32 chainId = registeredChains[i];
            RateData memory remote = remoteRates[chainId][asset];
            if (remote.lastSyncTime > 0 && remote.borrowRate < bestRate) {
                bestRate = remote.borrowRate;
                bestChain = chainId;
            }
        }
    }

    /**
     * @notice Get aggregated TVL across all known chains for an asset.
     * @return totalTVL Sum of totalSupply across all chains.
     * @return chainCount Number of chains reporting data.
     */
    function getAggregatedTVL(
        address asset
    ) external view returns (uint256 totalTVL, uint256 chainCount) {
        // Local TVL
        DataTypes.ReserveData memory localReserve = lendingPool.getReserveData(asset);
        totalTVL = localReserve.totalSupply;
        chainCount = 1;

        // Remote TVLs
        for (uint256 i = 0; i < registeredChains.length; i++) {
            bytes32 chainId = registeredChains[i];
            RateData memory remote = remoteRates[chainId][asset];
            if (remote.lastSyncTime > 0) {
                totalTVL += remote.totalSupply;
                chainCount++;
            }
        }
    }

    /**
     * @notice Get the total available liquidity across all chains.
     */
    function getTotalAvailableLiquidity(
        address asset
    ) external view returns (uint256 total) {
        // Local available
        DataTypes.ReserveData memory localReserve = lendingPool.getReserveData(asset);
        total = localReserve.totalSupply - localReserve.totalBorrow;

        // Remote available
        for (uint256 i = 0; i < registeredChains.length; i++) {
            bytes32 chainId = registeredChains[i];
            LiquidityData memory remote = remoteLiquidity[chainId][asset];
            if (remote.timestamp > 0) {
                total += remote.availableLiquidity;
            }
        }
    }

    /**
     * @notice Get the number of registered remote chains.
     */
    function getRegisteredChainsCount() external view returns (uint256) {
        return registeredChains.length;
    }

    // ============================================================
    //                  INTERNAL HELPERS
    // ============================================================

    function _sendTeleporterMessage(
        bytes32 destinationBlockchainID,
        address receiver,
        bytes memory payload
    ) internal returns (bytes32 messageId) {
        messageId = teleporterMessenger.sendCrossChainMessage(
            TeleporterMessageInput({
                destinationBlockchainID: destinationBlockchainID,
                destinationAddress: receiver,
                feeInfo: TeleporterFeeInfo({
                    feeTokenAddress: address(0), // No fee — relayers incentivized externally
                    amount: 0
                }),
                requiredGasLimit: messageGasLimit,
                allowedRelayerAddresses: new address[](0), // Any relayer can deliver
                message: payload
            })
        );
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setSupportedChain(
        bytes32 blockchainID,
        bool supported
    ) external onlyOwner {
        supportedChains[blockchainID] = supported;
    }

    function setRemoteVault(
        bytes32 blockchainID,
        address vault
    ) external onlyOwner {
        remoteVaults[blockchainID] = vault;
    }

    /// @notice Map a token on a source chain to its equivalent on this chain
    function setTokenMapping(
        bytes32 sourceBlockchainID,
        address sourceToken,
        address localToken
    ) external onlyOwner {
        tokenMappings[sourceBlockchainID][sourceToken] = localToken;
    }

    function setLendingPool(address pool) external onlyOwner {
        lendingPool = ILendingPool(pool);
    }

    function setMessageGasLimit(uint256 gasLimit) external onlyOwner {
        messageGasLimit = gasLimit;
    }

    /**
     * @notice Register a remote chain in the multi-chain registry.
     */
    function registerChain(
        bytes32 blockchainID,
        string calldata chainName,
        address vaultAddress
    ) external onlyOwner {
        require(!chainRegistry[blockchainID].isActive, "Chain already registered");

        chainRegistry[blockchainID] = ChainInfo({
            blockchainID: blockchainID,
            chainName: chainName,
            vaultAddress: vaultAddress,
            isActive: true,
            registeredAt: block.timestamp
        });
        registeredChains.push(blockchainID);

        // Auto-configure
        supportedChains[blockchainID] = true;
        remoteVaults[blockchainID] = vaultAddress;

        emit ChainRegistered(blockchainID, chainName, vaultAddress);
    }

    /**
     * @notice Deactivate a chain from the registry.
     */
    function deactivateChain(bytes32 blockchainID) external onlyOwner {
        chainRegistry[blockchainID].isActive = false;
        supportedChains[blockchainID] = false;
    }

    /// @notice Fund the vault with tokens for cross-chain deposits
    function fundVault(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    /// @notice Allows owner to withdraw stuck tokens
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
    }
}
