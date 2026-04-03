import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("AIAgentRegistry", function () {
    async function deployRegistryFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, agent1, agent2, agent3, governance] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const stakingToken = await MockERC20.deploy("Staking Token", "STK", 18);

        const minStake = ethers.parseEther("100");

        const AIAgentRegistry = await ethers.getContractFactory("AIAgentRegistry");
        const registry = await AIAgentRegistry.deploy(owner.address, await stakingToken.getAddress(), minStake);

        // Mint tokens to agents
        await stakingToken.mint(agent1.address, ethers.parseEther("1000"));
        await stakingToken.mint(agent2.address, ethers.parseEther("1000"));
        await stakingToken.mint(agent3.address, ethers.parseEther("1000"));

        // Approve
        await stakingToken.connect(agent1).approve(await registry.getAddress(), ethers.parseEther("1000"));
        await stakingToken.connect(agent2).approve(await registry.getAddress(), ethers.parseEther("1000"));
        await stakingToken.connect(agent3).approve(await registry.getAddress(), ethers.parseEther("1000"));

        return { registry, stakingToken, owner, agent1, agent2, agent3, governance, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, stakingToken, owner, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            expect(await registry.owner()).to.equal(owner.address);
            expect(await registry.stakingToken()).to.equal(await stakingToken.getAddress());
            expect(await registry.minStake()).to.equal(ethers.parseEther("100"));
        });
    });

    describe("Agent Registration", function () {
        it("should register agent with sufficient stake", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1-meta", ethers.parseEther("100"));

            const data = await registry.getAgentData(agent1.address);
            expect(data.isActive).to.be.true;
            expect(data.reputationScore).to.equal(1000n);
            expect(data.stakedAmount).to.equal(ethers.parseEther("100"));
            expect(await registry.getAgentCount()).to.equal(1n);
        });

        it("should revert with insufficient stake", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await expect(
                registry.connect(agent1).registerAgent("ipfs://agent1-meta", ethers.parseEther("50"))
            ).to.be.revertedWith("Insufficient stake");
        });

        it("should revert double registration", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1-meta", ethers.parseEther("100"));

            await expect(
                registry.connect(agent1).registerAgent("ipfs://agent1-meta-2", ethers.parseEther("100"))
            ).to.be.revertedWith("Agent already registered");
        });

        it("should enforce whitelist when enabled", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.setWhitelistEnabled(true);

            await expect(
                registry.connect(agent1).registerAgent("ipfs://agent1-meta", ethers.parseEther("100"))
            ).to.be.revertedWith("Agent not whitelisted");
        });

        it("should allow whitelisted agent to register when whitelist enabled", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.setWhitelistEnabled(true);
            await registry.whitelistAgent(agent1.address);

            await registry.connect(agent1).registerAgent("ipfs://agent1-meta", ethers.parseEther("100"));
            expect((await registry.getAgentData(agent1.address)).isActive).to.be.true;
        });
    });

    describe("Deregistration", function () {
        it("should deregister agent and return stake", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, stakingToken, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));
            const balBefore = await stakingToken.balanceOf(agent1.address);

            await registry.connect(agent1).deregisterAgent();

            const data = await registry.getAgentData(agent1.address);
            expect(data.isActive).to.be.false;
            expect(data.stakedAmount).to.equal(0n);

            const balAfter = await stakingToken.balanceOf(agent1.address);
            expect(balAfter - balBefore).to.equal(ethers.parseEther("100"));
        });

        it("should revert deregistering inactive agent", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await expect(
                registry.connect(agent1).deregisterAgent()
            ).to.be.revertedWith("Agent not active");
        });
    });

    describe("Staking", function () {
        it("should allow adding additional stake", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));
            await registry.connect(agent1).addStake(ethers.parseEther("50"));

            const data = await registry.getAgentData(agent1.address);
            expect(data.stakedAmount).to.equal(ethers.parseEther("150"));
        });

        it("should revert adding stake for inactive agent", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await expect(
                registry.connect(agent1).addStake(ethers.parseEther("50"))
            ).to.be.revertedWith("Agent not active");
        });
    });

    describe("Reputation", function () {
        it("should increase reputation", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));
            await registry.updateReputation(agent1.address, true, 100);

            expect(await registry.reputationScores(agent1.address)).to.equal(1100n);
        });

        it("should decrease reputation", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));
            await registry.updateReputation(agent1.address, false, 500);

            expect(await registry.reputationScores(agent1.address)).to.equal(500n);
        });

        it("should floor reputation at 0", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));
            await registry.updateReputation(agent1.address, false, 5000);

            expect(await registry.reputationScores(agent1.address)).to.equal(0n);
        });

        it("should only allow owner to update reputation", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, agent2, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));

            await expect(
                registry.connect(agent2).updateReputation(agent1.address, true, 100)
            ).to.be.reverted;
        });
    });

    describe("Slashing", function () {
        it("should slash agent stake and reputation", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));
            await registry.slashAgent(agent1.address, "Bad prediction");

            const data = await registry.getAgentData(agent1.address);
            // Default slash = 10% of 100 = 10, so 90 remaining
            expect(data.stakedAmount).to.equal(ethers.parseEther("90"));
            expect(data.isSlashed).to.be.true;
            // Reputation halved: 1000/2 = 500
            expect(data.reputationScore).to.equal(500n);
        });

        it("should revert slashing inactive agent", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await expect(
                registry.slashAgent(agent1.address, "Bad")
            ).to.be.revertedWith("Agent not active");
        });
    });

    describe("Task Validation", function () {
        it("should validate passing prediction", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));

            const taskId = ethers.keccak256(ethers.toUtf8Bytes("task1"));
            // Predicted 1000, actual 1050, deviation = 500 bps (~5%), max = 1000 bps
            await registry.validateTask(taskId, agent1.address, 1000, 1050, 1000);

            const validation = await registry.validations(taskId);
            expect(validation.isValidated).to.be.true;
            expect(validation.isPassed).to.be.true;

            expect(await registry.successfulPredictions(agent1.address)).to.equal(1n);
            expect(await registry.reputationScores(agent1.address)).to.equal(1010n);
        });

        it("should validate failing prediction", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));

            const taskId = ethers.keccak256(ethers.toUtf8Bytes("task2"));
            // Predicted 1000, actual 2000, deviation ~5000 bps (50%), max = 1000 bps
            await registry.validateTask(taskId, agent1.address, 1000, 2000, 1000);

            expect(await registry.failedPredictions(agent1.address)).to.equal(1n);
            expect(await registry.reputationScores(agent1.address)).to.equal(980n);
        });

        it("should revert duplicate task validation", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));
            const taskId = ethers.keccak256(ethers.toUtf8Bytes("task1"));
            await registry.validateTask(taskId, agent1.address, 1000, 1050, 1000);

            await expect(
                registry.validateTask(taskId, agent1.address, 1000, 1050, 1000)
            ).to.be.revertedWith("Already validated");
        });
    });

    describe("Agent Selection", function () {
        it("should get top agents by reputation", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, agent2, agent3, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));
            await registry.connect(agent2).registerAgent("ipfs://agent2", ethers.parseEther("100"));
            await registry.connect(agent3).registerAgent("ipfs://agent3", ethers.parseEther("100"));

            // Boost agent2 reputation
            await registry.updateReputation(agent2.address, true, 500);

            const topAgents = await registry.getTopAgents(2);
            expect(topAgents.length).to.equal(2);
            expect(topAgents[0]).to.equal(agent2.address); // Highest reputation
        });
    });

    describe("Whitelist Management", function () {
        it("should whitelist agent", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.whitelistAgent(agent1.address);
            expect(await registry.isWhitelisted(agent1.address)).to.be.true;
        });

        it("should remove from whitelist", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.whitelistAgent(agent1.address);
            await registry.removeFromWhitelist(agent1.address);
            expect(await registry.isWhitelisted(agent1.address)).to.be.false;
        });

        it("should batch whitelist", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, agent2 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.batchWhitelist([agent1.address, agent2.address]);
            expect(await registry.isWhitelisted(agent1.address)).to.be.true;
            expect(await registry.isWhitelisted(agent2.address)).to.be.true;
        });

        it("should allow governance controller to whitelist", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, governance } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.setGovernanceController(governance.address);
            await registry.connect(governance).whitelistAgent(agent1.address);
            expect(await registry.isWhitelisted(agent1.address)).to.be.true;
        });

        it("should revert unauthorized whitelist", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, agent2 } = await networkHelpers.loadFixture(deployRegistryFixture);

            await expect(
                registry.connect(agent2).whitelistAgent(agent1.address)
            ).to.be.revertedWith("Not authorized");
        });
    });

    describe("Admin Functions", function () {
        it("should set min stake", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.setMinStake(ethers.parseEther("200"));
            expect(await registry.minStake()).to.equal(ethers.parseEther("200"));
        });

        it("should set slash percentage", async function () {
            const { networkHelpers } = await network.connect();
            const { registry } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.setSlashPercentage(2000);
            expect(await registry.slashPercentage()).to.equal(2000n);
        });

        it("should revert invalid slash percentage", async function () {
            const { networkHelpers } = await network.connect();
            const { registry } = await networkHelpers.loadFixture(deployRegistryFixture);

            await expect(
                registry.setSlashPercentage(10001)
            ).to.be.revertedWith("Invalid percentage");
        });

        it("should get agent accuracy", async function () {
            const { networkHelpers } = await network.connect();
            const { registry, agent1, ethers } = await networkHelpers.loadFixture(deployRegistryFixture);

            await registry.connect(agent1).registerAgent("ipfs://agent1", ethers.parseEther("100"));

            const taskId1 = ethers.keccak256(ethers.toUtf8Bytes("task1"));
            const taskId2 = ethers.keccak256(ethers.toUtf8Bytes("task2"));

            await registry.validateTask(taskId1, agent1.address, 1000, 1050, 1000); // pass
            await registry.validateTask(taskId2, agent1.address, 1000, 2000, 1000); // fail

            const accuracy = await registry.getAgentAccuracy(agent1.address);
            expect(accuracy).to.equal(5000n); // 50%
        });
    });
});
