import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("AIYieldEngine", function () {
    async function deployAIEngineFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, caller1, caller2, vault1, vault2] = await ethers.getSigners();

        const AIYieldEngine = await ethers.getContractFactory("AIYieldEngine");
        const aiEngine = await AIYieldEngine.deploy(owner.address, vault1.address);

        // Authorize caller1
        await aiEngine.setAuthorizedCaller(caller1.address, true);

        return { aiEngine, owner, caller1, caller2, vault1, vault2, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct owner and vault", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, owner, vault1 } = await networkHelpers.loadFixture(deployAIEngineFixture);

            expect(await aiEngine.owner()).to.equal(owner.address);
            expect(await aiEngine.aionVault()).to.equal(vault1.address);
        });

        it("should auto-register initial vault", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, vault1 } = await networkHelpers.loadFixture(deployAIEngineFixture);

            expect(await aiEngine.isRegisteredVault(vault1.address)).to.be.true;
            expect(await aiEngine.getVaultCount()).to.equal(1);
        });
    });

    describe("Multi-Vault Registry", function () {
        it("should add a new vault", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, vault2 } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await aiEngine.addVault(vault2.address);

            expect(await aiEngine.isRegisteredVault(vault2.address)).to.be.true;
            expect(await aiEngine.getVaultCount()).to.equal(2);
        });

        it("should revert adding duplicate vault", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, vault1 } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await expect(aiEngine.addVault(vault1.address)).to.be.revertedWith("Already registered");
        });

        it("should revert adding zero address vault", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, ethers } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await expect(aiEngine.addVault(ethers.ZeroAddress)).to.be.revertedWith("Zero address");
        });

        it("should remove a vault", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, vault1, vault2 } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await aiEngine.addVault(vault2.address);
            await aiEngine.removeVault(vault1.address);

            expect(await aiEngine.isRegisteredVault(vault1.address)).to.be.false;
            expect(await aiEngine.getVaultCount()).to.equal(1);
        });

        it("should revert removing unregistered vault", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, vault2 } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await expect(aiEngine.removeVault(vault2.address)).to.be.revertedWith("Not registered");
        });

        it("should return all vaults", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, vault1, vault2 } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await aiEngine.addVault(vault2.address);
            const allVaults = await aiEngine.getAllVaults();

            expect(allVaults.length).to.equal(2);
            expect(allVaults).to.include(vault1.address);
            expect(allVaults).to.include(vault2.address);
        });

        it("legacy setAionVault should register if new", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, vault2 } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await aiEngine.setAionVault(vault2.address);

            expect(await aiEngine.aionVault()).to.equal(vault2.address);
            expect(await aiEngine.isRegisteredVault(vault2.address)).to.be.true;
            expect(await aiEngine.getVaultCount()).to.equal(2);
        });

        it("only owner can manage vaults", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, caller1, vault2 } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await expect(aiEngine.connect(caller1).addVault(vault2.address)).to.be.reverted;
            await expect(aiEngine.connect(caller1).removeVault(vault2.address)).to.be.reverted;
        });
    });

    describe("Predictions", function () {
        it("should receive prediction from authorized caller", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, caller1, ethers } = await networkHelpers.loadFixture(deployAIEngineFixture);

            const asset = "0x0000000000000000000000000000000000000001";
            const proofHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

            await aiEngine.connect(caller1).receivePrediction(
                asset, 500, 3000, 8500, caller1.address, proofHash
            );

            const prediction = await aiEngine.getLatestPrediction(asset);
            expect(prediction.predictedAPY).to.equal(500);
            expect(prediction.confidence).to.equal(8500);
            expect(prediction.agentId).to.equal(caller1.address);
        });

        it("should revert prediction from unauthorized caller", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, caller2, ethers } = await networkHelpers.loadFixture(deployAIEngineFixture);

            const proofHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
            await expect(
                aiEngine.connect(caller2).receivePrediction(
                    "0x0000000000000000000000000000000000000001",
                    500, 3000, 8500, caller2.address, proofHash
                )
            ).to.be.revertedWith("Not authorized");
        });

        it("should track prediction history", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, caller1, ethers } = await networkHelpers.loadFixture(deployAIEngineFixture);

            const asset = "0x0000000000000000000000000000000000000001";
            const proofHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

            await aiEngine.connect(caller1).receivePrediction(asset, 500, 3000, 8500, caller1.address, proofHash);
            await aiEngine.connect(caller1).receivePrediction(asset, 600, 2500, 9000, caller1.address, proofHash);

            expect(await aiEngine.getPredictionCount(asset)).to.equal(2);
        });
    });

    describe("Allocation Recommendations", function () {
        it("should submit allocation recommendation with vault", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, caller1, vault1, ethers } = await networkHelpers.loadFixture(deployAIEngineFixture);

            const asset = "0x0000000000000000000000000000000000000001";
            const strategies = [
                "0x0000000000000000000000000000000000000002",
                "0x0000000000000000000000000000000000000003"
            ];
            const targetDebts = [ethers.parseUnits("2000000", 6), ethers.parseUnits("1000000", 6)];
            const proofHash = ethers.keccak256(ethers.toUtf8Bytes("allocation"));

            await aiEngine.connect(caller1).submitAllocationRecommendation(
                vault1.address, asset, strategies, targetDebts, 8500, proofHash
            );

            const rec = await aiEngine.aiRecommendedAllocations(asset);
            expect(rec.vault).to.equal(vault1.address);
            expect(rec.confidence).to.equal(8500);
            expect(rec.isApplied).to.be.false;
        });

        it("should revert allocation for unregistered vault", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, caller1, vault2, ethers } = await networkHelpers.loadFixture(deployAIEngineFixture);

            const proofHash = ethers.keccak256(ethers.toUtf8Bytes("allocation"));

            await expect(
                aiEngine.connect(caller1).submitAllocationRecommendation(
                    vault2.address,
                    "0x0000000000000000000000000000000000000001",
                    ["0x0000000000000000000000000000000000000002"],
                    [ethers.parseUnits("1000000", 6)],
                    8500,
                    proofHash
                )
            ).to.be.revertedWith("Vault not registered");
        });

        it("should revert on array length mismatch", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, caller1, vault1, ethers } = await networkHelpers.loadFixture(deployAIEngineFixture);

            const proofHash = ethers.keccak256(ethers.toUtf8Bytes("allocation"));

            await expect(
                aiEngine.connect(caller1).submitAllocationRecommendation(
                    vault1.address,
                    "0x0000000000000000000000000000000000000001",
                    ["0x0000000000000000000000000000000000000002", "0x0000000000000000000000000000000000000003"],
                    [ethers.parseUnits("1000000", 6)], // Only 1 debt for 2 strategies
                    8500,
                    proofHash
                )
            ).to.be.revertedWith("Array length mismatch");
        });
    });

    describe("Admin Controls", function () {
        it("should toggle AI allocation", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await aiEngine.setAIAllocationEnabled(true);
            expect(await aiEngine.aiAllocationEnabled()).to.be.true;

            await aiEngine.setAIAllocationEnabled(false);
            expect(await aiEngine.aiAllocationEnabled()).to.be.false;
        });

        it("should set confidence threshold", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await aiEngine.setMinConfidenceThreshold(8000);
            expect(await aiEngine.minConfidenceThreshold()).to.equal(8000);
        });

        it("should revert threshold above max", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await expect(aiEngine.setMinConfidenceThreshold(10001)).to.be.revertedWith("Invalid threshold");
        });

        it("should set autonomous allocator", async function () {
            const { networkHelpers } = await network.connect();
            const { aiEngine, caller1 } = await networkHelpers.loadFixture(deployAIEngineFixture);

            await aiEngine.setAutonomousAllocator(caller1.address);
            expect(await aiEngine.autonomousAllocator()).to.equal(caller1.address);
        });
    });
});
