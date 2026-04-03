import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("CrossChainVault", function () {
    async function deployCrossChainFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, user, treasury] = await ethers.getSigners();

        const FUJI_BLOCKCHAIN_ID = ethers.keccak256(ethers.toUtf8Bytes("avalanche-fuji"));
        const SEPOLIA_BLOCKCHAIN_ID = ethers.keccak256(ethers.toUtf8Bytes("ethereum-sepolia"));
        const DEPOSIT_AMOUNT = ethers.parseUnits("1000", 6);

        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);

        // Deploy mock Teleporter Messenger
        const MockTeleporter = await ethers.getContractFactory("MockTeleporterMessenger");
        const mockTeleporter = await MockTeleporter.deploy();

        // Deploy AionVault implementation and factory for ERC4626 vault
        const AionVault = await ethers.getContractFactory("AionVault");
        const vaultImpl = await AionVault.deploy();

        const VaultFactory = await ethers.getContractFactory("VaultFactory");
        const factory = await VaultFactory.deploy(
            await vaultImpl.getAddress(),
            treasury.address,
            owner.address
        );

        // Deploy a STABLE vault for USDC
        const limit = ethers.parseUnits("10000000", 6);
        await factory.deployVault(await mockUSDC.getAddress(), 0, limit);
        const vaultAddr = await factory.getVault(await mockUSDC.getAddress(), 0);

        // Get the vault instance (ERC4626)
        const aionVault = AionVault.attach(vaultAddr);

        // Deploy two CrossChainVaults (simulating two chains)
        const CrossChainVault = await ethers.getContractFactory("CrossChainVault");

        const ccVaultA = await CrossChainVault.deploy(
            await mockTeleporter.getAddress(),
            vaultAddr,
            owner.address
        );

        const ccVaultB = await CrossChainVault.deploy(
            await mockTeleporter.getAddress(),
            vaultAddr,
            owner.address
        );

        // Configure ccVaultA: supports Fuji destination, remote vault is ccVaultB
        await ccVaultA.setSupportedChain(FUJI_BLOCKCHAIN_ID, true);
        await ccVaultA.setRemoteVault(FUJI_BLOCKCHAIN_ID, await ccVaultB.getAddress());

        // Configure ccVaultB: supports Sepolia destination, remote vault is ccVaultA
        await ccVaultB.setSupportedChain(SEPOLIA_BLOCKCHAIN_ID, true);
        await ccVaultB.setRemoteVault(SEPOLIA_BLOCKCHAIN_ID, await ccVaultA.getAddress());
        await ccVaultB.setTokenMapping(
            SEPOLIA_BLOCKCHAIN_ID,
            await mockUSDC.getAddress(),
            await mockUSDC.getAddress()
        );

        // Fund user with USDC
        await mockUSDC.mint(user.address, ethers.parseUnits("10000", 6));

        // Fund ccVaultB with USDC for destination deposits
        await mockUSDC.mint(await ccVaultB.getAddress(), ethers.parseUnits("100000", 6));

        return {
            owner, user, mockUSDC, mockTeleporter, aionVault,
            ccVaultA, ccVaultB, DEPOSIT_AMOUNT,
            FUJI_BLOCKCHAIN_ID, SEPOLIA_BLOCKCHAIN_ID, ethers
        };
    }

    describe("Configuration", function () {
        it("should set supported chains correctly", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, FUJI_BLOCKCHAIN_ID, SEPOLIA_BLOCKCHAIN_ID } = await networkHelpers.loadFixture(deployCrossChainFixture);
            expect(await ccVaultA.supportedChains(FUJI_BLOCKCHAIN_ID)).to.be.true;
            expect(await ccVaultA.supportedChains(SEPOLIA_BLOCKCHAIN_ID)).to.be.false;
        });

        it("should set remote vaults correctly", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, ccVaultB, FUJI_BLOCKCHAIN_ID, SEPOLIA_BLOCKCHAIN_ID } = await networkHelpers.loadFixture(deployCrossChainFixture);
            expect(await ccVaultA.remoteVaults(FUJI_BLOCKCHAIN_ID)).to.equal(await ccVaultB.getAddress());
            expect(await ccVaultB.remoteVaults(SEPOLIA_BLOCKCHAIN_ID)).to.equal(await ccVaultA.getAddress());
        });

        it("should set token mappings correctly", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultB, mockUSDC, SEPOLIA_BLOCKCHAIN_ID } = await networkHelpers.loadFixture(deployCrossChainFixture);
            expect(
                await ccVaultB.tokenMappings(SEPOLIA_BLOCKCHAIN_ID, await mockUSDC.getAddress())
            ).to.equal(await mockUSDC.getAddress());
        });

        it("should only allow owner to configure", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, user, SEPOLIA_BLOCKCHAIN_ID } = await networkHelpers.loadFixture(deployCrossChainFixture);
            await expect(
                ccVaultA.connect(user).setSupportedChain(SEPOLIA_BLOCKCHAIN_ID, true)
            ).to.be.reverted;
        });
    });

    describe("depositCrossChain (Source Chain)", function () {
        it("should lock tokens and send Teleporter message", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, ccVaultB, mockUSDC, user, DEPOSIT_AMOUNT, FUJI_BLOCKCHAIN_ID } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            await mockUSDC.connect(user).approve(await ccVaultA.getAddress(), DEPOSIT_AMOUNT);
            const balBefore = await mockUSDC.balanceOf(user.address);

            await ccVaultA.connect(user).depositCrossChain(
                FUJI_BLOCKCHAIN_ID,
                await ccVaultB.getAddress(),
                await mockUSDC.getAddress(),
                DEPOSIT_AMOUNT
            );

            const balAfter = await mockUSDC.balanceOf(user.address);
            expect(balBefore - balAfter).to.equal(DEPOSIT_AMOUNT);
            expect(await ccVaultA.lockedBalance(await mockUSDC.getAddress())).to.equal(DEPOSIT_AMOUNT);
        });

        it("should revert if chain not supported", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, ccVaultB, mockUSDC, user, DEPOSIT_AMOUNT, SEPOLIA_BLOCKCHAIN_ID } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            await mockUSDC.connect(user).approve(await ccVaultA.getAddress(), DEPOSIT_AMOUNT);

            await expect(
                ccVaultA.connect(user).depositCrossChain(
                    SEPOLIA_BLOCKCHAIN_ID,
                    await ccVaultB.getAddress(),
                    await mockUSDC.getAddress(),
                    DEPOSIT_AMOUNT
                )
            ).to.be.revertedWith("Chain not supported");
        });
    });

    describe("receiveTeleporterMessage (Destination Chain)", function () {
        it("should revert if sender is not authorized remote vault", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultB, mockUSDC, mockTeleporter, user, ethers, SEPOLIA_BLOCKCHAIN_ID } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            const innerPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [user.address, await mockUSDC.getAddress(), ethers.parseUnits("1000", 6)]
            );
            const payload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [1, innerPayload]
            );

            await expect(
                mockTeleporter.deliverMessage(
                    await ccVaultB.getAddress(),
                    SEPOLIA_BLOCKCHAIN_ID,
                    user.address, // wrong sender
                    payload
                )
            ).to.be.revertedWith("Invalid remote sender");
        });

        it("should revert if token mapping not set", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, ccVaultB, mockTeleporter, user, ethers, SEPOLIA_BLOCKCHAIN_ID } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            const fakeToken = "0x0000000000000000000000000000000000000001";
            const innerPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [user.address, fakeToken, ethers.parseUnits("1000", 6)]
            );
            const payload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [1, innerPayload]
            );

            await expect(
                mockTeleporter.deliverMessage(
                    await ccVaultB.getAddress(),
                    SEPOLIA_BLOCKCHAIN_ID,
                    await ccVaultA.getAddress(),
                    payload
                )
            ).to.be.revertedWith("Token mapping not set");
        });
    });

    describe("Chain Registry", function () {
        it("should register a chain", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, user, ethers } = await networkHelpers.loadFixture(deployCrossChainFixture);

            const newChainId = ethers.keccak256(ethers.toUtf8Bytes("polygon"));
            await ccVaultA.registerChain(newChainId, "Polygon", user.address);

            expect(await ccVaultA.supportedChains(newChainId)).to.be.true;
            expect(await ccVaultA.remoteVaults(newChainId)).to.equal(user.address);
            expect(await ccVaultA.getRegisteredChainsCount()).to.equal(1n);
        });

        it("should deactivate a chain", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, user, ethers } = await networkHelpers.loadFixture(deployCrossChainFixture);

            const newChainId = ethers.keccak256(ethers.toUtf8Bytes("polygon"));
            await ccVaultA.registerChain(newChainId, "Polygon", user.address);
            await ccVaultA.deactivateChain(newChainId);

            expect(await ccVaultA.supportedChains(newChainId)).to.be.false;
        });

        it("should revert registering duplicate chain", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, user, ethers } = await networkHelpers.loadFixture(deployCrossChainFixture);

            const newChainId = ethers.keccak256(ethers.toUtf8Bytes("polygon"));
            await ccVaultA.registerChain(newChainId, "Polygon", user.address);

            await expect(
                ccVaultA.registerChain(newChainId, "Polygon2", user.address)
            ).to.be.revertedWith("Chain already registered");
        });
    });

    describe("Admin Functions", function () {
        it("should allow funding the vault", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, mockUSDC, owner, ethers } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            const amount = ethers.parseUnits("5000", 6);
            await mockUSDC.mint(owner.address, amount);
            await mockUSDC.approve(await ccVaultA.getAddress(), amount);
            await ccVaultA.fundVault(await mockUSDC.getAddress(), amount);

            const bal = await mockUSDC.balanceOf(await ccVaultA.getAddress());
            expect(bal).to.equal(amount);
        });

        it("should allow owner to withdraw tokens", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, mockUSDC, owner, ethers } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            const amount = ethers.parseUnits("5000", 6);
            await mockUSDC.mint(await ccVaultA.getAddress(), amount);

            const balBefore = await mockUSDC.balanceOf(owner.address);
            await ccVaultA.withdrawToken(await mockUSDC.getAddress(), amount);
            const balAfter = await mockUSDC.balanceOf(owner.address);

            expect(balAfter - balBefore).to.equal(amount);
        });

        it("should not allow non-owner to withdraw", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, mockUSDC, user } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            await expect(
                ccVaultA.connect(user).withdrawToken(await mockUSDC.getAddress(), 1)
            ).to.be.reverted;
        });

        it("should set AionVault", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA, user } = await networkHelpers.loadFixture(deployCrossChainFixture);

            await ccVaultA.setAionVault(user.address);
            expect(await ccVaultA.aionVault()).to.equal(user.address);
        });

        it("should set message gas limit", async function () {
            const { networkHelpers } = await network.connect();
            const { ccVaultA } = await networkHelpers.loadFixture(deployCrossChainFixture);

            await ccVaultA.setMessageGasLimit(500000);
            expect(await ccVaultA.messageGasLimit()).to.equal(500000n);
        });
    });
});
