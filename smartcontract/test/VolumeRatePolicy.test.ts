import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("VolumeRatePolicy", function () {
    async function deployVolumeRatePolicyFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, policyEngine, caller1, target1, user1] = await ethers.getSigners();

        const VolumeRatePolicy = await ethers.getContractFactory("VolumeRatePolicy");
        const policy = await VolumeRatePolicy.deploy(owner.address);

        await policy.setPolicyEngine(policyEngine.address);

        return { policy, owner, policyEngine, caller1, target1, user1, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct owner", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, owner } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);
            expect(await policy.owner()).to.equal(owner.address);
        });

        it("should start active", async function () {
            const { networkHelpers } = await network.connect();
            const { policy } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);
            expect(await policy.isActive()).to.be.true;
        });

        it("should return correct policy name", async function () {
            const { networkHelpers } = await network.connect();
            const { policy } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);
            expect(await policy.policyName()).to.equal("VolumeRateLimit");
        });
    });

    describe("Rate Limit Configuration", function () {
        it("should set rate limit", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, target1, ethers } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            const selector = "0x12345678";
            await policy.setRateLimit(target1.address, selector, 1000, ethers.parseUnits("500000", 6), 5, 3600);

            const limit = await policy.getRateLimit(target1.address, selector);
            expect(limit.maxSingleAmountBps).to.equal(1000n);
            expect(limit.maxWindowAmount).to.equal(ethers.parseUnits("500000", 6));
            expect(limit.maxActionsPerWindow).to.equal(5n);
            expect(limit.windowDuration).to.equal(3600n);
            expect(limit.configured).to.be.true;
        });

        it("should revert zero window duration", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, target1 } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            await expect(
                policy.setRateLimit(target1.address, "0x12345678", 1000, 500000, 5, 0)
            ).to.be.revertedWith("VolumeRatePolicy: zero window");
        });

        it("should only allow owner to set rate limits", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, target1, caller1 } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            await expect(
                policy.connect(caller1).setRateLimit(target1.address, "0x12345678", 1000, 500000, 5, 3600)
            ).to.be.reverted;
        });
    });

    describe("Validation", function () {
        it("should pass when no rate limit configured", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, target1, caller1 } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            const [valid] = await policy.validate(caller1.address, target1.address, "0x12345678", "0x");
            expect(valid).to.be.true;
        });

        it("should pass when inactive", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, target1, caller1 } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            await policy.setActive(false);
            const [valid] = await policy.validate(caller1.address, target1.address, "0x12345678", "0x");
            expect(valid).to.be.true;
        });

        it("should reject single action exceeding max volume", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, target1, caller1, ethers } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            const selector = "0x12345678";
            // Max 10% per action (1000 bps)
            await policy.setRateLimit(target1.address, selector, 1000, 0, 0, 3600);

            // Try to move 20% of 1000000 reference = 200000, max is 100000
            const amount = ethers.parseUnits("200000", 6);
            const reference = ethers.parseUnits("1000000", 6);
            const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [amount, reference]);

            const [valid, reason] = await policy.validate(caller1.address, target1.address, selector, data);
            expect(valid).to.be.false;
            expect(reason).to.include("Single action exceeds max volume");
        });

        it("should pass single action within max volume", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, target1, caller1, ethers } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            const selector = "0x12345678";
            await policy.setRateLimit(target1.address, selector, 1000, 0, 0, 3600);

            const amount = ethers.parseUnits("50000", 6);
            const reference = ethers.parseUnits("1000000", 6);
            const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint256", "uint256"], [amount, reference]);

            const [valid] = await policy.validate(caller1.address, target1.address, selector, data);
            expect(valid).to.be.true;
        });
    });

    describe("Post Execution Update", function () {
        it("should revert from non-policy-engine caller", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, target1, caller1 } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            await expect(
                policy.connect(caller1).postExecutionUpdate(caller1.address, target1.address, "0x12345678", "0x")
            ).to.be.revertedWith("Only PolicyEngine");
        });

        it("should update window state", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, policyEngine, target1, caller1, ethers } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            const selector = "0x12345678";
            await policy.setRateLimit(target1.address, selector, 0, ethers.parseUnits("500000", 6), 5, 3600);

            const amount = ethers.parseUnits("100000", 6);
            const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amount]);

            await policy.connect(policyEngine).postExecutionUpdate(caller1.address, target1.address, selector, data);

            const state = await policy.getWindowState(target1.address, selector, caller1.address);
            expect(state.cumulativeAmount).to.equal(amount);
            expect(state.actionCount).to.equal(1n);
        });
    });

    describe("Admin Functions", function () {
        it("should toggle active state", async function () {
            const { networkHelpers } = await network.connect();
            const { policy } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            await policy.setActive(false);
            expect(await policy.isActive()).to.be.false;
        });

        it("should set policy engine", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, caller1 } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            await policy.setPolicyEngine(caller1.address);
            expect(await policy.policyEngine()).to.equal(caller1.address);
        });

        it("should reset window", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, policyEngine, target1, caller1, ethers } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            const selector = "0x12345678";
            await policy.setRateLimit(target1.address, selector, 0, ethers.parseUnits("500000", 6), 5, 3600);

            const amount = ethers.parseUnits("100000", 6);
            const data = ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [amount]);
            await policy.connect(policyEngine).postExecutionUpdate(caller1.address, target1.address, selector, data);

            await policy.resetWindow(target1.address, selector, caller1.address);

            const state = await policy.getWindowState(target1.address, selector, caller1.address);
            expect(state.cumulativeAmount).to.equal(0n);
            expect(state.actionCount).to.equal(0n);
        });
    });

    describe("View Functions", function () {
        it("should get remaining window capacity for unconfigured limit", async function () {
            const { networkHelpers } = await network.connect();
            const { policy, target1, caller1 } = await networkHelpers.loadFixture(deployVolumeRatePolicyFixture);

            const [remainingAmount, remainingActions] = await policy.getRemainingWindowCapacity(
                target1.address, "0x12345678", caller1.address
            );
            // Unconfigured returns type(uint256).max
            expect(remainingAmount).to.be.above(0n);
        });
    });
});
