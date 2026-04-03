import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("AutonomousAllocator", function () {
    async function deployAllocatorFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, aiEngine, vault1, vault2, strategy1, strategy2] = await ethers.getSigners();

        const AutonomousAllocator = await ethers.getContractFactory("AutonomousAllocator");
        const allocator = await AutonomousAllocator.deploy(owner.address, vault1.address, aiEngine.address);

        return { allocator, owner, aiEngine, vault1, vault2, strategy1, strategy2, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, owner, vault1, aiEngine } = await networkHelpers.loadFixture(deployAllocatorFixture);

            expect(await allocator.owner()).to.equal(owner.address);
            expect(await allocator.aionVault()).to.equal(vault1.address);
            expect(await allocator.aiYieldEngine()).to.equal(aiEngine.address);
        });

        it("should auto-register initial vault", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, vault1 } = await networkHelpers.loadFixture(deployAllocatorFixture);

            expect(await allocator.isRegisteredVault(vault1.address)).to.be.true;
            expect(await allocator.getVaultCount()).to.equal(1);
        });

        it("should set default cooldown to 4 hours", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator } = await networkHelpers.loadFixture(deployAllocatorFixture);

            expect(await allocator.rebalanceCooldown()).to.equal(4 * 3600);
        });

        it("should set default confidence to 75%", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator } = await networkHelpers.loadFixture(deployAllocatorFixture);

            expect(await allocator.minRebalanceConfidence()).to.equal(7500);
        });
    });

    describe("Multi-Vault Registry", function () {
        it("should add a new vault", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, vault2 } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await allocator.addVault(vault2.address);
            expect(await allocator.isRegisteredVault(vault2.address)).to.be.true;
            expect(await allocator.getVaultCount()).to.equal(2);
        });

        it("should revert adding duplicate vault", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, vault1 } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await expect(allocator.addVault(vault1.address)).to.be.revertedWith("Already registered");
        });

        it("should remove a vault", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, vault1, vault2 } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await allocator.addVault(vault2.address);
            await allocator.removeVault(vault1.address);

            expect(await allocator.isRegisteredVault(vault1.address)).to.be.false;
            expect(await allocator.getVaultCount()).to.equal(1);
        });

        it("should revert removing unregistered vault", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, vault2 } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await expect(allocator.removeVault(vault2.address)).to.be.revertedWith("Not registered");
        });

        it("should return all vaults", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, vault1, vault2 } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await allocator.addVault(vault2.address);
            const allVaults = await allocator.getAllVaults();
            expect(allVaults.length).to.equal(2);
        });

        it("legacy setAionVault should auto-register", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, vault2 } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await allocator.setAionVault(vault2.address);
            expect(await allocator.isRegisteredVault(vault2.address)).to.be.true;
        });

        it("only owner can manage vaults", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, aiEngine, vault2 } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await expect(allocator.connect(aiEngine).addVault(vault2.address)).to.be.reverted;
        });
    });

    describe("Strategy Allocation", function () {
        it("should revert allocation for unregistered vault", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, aiEngine, vault2, strategy1, ethers } = await networkHelpers.loadFixture(deployAllocatorFixture);

            const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof"));

            await expect(
                allocator.connect(aiEngine).executeStrategyAllocation(
                    vault2.address,
                    [strategy1.address],
                    [ethers.parseUnits("1000000", 6)],
                    8000,
                    proofHash
                )
            ).to.be.revertedWith("Vault not registered");
        });

        it("should revert allocation from non-AI engine caller", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, vault1, vault2, strategy1, ethers } = await networkHelpers.loadFixture(deployAllocatorFixture);

            const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof"));

            await expect(
                allocator.connect(vault2).executeStrategyAllocation(
                    vault1.address,
                    [strategy1.address],
                    [ethers.parseUnits("1000000", 6)],
                    8000,
                    proofHash
                )
            ).to.be.revertedWith("Only AI engine or owner");
        });

        it("should revert on array length mismatch", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, aiEngine, vault1, strategy1, strategy2, ethers } = await networkHelpers.loadFixture(deployAllocatorFixture);

            const proofHash = ethers.keccak256(ethers.toUtf8Bytes("proof"));

            await expect(
                allocator.connect(aiEngine).executeStrategyAllocation(
                    vault1.address,
                    [strategy1.address, strategy2.address],
                    [ethers.parseUnits("1000000", 6)], // Only 1 debt for 2 strategies
                    8000,
                    proofHash
                )
            ).to.be.revertedWith("Array length mismatch");
        });
    });

    describe("Admin Functions", function () {
        it("should set rebalance cooldown", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await allocator.setRebalanceCooldown(2 * 3600);
            expect(await allocator.rebalanceCooldown()).to.equal(2 * 3600);
        });

        it("should revert cooldown below minimum", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await expect(allocator.setRebalanceCooldown(1800)).to.be.revertedWith("Below minimum"); // 30 min < 1 hour min
        });

        it("should toggle autonomous mode", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await allocator.setAutonomousEnabled(true);
            expect(await allocator.autonomousEnabled()).to.be.true;
        });

        it("should set min rebalance confidence", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await allocator.setMinRebalanceConfidence(8000);
            expect(await allocator.minRebalanceConfidence()).to.equal(8000);
        });

        it("should revert invalid confidence", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await expect(allocator.setMinRebalanceConfidence(10001)).to.be.revertedWith("Invalid confidence");
        });

        it("should set strategy registry", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, strategy1 } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await allocator.setStrategyRegistry(strategy1.address);
            expect(await allocator.strategyRegistry()).to.equal(strategy1.address);
        });

        it("should set risk manager", async function () {
            const { networkHelpers } = await network.connect();
            const { allocator, strategy1 } = await networkHelpers.loadFixture(deployAllocatorFixture);

            await allocator.setRiskManager(strategy1.address);
            expect(await allocator.riskManager()).to.equal(strategy1.address);
        });
    });
});
