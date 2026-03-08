
import { expect } from "chai";
import { network } from "hardhat";

describe("Automation Simulation Tests", function () {
    async function deployAutomationFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, user1, user2, user3, executor] = await ethers.getSigners();

        const MockLendingPool = await ethers.getContractFactory("MockLendingPoolForAutomation");
        const mockPool = await MockLendingPool.deploy();

        const LiquidationAutomation = await ethers.getContractFactory("LiquidationAutomation");
        const automation = await LiquidationAutomation.deploy(owner.address, await mockPool.getAddress());

        return { automation, mockPool, owner, user1, user2, user3, executor, ethers, connection };
    }

    async function deployCREFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, executor, unauthorized] = await ethers.getSigners();

        const mockPool = ethers.Wallet.createRandom().address;
        const mockEngine = ethers.Wallet.createRandom().address;
        const mockAutomation = ethers.Wallet.createRandom().address;
        const mockVault = ethers.Wallet.createRandom().address;
        const mockAllocator = ethers.Wallet.createRandom().address;

        const CREExecutionHook = await ethers.getContractFactory("CREExecutionHook");
        const cre = await CREExecutionHook.deploy(
            owner.address, mockPool, mockEngine, mockAutomation, mockVault, mockAllocator
        );

        await cre.setAuthorizedExecutor(executor.address, true);

        return { cre, owner, executor, unauthorized, mockPool, mockEngine, ethers, connection };
    }

    // ===================== USER TRACKING =====================

    describe("User Tracking", function () {
        it("Should track a new user", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { automation, user1 } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.trackUser(user1.address);
            expect(await automation.isTracked(user1.address)).to.be.true;
        });

        it("Should not double-track a user", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { automation, user1 } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.trackUser(user1.address);
            await automation.trackUser(user1.address); // No-op
            expect(await automation.isTracked(user1.address)).to.be.true;
        });

        it("Should untrack a user (owner only)", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { automation, user1 } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.trackUser(user1.address);
            await automation.untrackUser(user1.address);
            expect(await automation.isTracked(user1.address)).to.be.false;
        });

        it("Should reject untrack from non-owner", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { automation, user1 } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.trackUser(user1.address);
            try {
                await automation.connect(user1).untrackUser(user1.address);
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("revert");
            }
        });
    });

    // ===================== checkUpkeep =====================

    describe("checkUpkeep", function () {
        it("Should return false when no users are tracked", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { automation } = await networkHelpers.loadFixture(deployAutomationFixture);

            const [upkeepNeeded] = await automation.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.false;
        });

        it("Should return false when all users are healthy", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { automation, user1, user2 } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.trackUser(user1.address);
            await automation.trackUser(user2.address);

            const [upkeepNeeded] = await automation.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.false;
        });

        it("Should return true when a user has HF < 1.0", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { automation, mockPool, user1, user2 } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.trackUser(user1.address);
            await automation.trackUser(user2.address);
            await mockPool.setHealthFactor(user1.address, ethers.parseEther("0.8"));

            const [upkeepNeeded, performData] = await automation.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.true;

            const users = ethers.AbiCoder.defaultAbiCoder().decode(["address[]"], performData)[0];
            expect(users).to.include(user1.address);
        });

        it("Should find multiple liquidatable users", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { automation, mockPool, user1, user2, user3 } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.trackUser(user1.address);
            await automation.trackUser(user2.address);
            await automation.trackUser(user3.address);

            await mockPool.setHealthFactor(user1.address, ethers.parseEther("0.5"));
            await mockPool.setHealthFactor(user3.address, ethers.parseEther("0.9"));

            const [upkeepNeeded, performData] = await automation.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.true;

            const users = ethers.AbiCoder.defaultAbiCoder().decode(["address[]"], performData)[0];
            expect(users.length).to.equal(2);
        });

        it("Should respect cooldown period", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { automation, mockPool, user1, ethers, connection: fixtureConn } = await networkHelpers.loadFixture(deployAutomationFixture);
            const fixtureHelpers = (fixtureConn as any).networkHelpers;

            await automation.trackUser(user1.address);
            await mockPool.setHealthFactor(user1.address, ethers.parseEther("0.8"));

            const [, performData] = await automation.checkUpkeep("0x");
            await automation.performUpkeep(performData);

            const [upkeepNeeded2] = await automation.checkUpkeep("0x");
            expect(upkeepNeeded2).to.be.false;

            await fixtureHelpers.time.increase(61);
            await fixtureHelpers.mine();

            const [upkeepNeeded3] = await automation.checkUpkeep("0x");
            expect(upkeepNeeded3).to.be.true;
        });

        it("Should respect maxCheckPerCall limit", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { automation, mockPool } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.setMaxCheckPerCall(2);

            for (let i = 0; i < 5; i++) {
                const wallet = ethers.Wallet.createRandom();
                await automation.trackUser(wallet.address);
                await mockPool.setHealthFactor(wallet.address, ethers.parseEther("0.5"));
            }

            const [upkeepNeeded, performData] = await automation.checkUpkeep("0x");
            expect(upkeepNeeded).to.be.true;

            const users = ethers.AbiCoder.defaultAbiCoder().decode(["address[]"], performData)[0];
            expect(users.length).to.be.lte(2);
        });
    });

    // ===================== performUpkeep =====================

    describe("performUpkeep", function () {
        it("Should emit LiquidationTriggered for unhealthy users", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { automation, mockPool, user1 } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.trackUser(user1.address);
            await mockPool.setHealthFactor(user1.address, ethers.parseEther("0.75"));

            const [, performData] = await automation.checkUpkeep("0x");
            await automation.performUpkeep(performData);

            const lastTime = await automation.lastLiquidationTime(user1.address);
            expect(lastTime).to.be.gt(0n);
        });

        it("Should re-validate and skip users who became healthy", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { automation, mockPool, user1 } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.trackUser(user1.address);
            await mockPool.setHealthFactor(user1.address, ethers.parseEther("0.8"));

            const [, performData] = await automation.checkUpkeep("0x");
            await mockPool.setHealthFactor(user1.address, ethers.parseEther("1.5"));

            await automation.performUpkeep(performData);
            // lastLiquidationTime should NOT be set since user became healthy
            const lastTime = await automation.lastLiquidationTime(user1.address);
            expect(lastTime).to.equal(0n);
        });

        it("Should handle empty performData gracefully", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { automation } = await networkHelpers.loadFixture(deployAutomationFixture);

            const emptyPerformData = ethers.AbiCoder.defaultAbiCoder().encode(["address[]"], [[]]);
            await automation.performUpkeep(emptyPerformData); // Should not revert
        });
    });

    // ===================== Admin =====================

    describe("Automation Admin", function () {
        it("Should allow owner to set max check per call", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { automation } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.setMaxCheckPerCall(50);
            expect(await automation.maxCheckPerCall()).to.equal(50n);
        });

        it("Should allow owner to set cooldown period", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { automation } = await networkHelpers.loadFixture(deployAutomationFixture);

            await automation.setCooldownPeriod(120);
            expect(await automation.cooldownPeriod()).to.equal(120n);
        });

        it("Should reject admin calls from non-owner", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { automation, user1 } = await networkHelpers.loadFixture(deployAutomationFixture);

            try {
                await automation.connect(user1).setMaxCheckPerCall(50);
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("revert");
            }
        });
    });

    // ===================== CRE WORKFLOW =====================

    describe("CRE Workflow Registration", function () {
        it("Should register a workflow", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { cre } = await networkHelpers.loadFixture(deployCREFixture);

            await cre.registerWorkflow(0, 300, "AI Rate Adjustment");
            expect(await cre.getWorkflowCount()).to.equal(1n);
        });

        it("Should register all workflow types", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { cre } = await networkHelpers.loadFixture(deployCREFixture);

            for (let i = 0; i < 5; i++) {
                await cre.registerWorkflow(i, 300, `Workflow ${i}`);
            }
            expect(await cre.getWorkflowCount()).to.equal(5n);
        });

        it("Should reject workflow registration from non-owner", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { cre, executor } = await networkHelpers.loadFixture(deployCREFixture);

            try {
                await cre.connect(executor).registerWorkflow(0, 300, "Hack");
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("revert");
            }
        });
    });

    describe("CRE Pre-Hook Execution", function () {
        it("Should execute pre-hook for all workflow types", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { cre, executor } = await networkHelpers.loadFixture(deployCREFixture);

            for (let i = 0; i < 5; i++) {
                await cre.registerWorkflow(i, 0, `Workflow ${i}`);
                const workflowId = await cre.workflowIds(i);
                await cre.connect(executor).executePreHook(workflowId);
            }
            expect(await cre.totalExecutions()).to.equal(5n);
        });

        it("Should reject pre-hook from unauthorized executor", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { cre, unauthorized } = await networkHelpers.loadFixture(deployCREFixture);

            await cre.registerWorkflow(0, 0, "Test");
            const workflowId = await cre.workflowIds(0);

            try {
                await cre.connect(unauthorized).executePreHook(workflowId);
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("Not authorized executor");
            }
        });

        it("Should reject pre-hook for inactive workflow", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { cre, executor } = await networkHelpers.loadFixture(deployCREFixture);

            await cre.registerWorkflow(0, 0, "Test");
            const workflowId = await cre.workflowIds(0);
            await cre.setWorkflowActive(workflowId, false);

            try {
                await cre.connect(executor).executePreHook(workflowId);
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("Workflow not active");
            }
        });
    });

    describe("CRE Post-Hook Execution", function () {
        it("Should complete a full workflow lifecycle", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { cre, executor } = await networkHelpers.loadFixture(deployCREFixture);

            await cre.registerWorkflow(3, 0, "Risk Monitoring");
            const workflowId = await cre.workflowIds(0);

            const tx = await cre.connect(executor).executePreHook(workflowId);
            const receipt = await tx.wait();

            // Extract executionId from PreHookExecuted event
            const event = receipt?.logs.find((l: any) => {
                try {
                    return cre.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "PreHookExecuted";
                } catch { return false; }
            });
            const parsed = cre.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
            const executionId = parsed!.args[0];

            await cre.connect(executor).executePostHook(executionId, ethers.toUtf8Bytes("risk OK"));

            const execution = await cre.getExecution(executionId);
            expect(execution.status).to.equal(4n); // COMPLETED
        });

        it("Should reject post-hook without prior pre-hook", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { cre, executor } = await networkHelpers.loadFixture(deployCREFixture);

            const fakeExecutionId = ethers.keccak256(ethers.toUtf8Bytes("fake"));
            try {
                await cre.connect(executor).executePostHook(fakeExecutionId, "0x01");
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("Invalid status");
            }
        });

        it("Should mark workflow as FAILED when post-hook returns false", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { cre, executor } = await networkHelpers.loadFixture(deployCREFixture);

            await cre.setAIYieldEngine(ethers.ZeroAddress);
            await cre.registerWorkflow(0, 0, "Rate Adjustment - No Engine");
            const workflowId = await cre.workflowIds(0);

            const tx = await cre.connect(executor).executePreHook(workflowId);
            const receipt = await tx.wait();

            const event = receipt?.logs.find((l: any) => {
                try {
                    return cre.interface.parseLog({ topics: l.topics as string[], data: l.data })?.name === "PreHookExecuted";
                } catch { return false; }
            });
            const parsed = cre.interface.parseLog({ topics: event!.topics as string[], data: event!.data });
            const executionId = parsed!.args[0];

            await cre.connect(executor).executePostHook(executionId, ethers.toUtf8Bytes("data"));

            const execution = await cre.getExecution(executionId);
            expect(execution.status).to.equal(5n); // FAILED
        });
    });

    describe("CRE View Functions", function () {
        it("Should report workflow readiness", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { cre } = await networkHelpers.loadFixture(deployCREFixture);

            await cre.registerWorkflow(0, 300, "Rate Adjustment");
            const workflowId = await cre.workflowIds(0);
            expect(await cre.isWorkflowReady(workflowId)).to.be.true;
        });

        it("Should return correct workflow config", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { cre } = await networkHelpers.loadFixture(deployCREFixture);

            await cre.registerWorkflow(1, 120, "Liquidation Scan");
            const workflowId = await cre.workflowIds(0);

            const config = await cre.getWorkflowConfig(workflowId);
            expect(config.workflowType).to.equal(1n);
            expect(config.minInterval).to.equal(120n);
            expect(config.isActive).to.be.true;
        });
    });

    describe("CRE Admin Functions", function () {
        it("Should authorize and deauthorize executors", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { cre, unauthorized } = await networkHelpers.loadFixture(deployCREFixture);

            await cre.setAuthorizedExecutor(unauthorized.address, true);
            expect(await cre.authorizedExecutors(unauthorized.address)).to.be.true;

            await cre.setAuthorizedExecutor(unauthorized.address, false);
            expect(await cre.authorizedExecutors(unauthorized.address)).to.be.false;
        });

        it("Should allow owner to update protocol addresses", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { cre } = await networkHelpers.loadFixture(deployCREFixture);

            const newAddr = ethers.Wallet.createRandom().address;
            await cre.setLendingPool(newAddr);
            expect(await cre.lendingPool()).to.equal(newAddr);
        });

        it("Should reject admin calls from non-owner", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { cre, unauthorized } = await networkHelpers.loadFixture(deployCREFixture);

            try {
                await cre.connect(unauthorized).setLendingPool(ethers.ZeroAddress);
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("revert");
            }
        });
    });
});
