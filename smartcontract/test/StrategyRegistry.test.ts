import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("StrategyRegistry", function () {
    async function deployRegistryFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, user1] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

        const MockStrategy = await ethers.getContractFactory("MockStrategy");
        const strategy1 = await MockStrategy.deploy(owner.address, await usdc.getAddress());
        const strategy2 = await MockStrategy.deploy(owner.address, await usdc.getAddress());

        const StrategyRegistry = await ethers.getContractFactory("StrategyRegistry");
        const registry = await StrategyRegistry.deploy(owner.address);

        return { registry, strategy1, strategy2, usdc, owner, user1, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct owner", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, owner } = await networkHelpers.loadFixture(deployRegistryFixture);
            expect(await registry.owner()).to.equal(owner.address);
        });

        it("should start with zero strategies", async function () {
            const { networkHelpers } = await network.connect();
            const { registry } = await networkHelpers.loadFixture(deployRegistryFixture);
            expect(await registry.getRegisteredCount()).to.equal(0n);
        });
    });

    describe("Strategy Registration", function () {
        it("should register a strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1, usdc } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.registerStrategy(await strategy1.getAddress(), "Aave USDC", 0, 3000);

            const info = await registry.getStrategyInfo(await strategy1.getAddress());
            expect(info.name).to.equal("Aave USDC");
            expect(info.isApproved).to.be.true;
            expect(info.riskScore).to.equal(3000n);
            expect(info.asset).to.equal(await usdc.getAddress());
            expect(await registry.getRegisteredCount()).to.equal(1n);
        });

        it("should revert registering zero address", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await expect(
                registry.registerStrategy(ethers.ZeroAddress, "Test", 0, 3000)
            ).to.be.revertedWith("Invalid strategy");
        });

        it("should revert registering duplicate strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.registerStrategy(await strategy1.getAddress(), "Aave USDC", 0, 3000);

            await expect(
                registry.registerStrategy(await strategy1.getAddress(), "Aave USDC v2", 0, 4000)
            ).to.be.revertedWith("Already registered");
        });

        it("should revert invalid risk score", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await expect(
                registry.registerStrategy(await strategy1.getAddress(), "Test", 0, 10001)
            ).to.be.revertedWith("Invalid risk score");
        });

        it("should only allow owner", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1, user1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await expect(
                registry.connect(user1).registerStrategy(await strategy1.getAddress(), "Test", 0, 3000)
            ).to.be.reverted;
        });
    });

    describe("Strategy Approval", function () {
        it("should revoke strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.registerStrategy(await strategy1.getAddress(), "Aave USDC", 0, 3000);
            await registry.revokeStrategy(await strategy1.getAddress());

            expect(await registry.isApproved(await strategy1.getAddress())).to.be.false;
        });

        it("should re-approve strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.registerStrategy(await strategy1.getAddress(), "Aave USDC", 0, 3000);
            await registry.revokeStrategy(await strategy1.getAddress());
            await registry.approveStrategy(await strategy1.getAddress());

            expect(await registry.isApproved(await strategy1.getAddress())).to.be.true;
        });

        it("should revert revoking unregistered strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await expect(
                registry.revokeStrategy(await strategy1.getAddress())
            ).to.be.revertedWith("Not registered");
        });
    });

    describe("Risk Score", function () {
        it("should update risk score", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.registerStrategy(await strategy1.getAddress(), "Aave USDC", 0, 3000);
            await registry.updateRiskScore(await strategy1.getAddress(), 5000);

            const info = await registry.getStrategyInfo(await strategy1.getAddress());
            expect(info.riskScore).to.equal(5000n);
        });

        it("should revert invalid risk score update", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.registerStrategy(await strategy1.getAddress(), "Aave USDC", 0, 3000);

            await expect(
                registry.updateRiskScore(await strategy1.getAddress(), 10001)
            ).to.be.revertedWith("Invalid risk score");
        });
    });

    describe("View Functions", function () {
        it("should get strategies by category", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1, strategy2 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.registerStrategy(await strategy1.getAddress(), "Aave USDC", 0, 3000); // LENDING
            await registry.registerStrategy(await strategy2.getAddress(), "Curve LP", 1, 4000); // LIQUIDITY_PROVISION

            const lending = await registry.getStrategiesByCategory(0);
            expect(lending.length).to.equal(1);
        });

        it("should get strategies by asset", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1, strategy2, usdc } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.registerStrategy(await strategy1.getAddress(), "Aave USDC", 0, 3000);
            await registry.registerStrategy(await strategy2.getAddress(), "Curve USDC", 1, 4000);

            const usdcStrategies = await registry.getStrategiesByAsset(await usdc.getAddress());
            expect(usdcStrategies.length).to.equal(2);
        });

        it("should get all approved strategies", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, strategy1, strategy2 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.registerStrategy(await strategy1.getAddress(), "Aave USDC", 0, 3000);
            await registry.registerStrategy(await strategy2.getAddress(), "Curve LP", 1, 4000);
            await registry.revokeStrategy(await strategy2.getAddress());

            const approved = await registry.getAllApproved();
            expect(approved.length).to.equal(1);
        });
    });
});
