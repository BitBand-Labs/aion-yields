// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ITeleporterMessenger, TeleporterMessageInput, TeleporterFeeInfo} from "../interfaces/ITeleporterMessenger.sol";
import {ITeleporterReceiver} from "../interfaces/ITeleporterReceiver.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC4626} from "@openzeppelin/contracts/interfaces/IERC4626.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title CrossChainVault
 * @author ChainNomads (AION Finance)
 * @notice Avalanche Teleporter-enabled vault implementing Warp Messaging for cross-chain
 *         deposits, withdrawals, and multi-chain state synchronization.
 * @dev Uses Avalanche Interchain Messaging (ICM) via Teleporter with typed messages:
 *
 *      Message Types:
 *      - DEPOSIT:           Lock tokens on source, deposit into AionVault on destination
 *      - WITHDRAW:          Request withdrawal on destination, unlock on source
 *      - YIELD_SYNC:        Broadcast vault yield/TVL data to remote chains
 *      - LIQUIDITY_REPORT:  Announce available liquidity for AI-driven cross-chain rebalancing
 */
contract CrossChainVault is ITeleporterReceiver, Ownable {
    using SafeERC20 for IERC20;

    // ============================================================
    //                    MESSAGE TYPES
    // ============================================================

    uint8 public constant MSG_DEPOSIT = 1;
    uint8 public constant MSG_WITHDRAW = 2;
    uint8 public constant MSG_YIELD_SYNC = 3;
    uint8 public constant MSG_LIQUIDITY_REPORT = 4;

    // ============================================================
    //                      STORAGE
    // ============================================================

    /// @dev Avalanche Teleporter Messenger contract
    ITeleporterMessenger public teleporterMessenger;

    /// @dev The AionVault on THIS chain (ERC4626)
    IERC4626 public aionVault;

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

    // --- Multi-Chain State ---

    struct YieldData {
        uint256 totalAssets;       // Vault total assets
        uint256 totalSupply;       // Vault share supply
        uint256 pricePerShare;     // Current share price
        uint256 totalIdle;         // Idle reserve
        uint256 totalDebt;         // Deployed to strategies
        uint256 lastSyncTime;
    }
    mapping(bytes32 => YieldData) public remoteYieldData;

    struct LiquidityData {
        uint256 availableLiquidity;
        uint256 timestamp;
    }
    mapping(bytes32 => LiquidityData) public remoteLiquidity;

    /// @dev Chain registry
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

    event YieldSyncSent(
        bytes32 indexed messageId,
        bytes32 indexed destinationBlockchainID,
        uint256 totalAssets,
        uint256 pricePerShare
    );

    event YieldSyncReceived(
        bytes32 indexed sourceBlockchainID,
        uint256 totalAssets,
        uint256 pricePerShare
    );

    event LiquidityReportSent(
        bytes32 indexed messageId,
        bytes32 indexed destinationBlockchainID,
        uint256 availableLiquidity
    );

    event LiquidityReportReceived(
        bytes32 indexed sourceBlockchainID,
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
        address aionVault_,
        address initialOwner
    ) Ownable(initialOwner) {
        teleporterMessenger = ITeleporterMessenger(teleporter_);
        aionVault = IERC4626(aionVault_);
    }

    // ============================================================
    //              CROSS-CHAIN SENDING (Source Chain)
    // ============================================================

    function depositCrossChain(
        bytes32 destinationBlockchainID,
        address receiver,
        address token,
        uint256 amount
    ) external returns (bytes32 messageId) {
        require(supportedChains[destinationBlockchainID], "Chain not supported");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        lockedBalance[token] += amount;

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

    function withdrawCrossChain(
        bytes32 destinationBlockchainID,
        address receiver,
        address token,
        uint256 amount
    ) external returns (bytes32 messageId) {
        require(supportedChains[destinationBlockchainID], "Chain not supported");

        uint256 nonce = withdrawalNonce++;

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
     * @notice Broadcast current vault yield data to a remote chain.
     */
    function syncYieldData(
        bytes32 destinationBlockchainID
    ) external returns (bytes32 messageId) {
        require(supportedChains[destinationBlockchainID], "Chain not supported");

        uint256 vaultTotalAssets = aionVault.totalAssets();
        uint256 vaultTotalSupply = aionVault.totalSupply();
        uint256 pricePerShare = vaultTotalSupply > 0
            ? aionVault.convertToAssets(1e18)
            : 1e18;

        bytes memory yieldPayload = abi.encode(
            vaultTotalAssets,
            vaultTotalSupply,
            pricePerShare
        );

        bytes memory payload = abi.encode(MSG_YIELD_SYNC, yieldPayload);

        address receiver = remoteVaults[destinationBlockchainID];
        require(receiver != address(0), "Remote vault not set");

        messageId = _sendTeleporterMessage(destinationBlockchainID, receiver, payload);

        emit YieldSyncSent(
            messageId,
            destinationBlockchainID,
            vaultTotalAssets,
            pricePerShare
        );
    }

    /**
     * @notice Broadcast available idle liquidity to a remote chain.
     */
    function reportLiquidity(
        bytes32 destinationBlockchainID
    ) external returns (bytes32 messageId) {
        require(supportedChains[destinationBlockchainID], "Chain not supported");

        // Available liquidity = what can be deposited (maxDeposit)
        uint256 available = aionVault.maxDeposit(address(this));

        bytes memory payload = abi.encode(
            MSG_LIQUIDITY_REPORT,
            abi.encode(available)
        );

        address receiver = remoteVaults[destinationBlockchainID];
        require(receiver != address(0), "Remote vault not set");

        messageId = _sendTeleporterMessage(destinationBlockchainID, receiver, payload);

        emit LiquidityReportSent(
            messageId,
            destinationBlockchainID,
            available
        );
    }

    /**
     * @notice Broadcast yield data to ALL registered remote chains.
     */
    function syncYieldDataToAll() external {
        for (uint256 i = 0; i < registeredChains.length; i++) {
            bytes32 chainId = registeredChains[i];
            if (chainRegistry[chainId].isActive && supportedChains[chainId]) {
                try this.syncYieldData(chainId) {} catch {}
            }
        }
    }

    // ============================================================
    //          CROSS-CHAIN RECEIVING (Destination Chain)
    // ============================================================

    function receiveTeleporterMessage(
        bytes32 sourceBlockchainID,
        address originSenderAddress,
        bytes calldata message
    ) external override {
        require(msg.sender == address(teleporterMessenger), "Unauthorized: not Teleporter");
        require(remoteVaults[sourceBlockchainID] == originSenderAddress, "Invalid remote sender");

        (uint8 msgType, bytes memory msgData) = abi.decode(
            message,
            (uint8, bytes)
        );

        if (msgType == MSG_DEPOSIT) {
            _handleDeposit(sourceBlockchainID, msgData);
        } else if (msgType == MSG_WITHDRAW) {
            _handleWithdraw(sourceBlockchainID, msgData);
        } else if (msgType == MSG_YIELD_SYNC) {
            _handleYieldSync(sourceBlockchainID, msgData);
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

        // Deposit into the AionVault on behalf of the user
        IERC20(localToken).approve(address(aionVault), amount);
        aionVault.deposit(amount, user);

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

        address localToken = tokenMappings[sourceBlockchainID][token];
        if (localToken == address(0)) {
            localToken = token;
        }

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

    function _handleYieldSync(
        bytes32 sourceBlockchainID,
        bytes memory data
    ) internal {
        (
            uint256 totalAssets_,
            uint256 totalSupply_,
            uint256 pricePerShare
        ) = abi.decode(data, (uint256, uint256, uint256));

        remoteYieldData[sourceBlockchainID] = YieldData({
            totalAssets: totalAssets_,
            totalSupply: totalSupply_,
            pricePerShare: pricePerShare,
            totalIdle: 0,
            totalDebt: 0,
            lastSyncTime: block.timestamp
        });

        emit YieldSyncReceived(sourceBlockchainID, totalAssets_, pricePerShare);
    }

    function _handleLiquidityReport(
        bytes32 sourceBlockchainID,
        bytes memory data
    ) internal {
        (uint256 availableLiquidity) = abi.decode(data, (uint256));

        remoteLiquidity[sourceBlockchainID] = LiquidityData({
            availableLiquidity: availableLiquidity,
            timestamp: block.timestamp
        });

        emit LiquidityReportReceived(sourceBlockchainID, availableLiquidity);
    }

    // ============================================================
    //          MULTI-CHAIN AWARENESS: VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Get the best yield (price per share growth) across all known chains.
     */
    function getBestYieldChain()
        external
        view
        returns (uint256 bestPricePerShare, bytes32 bestChain)
    {
        // Check local vault
        uint256 localSupply = aionVault.totalSupply();
        bestPricePerShare = localSupply > 0 ? aionVault.convertToAssets(1e18) : 1e18;
        bestChain = bytes32(0);

        for (uint256 i = 0; i < registeredChains.length; i++) {
            bytes32 chainId = registeredChains[i];
            YieldData memory remote = remoteYieldData[chainId];
            if (remote.lastSyncTime > 0 && remote.pricePerShare > bestPricePerShare) {
                bestPricePerShare = remote.pricePerShare;
                bestChain = chainId;
            }
        }
    }

    /**
     * @notice Get aggregated TVL across all known chains.
     */
    function getAggregatedTVL()
        external
        view
        returns (uint256 totalTVL, uint256 chainCount)
    {
        totalTVL = aionVault.totalAssets();
        chainCount = 1;

        for (uint256 i = 0; i < registeredChains.length; i++) {
            bytes32 chainId = registeredChains[i];
            YieldData memory remote = remoteYieldData[chainId];
            if (remote.lastSyncTime > 0) {
                totalTVL += remote.totalAssets;
                chainCount++;
            }
        }
    }

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
                    feeTokenAddress: address(0),
                    amount: 0
                }),
                requiredGasLimit: messageGasLimit,
                allowedRelayerAddresses: new address[](0),
                message: payload
            })
        );
    }

    // ============================================================
    //                  ADMIN FUNCTIONS
    // ============================================================

    function setSupportedChain(bytes32 blockchainID, bool supported) external onlyOwner {
        supportedChains[blockchainID] = supported;
    }

    function setRemoteVault(bytes32 blockchainID, address vault) external onlyOwner {
        remoteVaults[blockchainID] = vault;
    }

    function setTokenMapping(
        bytes32 sourceBlockchainID,
        address sourceToken,
        address localToken
    ) external onlyOwner {
        tokenMappings[sourceBlockchainID][sourceToken] = localToken;
    }

    function setAionVault(address vault_) external onlyOwner {
        aionVault = IERC4626(vault_);
    }

    function setMessageGasLimit(uint256 gasLimit) external onlyOwner {
        messageGasLimit = gasLimit;
    }

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

        supportedChains[blockchainID] = true;
        remoteVaults[blockchainID] = vaultAddress;

        emit ChainRegistered(blockchainID, chainName, vaultAddress);
    }

    function deactivateChain(bytes32 blockchainID) external onlyOwner {
        chainRegistry[blockchainID].isActive = false;
        supportedChains[blockchainID] = false;
    }

    function fundVault(address token, uint256 amount) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }

    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(msg.sender, amount);
    }
}
