import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("CREExecutionHook", function () {
    async function deployCREFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, executor, vault1, vault2, aiEngine, ccVault, allocator] = await ethers.getSigners();

        const CREExecutionHook = await ethers.getContractFactory("CREExecutionHook");
        const creHook = await CREExecutionHook.deploy(
            owner.address,
            vault1.address,
            aiEngine.address,
            ccVault.address,
            allocator.address
        );

        // Authorize executor
        await creHook.setAuthorizedExecutor(executor.address, true);

        return { creHook, owner, executor, vault1, vault2, aiEngine, ccVault, allocator, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault1, aiEngine, ccVault, allocator } = await networkHelpers.loadFixture(deployCREFixture);

            expect(await creHook.aionVault()).to.equal(vault1.address);
            expect(await creHook.aiYieldEngine()).to.equal(aiEngine.address);
            expect(await creHook.crossChainVault()).to.equal(ccVault.address);
            expect(await creHook.autonomousAllocator()).to.equal(allocator.address);
        });

        it("should auto-register initial vault", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault1 } = await networkHelpers.loadFixture(deployCREFixture);

            expect(await creHook.isRegisteredVault(vault1.address)).to.be.true;
            expect(await creHook.getVaultCount()).to.equal(1);
        });
    });

    describe("Multi-Vault Registry", function () {
        it("should add a new vault", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault2 } = await networkHelpers.loadFixture(deployCREFixture);

            await creHook.addVault(vault2.address);
            expect(await creHook.isRegisteredVault(vault2.address)).to.be.true;
            expect(await creHook.getVaultCount()).to.equal(2);
        });

        it("should revert adding duplicate vault", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault1 } = await networkHelpers.loadFixture(deployCREFixture);

            await expect(creHook.addVault(vault1.address)).to.be.revertedWith("Already registered");
        });

        it("should remove a vault", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault1, vault2 } = await networkHelpers.loadFixture(deployCREFixture);

            await creHook.addVault(vault2.address);
            await creHook.removeVault(vault1.address);

            expect(await creHook.isRegisteredVault(vault1.address)).to.be.false;
            expect(await creHook.getVaultCount()).to.equal(1);
        });

        it("should return all vaults", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault1, vault2 } = await networkHelpers.loadFixture(deployCREFixture);

            await creHook.addVault(vault2.address);
            const allVaults = await creHook.getAllVaults();
            expect(allVaults.length).to.equal(2);
            expect(allVaults).to.include(vault1.address);
            expect(allVaults).to.include(vault2.address);
        });

        it("legacy setAionVault should auto-register", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault2 } = await networkHelpers.loadFixture(deployCREFixture);

            await creHook.setAionVault(vault2.address);
            expect(await creHook.isRegisteredVault(vault2.address)).to.be.true;
            expect(await creHook.getVaultCount()).to.equal(2);
        });

        it("only owner can manage vaults", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, executor, vault2 } = await networkHelpers.loadFixture(deployCREFixture);

            await expect(creHook.connect(executor).addVault(vault2.address)).to.be.reverted;
        });
    });

    describe("Workflow Registration", function () {
        it("should register a workflow", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook } = await networkHelpers.loadFixture(deployCREFixture);

            // WorkflowType.YIELD_ALLOCATION = 0
            const tx = await creHook.registerWorkflow(0, 3600, "AI Yield Allocation");
            const receipt = await tx.wait();

            expect(await creHook.getWorkflowCount()).to.equal(1);
        });

        it("should only allow owner to register workflows", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, executor } = await networkHelpers.loadFixture(deployCREFixture);

            await expect(
                creHook.connect(executor).registerWorkflow(0, 3600, "Test")
            ).to.be.reverted;
        });
    });

    describe("Pre-Hook Execution", function () {
        it("should execute pre-hook for yield allocation", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, executor } = await networkHelpers.loadFixture(deployCREFixture);

            const tx = await creHook.registerWorkflow(0, 0, "Yield Allocation"); // 0 min interval for testing
            const receipt = await tx.wait();

            // Get the workflowId from the event
            const event = receipt.logs.find((log: any) => {
                try {
                    return creHook.interface.parseLog({ topics: log.topics, data: log.data })?.name === "WorkflowRegistered";
                } catch { return false; }
            });
            const parsed = creHook.interface.parseLog({ topics: event.topics, data: event.data });
            const workflowId = parsed!.args[0];

            // Execute pre-hook
            const preTx = await creHook.connect(executor).executePreHook(workflowId);
            await preTx.wait();

            expect(await creHook.totalExecutions()).to.equal(1);
        });

        it("should revert pre-hook from unauthorized executor", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault2 } = await networkHelpers.loadFixture(deployCREFixture);

            const tx = await creHook.registerWorkflow(0, 0, "Test");
            const receipt = await tx.wait();
            const event = receipt.logs.find((log: any) => {
                try {
                    return creHook.interface.parseLog({ topics: log.topics, data: log.data })?.name === "WorkflowRegistered";
                } catch { return false; }
            });
            const parsed = creHook.interface.parseLog({ topics: event.topics, data: event.data });
            const workflowId = parsed!.args[0];

            await expect(
                creHook.connect(vault2).executePreHook(workflowId)
            ).to.be.revertedWith("Not authorized executor");
        });

        it("should revert pre-hook for inactive workflow", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, executor } = await networkHelpers.loadFixture(deployCREFixture);

            const tx = await creHook.registerWorkflow(0, 0, "Test");
            const receipt = await tx.wait();
            const event = receipt.logs.find((log: any) => {
                try {
                    return creHook.interface.parseLog({ topics: log.topics, data: log.data })?.name === "WorkflowRegistered";
                } catch { return false; }
            });
            const parsed = creHook.interface.parseLog({ topics: event.topics, data: event.data });
            const workflowId = parsed!.args[0];

            // Deactivate
            await creHook.setWorkflowActive(workflowId, false);

            await expect(
                creHook.connect(executor).executePreHook(workflowId)
            ).to.be.revertedWith("Workflow not active");
        });
    });

    describe("Admin Functions", function () {
        it("should authorize/deauthorize executors", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault2 } = await networkHelpers.loadFixture(deployCREFixture);

            await creHook.setAuthorizedExecutor(vault2.address, true);
            expect(await creHook.authorizedExecutors(vault2.address)).to.be.true;

            await creHook.setAuthorizedExecutor(vault2.address, false);
            expect(await creHook.authorizedExecutors(vault2.address)).to.be.false;
        });

        it("should set AI yield engine", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault2 } = await networkHelpers.loadFixture(deployCREFixture);

            await creHook.setAIYieldEngine(vault2.address);
            expect(await creHook.aiYieldEngine()).to.equal(vault2.address);
        });

        it("should set cross-chain vault", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault2 } = await networkHelpers.loadFixture(deployCREFixture);

            await creHook.setCrossChainVault(vault2.address);
            expect(await creHook.crossChainVault()).to.equal(vault2.address);
        });

        it("should set autonomous allocator", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook, vault2 } = await networkHelpers.loadFixture(deployCREFixture);

            await creHook.setAutonomousAllocator(vault2.address);
            expect(await creHook.autonomousAllocator()).to.equal(vault2.address);
        });

        it("should check workflow readiness", async function () {
            const { networkHelpers } = await network.connect();
            const { creHook } = await networkHelpers.loadFixture(deployCREFixture);

            const tx = await creHook.registerWorkflow(0, 0, "Test");
            const receipt = await tx.wait();
            const event = receipt.logs.find((log: any) => {
                try {
                    return creHook.interface.parseLog({ topics: log.topics, data: log.data })?.name === "WorkflowRegistered";
                } catch { return false; }
            });
            const parsed = creHook.interface.parseLog({ topics: event.topics, data: event.data });
            const workflowId = parsed!.args[0];

            expect(await creHook.isWorkflowReady(workflowId)).to.be.true;
        });
    });
});
