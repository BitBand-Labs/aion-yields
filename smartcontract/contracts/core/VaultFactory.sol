// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

interface IAionVaultInit {
    enum VaultType { STABLE, VOLATILE }

    function initialize(
        IERC20Upgradeable asset_,
        string memory name_,
        string memory symbol_,
        address feeRecipient_,
        uint256 depositLimit_,
        VaultType vaultType_
    ) external;

    function transferOwnership(address newOwner) external;
}

/**
 * @title VaultFactory
 * @author ChainNomads (AION Finance)
 * @notice Deploys new AionVault instances as minimal proxies (ERC1167 clones).
 *
 * @dev Each vault is a cheap clone pointing to a single AionVault implementation.
 *      The factory handles deployment, initialization, and registry so the
 *      frontend and AI engine can discover all active vaults.
 *
 *      Usage:
 *        factory.deployVault(USDC, STABLE, 1_000_000e6)  → aionUSDC vault
 *        factory.deployVault(WAVAX, VOLATILE, 500e18)     → aionAVAX vault
 */
contract VaultFactory is Ownable {
    using Clones for address;

    // ============================================================
    //                        STORAGE
    // ============================================================

    /// @dev AionVault implementation contract that clones delegate to
    address public implementation;

    /// @dev Default fee recipient for new vaults
    address public defaultFeeRecipient;

    /// @dev All deployed vaults
    address[] public allVaults;

    /// @dev Asset => VaultType => vault address (one vault per asset per type)
    mapping(address => mapping(IAionVaultInit.VaultType => address)) public getVault;

    /// @dev Quick lookup: is this address a vault deployed by this factory?
    mapping(address => bool) public isVault;

    // ============================================================
    //                        EVENTS
    // ============================================================

    event VaultDeployed(
        address indexed vault,
        address indexed asset,
        IAionVaultInit.VaultType vaultType,
        string name,
        string symbol
    );
    event ImplementationUpdated(address indexed oldImpl, address indexed newImpl);
    event DefaultFeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);

    // ============================================================
    //                        ERRORS
    // ============================================================

    error ZeroAddress();
    error VaultAlreadyExists();

    // ============================================================
    //                      CONSTRUCTOR
    // ============================================================

    /**
     * @param implementation_ The deployed AionVault implementation contract
     * @param defaultFeeRecipient_ Default fee recipient for new vaults
     * @param initialOwner The factory owner
     */
    constructor(
        address implementation_,
        address defaultFeeRecipient_,
        address initialOwner
    ) Ownable(initialOwner) {
        if (implementation_ == address(0) || defaultFeeRecipient_ == address(0))
            revert ZeroAddress();

        implementation = implementation_;
        defaultFeeRecipient = defaultFeeRecipient_;
    }

    // ============================================================
    //                    VAULT DEPLOYMENT
    // ============================================================

    /**
     * @notice Deploy a new AionVault clone for a given asset and vault type.
     * @param asset The underlying ERC20 token (USDC, WAVAX, etc.)
     * @param vaultType STABLE (0) or VOLATILE (1)
     * @param depositLimit Maximum total assets the vault will accept
     * @return vault The address of the newly deployed vault
     */
    function deployVault(
        address asset,
        IAionVaultInit.VaultType vaultType,
        uint256 depositLimit
    ) external onlyOwner returns (address vault) {
        if (asset == address(0)) revert ZeroAddress();
        if (getVault[asset][vaultType] != address(0)) revert VaultAlreadyExists();

        // Build name and symbol from asset metadata + vault type
        string memory assetSymbol = ERC20Upgradeable(asset).symbol();
        string memory typeName = vaultType == IAionVaultInit.VaultType.STABLE
            ? "Stable"
            : "Volatile";

        string memory name = string.concat("AION ", typeName, " Vault - ", assetSymbol);
        string memory symbol = string.concat("aion", assetSymbol);

        // Deploy minimal proxy clone
        vault = implementation.clone();

        // Initialize the clone
        IAionVaultInit(vault).initialize(
            IERC20Upgradeable(asset),
            name,
            symbol,
            defaultFeeRecipient,
            depositLimit,
            vaultType
        );

        // Transfer vault ownership to factory owner
        IAionVaultInit(vault).transferOwnership(owner());

        // Register
        getVault[asset][vaultType] = vault;
        isVault[vault] = true;
        allVaults.push(vault);

        emit VaultDeployed(vault, asset, vaultType, name, symbol);
    }

    // ============================================================
    //                    VIEW FUNCTIONS
    // ============================================================

    /**
     * @notice Get total number of deployed vaults.
     */
    function totalVaults() external view returns (uint256) {
        return allVaults.length;
    }

    /**
     * @notice Get all deployed vault addresses.
     */
    function getAllVaults() external view returns (address[] memory) {
        return allVaults;
    }

    // ============================================================
    //                    ADMIN FUNCTIONS
    // ============================================================

    /**
     * @notice Update the AionVault implementation for future deployments.
     * @dev Does NOT affect already-deployed vaults (they keep their implementation).
     */
    function setImplementation(address newImpl) external onlyOwner {
        if (newImpl == address(0)) revert ZeroAddress();
        address old = implementation;
        implementation = newImpl;
        emit ImplementationUpdated(old, newImpl);
    }

    /**
     * @notice Update the default fee recipient for future deployments.
     */
    function setDefaultFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert ZeroAddress();
        address old = defaultFeeRecipient;
        defaultFeeRecipient = newRecipient;
        emit DefaultFeeRecipientUpdated(old, newRecipient);
    }
}
