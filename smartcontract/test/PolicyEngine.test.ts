import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("PolicyEngine", function () {
    async function deployPolicyEngineFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, governance, caller1, user1, target1] = await ethers.getSigners();

        const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
        const engine = await PolicyEngine.deploy(owner.address);

        const MockPolicy = await ethers.getContractFactory("MockPolicy");
        const policy1 = await MockPolicy.deploy();
        const policy2 = await MockPolicy.deploy();

        return { engine, policy1, policy2, owner, governance, caller1, user1, target1, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct owner", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, owner } = await networkHelpers.loadFixture(deployPolicyEngineFixture);
            expect(await engine.owner()).to.equal(owner.address);
        });

        it("should start with engine active", async function () {
            const { networkHelpers } = await network.connect();
            const { engine } = await networkHelpers.loadFixture(deployPolicyEngineFixture);
            expect(await engine.engineActive()).to.be.true;
        });
    });

    describe("Policy Management", function () {
        it("should add a policy for target+selector", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1, target1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            const selector = "0x12345678";
            await engine.addPolicy(target1.address, selector, await policy1.getAddress());

            const policies = await engine.getPolicies(target1.address, selector);
            expect(policies.length).to.equal(1);
            expect(policies[0]).to.equal(await policy1.getAddress());
        });

        it("should revert adding zero address policy", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, target1, ethers } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await expect(
                engine.addPolicy(target1.address, "0x12345678", ethers.ZeroAddress)
            ).to.be.revertedWith("PolicyEngine: zero address");
        });

        it("should remove a policy", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1, target1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            const selector = "0x12345678";
            await engine.addPolicy(target1.address, selector, await policy1.getAddress());
            await engine.removePolicy(target1.address, selector, await policy1.getAddress());

            const policies = await engine.getPolicies(target1.address, selector);
            expect(policies.length).to.equal(0);
        });

        it("should revert removing non-existent policy", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1, target1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await expect(
                engine.removePolicy(target1.address, "0x12345678", await policy1.getAddress())
            ).to.be.revertedWith("PolicyEngine: policy not found");
        });

        it("should add global policy", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await engine.addGlobalPolicy(await policy1.getAddress());
            const globals = await engine.getGlobalPolicies();
            expect(globals.length).to.equal(1);
        });

        it("should remove global policy", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await engine.addGlobalPolicy(await policy1.getAddress());
            await engine.removeGlobalPolicy(await policy1.getAddress());
            const globals = await engine.getGlobalPolicies();
            expect(globals.length).to.equal(0);
        });

        it("should revert removing non-existent global policy", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await expect(
                engine.removeGlobalPolicy(await policy1.getAddress())
            ).to.be.revertedWith("PolicyEngine: policy not found");
        });

        it("should only allow governance to add policies", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1, target1, user1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await expect(
                engine.connect(user1).addPolicy(target1.address, "0x12345678", await policy1.getAddress())
            ).to.be.revertedWith("PolicyEngine: not authorized");
        });

        it("should allow governance controller to add policies", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1, target1, governance } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await engine.setGovernanceController(governance.address);
            await engine.connect(governance).addPolicy(target1.address, "0x12345678", await policy1.getAddress());

            const count = await engine.getPolicyCount(target1.address, "0x12345678");
            expect(count).to.equal(1n);
        });
    });

    describe("Action Validation", function () {
        it("should validate action with passing policy", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1, target1, caller1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            const selector = "0x12345678";
            await engine.addPolicy(target1.address, selector, await policy1.getAddress());

            const [valid, reason] = await engine.validateAction(caller1.address, target1.address, selector, "0x");
            expect(valid).to.be.true;
            expect(reason).to.equal("");
        });

        it("should reject action with failing policy", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1, target1, caller1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            const selector = "0x12345678";
            await policy1.setShouldPass(false);
            await engine.addPolicy(target1.address, selector, await policy1.getAddress());

            const [valid, reason] = await engine.validateAction(caller1.address, target1.address, selector, "0x");
            expect(valid).to.be.false;
            expect(reason).to.include("Mock policy failed");
        });

        it("should bypass validation when engine is disabled", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1, target1, caller1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            const selector = "0x12345678";
            await policy1.setShouldPass(false);
            await engine.addPolicy(target1.address, selector, await policy1.getAddress());
            await engine.setEngineActive(false);

            const [valid] = await engine.validateAction(caller1.address, target1.address, selector, "0x");
            expect(valid).to.be.true;
        });

        it("should check global policies", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1, target1, caller1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await policy1.setShouldPass(false);
            await engine.addGlobalPolicy(await policy1.getAddress());

            const [valid] = await engine.validateAction(caller1.address, target1.address, "0x12345678", "0x");
            expect(valid).to.be.false;
        });

        it("should skip inactive policies", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1, target1, caller1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await policy1.setShouldPass(false);
            await policy1.setActive(false);
            await engine.addPolicy(target1.address, "0x12345678", await policy1.getAddress());

            const [valid] = await engine.validateAction(caller1.address, target1.address, "0x12345678", "0x");
            expect(valid).to.be.true;
        });
    });

    describe("Record Execution", function () {
        it("should revert from unauthorized recorder", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, caller1, target1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await expect(
                engine.connect(caller1).recordExecution(caller1.address, target1.address, "0x12345678", "0x")
            ).to.be.revertedWith("PolicyEngine: unauthorized recorder");
        });

        it("should allow authorized caller to record execution", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, policy1, caller1, target1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await engine.setAuthorizedCaller(caller1.address, true);
            await engine.addGlobalPolicy(await policy1.getAddress());

            await engine.connect(caller1).recordExecution(caller1.address, target1.address, "0x12345678", "0x");
            expect(await policy1.postExecutionCalled()).to.be.true;
        });
    });

    describe("Admin Functions", function () {
        it("should set governance controller", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, governance } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await engine.setGovernanceController(governance.address);
            expect(await engine.governanceController()).to.equal(governance.address);
        });

        it("should set authorized caller", async function () {
            const { networkHelpers } = await network.connect();
            const { engine, caller1 } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await engine.setAuthorizedCaller(caller1.address, true);
            expect(await engine.authorizedCallers(caller1.address)).to.be.true;
        });

        it("should toggle engine active", async function () {
            const { networkHelpers } = await network.connect();
            const { engine } = await networkHelpers.loadFixture(deployPolicyEngineFixture);

            await engine.setEngineActive(false);
            expect(await engine.engineActive()).to.be.false;
        });
    });
});
