import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("VaultFactory", function () {
    async function deployFactoryFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, feeRecipient, user1] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);
        const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);

        const AionVault = await ethers.getContractFactory("AionVault");
        const vaultImpl = await AionVault.deploy();

        const VaultFactory = await ethers.getContractFactory("VaultFactory");
        const factory = await VaultFactory.deploy(
            await vaultImpl.getAddress(),
            feeRecipient.address,
            owner.address
        );

        return { factory, vaultImpl, usdc, weth, owner, feeRecipient, user1, ethers, AionVault };
    }

    it("should deploy with correct implementation", async function () {
        const { networkHelpers } = await network.connect();
        const { factory, vaultImpl } = await networkHelpers.loadFixture(deployFactoryFixture);

        expect(await factory.implementation()).to.equal(await vaultImpl.getAddress());
    });

    it("should deploy a STABLE vault", async function () {
        const { networkHelpers } = await network.connect();
        const { factory, usdc, ethers } = await networkHelpers.loadFixture(deployFactoryFixture);

        const limit = ethers.parseUnits("10000000", 6);
        await factory.deployVault(await usdc.getAddress(), 0, limit); // 0 = STABLE

        expect(await factory.totalVaults()).to.equal(1n);
        const vaultAddr = await factory.getVault(await usdc.getAddress(), 0);
        expect(vaultAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("should deploy a VOLATILE vault", async function () {
        const { networkHelpers } = await network.connect();
        const { factory, weth, ethers } = await networkHelpers.loadFixture(deployFactoryFixture);

        const limit = ethers.parseUnits("1000", 18);
        await factory.deployVault(await weth.getAddress(), 1, limit); // 1 = VOLATILE

        expect(await factory.totalVaults()).to.equal(1n);
        const vaultAddr = await factory.getVault(await weth.getAddress(), 1);
        expect(vaultAddr).to.not.equal(ethers.ZeroAddress);
    });

    it("should deploy multiple vaults for different assets", async function () {
        const { networkHelpers } = await network.connect();
        const { factory, usdc, weth, ethers } = await networkHelpers.loadFixture(deployFactoryFixture);

        await factory.deployVault(await usdc.getAddress(), 0, ethers.parseUnits("10000000", 6));
        await factory.deployVault(await weth.getAddress(), 1, ethers.parseUnits("1000", 18));

        expect(await factory.totalVaults()).to.equal(2n);
        const allVaults = await factory.getAllVaults();
        expect(allVaults.length).to.equal(2);
    });

    it("should revert deploying duplicate vault (same asset + type)", async function () {
        const { networkHelpers } = await network.connect();
        const { factory, usdc, ethers } = await networkHelpers.loadFixture(deployFactoryFixture);

        const limit = ethers.parseUnits("10000000", 6);
        await factory.deployVault(await usdc.getAddress(), 0, limit);

        await expect(
            factory.deployVault(await usdc.getAddress(), 0, limit)
        ).to.be.revertedWithCustomError(factory, "VaultAlreadyExists");
    });

    it("should allow same asset with different vault types", async function () {
        const { networkHelpers } = await network.connect();
        const { factory, usdc, ethers } = await networkHelpers.loadFixture(deployFactoryFixture);

        const limit = ethers.parseUnits("10000000", 6);
        await factory.deployVault(await usdc.getAddress(), 0, limit); // STABLE
        await factory.deployVault(await usdc.getAddress(), 1, limit); // VOLATILE

        expect(await factory.totalVaults()).to.equal(2n);
    });

    it("should revert deploying with zero address asset", async function () {
        const { networkHelpers } = await network.connect();
        const { factory, ethers } = await networkHelpers.loadFixture(deployFactoryFixture);

        await expect(
            factory.deployVault(ethers.ZeroAddress, 0, ethers.parseUnits("1000000", 6))
        ).to.be.revertedWithCustomError(factory, "ZeroAddress");
    });

    it("should only allow owner to deploy vaults", async function () {
        const { networkHelpers } = await network.connect();
        const { factory, usdc, user1, ethers } = await networkHelpers.loadFixture(deployFactoryFixture);

        await expect(
            factory.connect(user1).deployVault(await usdc.getAddress(), 0, ethers.parseUnits("1000000", 6))
        ).to.be.reverted;
    });

    it("should track vaults via isVault", async function () {
        const { networkHelpers } = await network.connect();
        const { factory, usdc, ethers } = await networkHelpers.loadFixture(deployFactoryFixture);

        await factory.deployVault(await usdc.getAddress(), 0, ethers.parseUnits("10000000", 6));
        const vaultAddr = await factory.getVault(await usdc.getAddress(), 0);

        expect(await factory.isVault(vaultAddr)).to.be.true;
        expect(await factory.isVault(ethers.ZeroAddress)).to.be.false;
    });

    it("should update implementation", async function () {
        const { networkHelpers } = await network.connect();
        const { factory, owner, AionVault } = await networkHelpers.loadFixture(deployFactoryFixture);

        const newImpl = await AionVault.deploy();
        await factory.connect(owner).setImplementation(await newImpl.getAddress());
        expect(await factory.implementation()).to.equal(await newImpl.getAddress());
    });

    it("should update default fee recipient", async function () {
        const { networkHelpers } = await network.connect();
        const { factory, owner, user1 } = await networkHelpers.loadFixture(deployFactoryFixture);

        await factory.connect(owner).setDefaultFeeRecipient(user1.address);
        expect(await factory.defaultFeeRecipient()).to.equal(user1.address);
    });
});
