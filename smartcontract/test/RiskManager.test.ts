import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("RiskManager", function () {
    async function deployRiskFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, assessor, strategy1, strategy2, user1] = await ethers.getSigners();

        const RiskManager = await ethers.getContractFactory("RiskManager");
        const riskManager = await RiskManager.deploy(owner.address);

        await riskManager.setRiskAssessor(assessor.address);

        return { riskManager, owner, assessor, strategy1, strategy2, user1, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct defaults", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, owner } = await networkHelpers.loadFixture(deployRiskFixture);

            expect(await riskManager.owner()).to.equal(owner.address);
            expect(await riskManager.globalMaxAllocationBps()).to.equal(4000n);
            expect(await riskManager.maxAcceptableRisk()).to.equal(7000n);
        });
    });

    describe("Risk Assessment", function () {
        it("should assess strategy by owner", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            await riskManager.assessStrategy(
                strategy1.address, 3000, 3000, true, 2, 8000, 0
            );

            const risk = await riskManager.getFullRisk(strategy1.address);
            expect(risk.riskScore).to.equal(3000n);
            expect(risk.maxAllocationBps).to.equal(3000n);
            expect(risk.hasAudit).to.be.true;
            expect(risk.isApproved).to.be.true;
        });

        it("should assess strategy by assessor", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, assessor, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            await riskManager.connect(assessor).assessStrategy(
                strategy1.address, 5000, 2000, true, 1, 7000, 1
            );

            expect(await riskManager.isApproved(strategy1.address)).to.be.true;
        });

        it("should not approve without audit", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            await riskManager.assessStrategy(
                strategy1.address, 3000, 3000, false, 0, 8000, 0
            );

            expect(await riskManager.isApproved(strategy1.address)).to.be.false;
        });

        it("should not approve high risk", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            await riskManager.assessStrategy(
                strategy1.address, 8000, 3000, true, 2, 5000, 2
            );

            expect(await riskManager.isApproved(strategy1.address)).to.be.false;
        });

        it("should cap allocation at global max", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            // Try to set 60% allocation, global max is 40%
            await riskManager.assessStrategy(
                strategy1.address, 3000, 6000, true, 2, 8000, 0
            );

            const risk = await riskManager.getFullRisk(strategy1.address);
            expect(risk.maxAllocationBps).to.equal(4000n); // Capped at global
        });

        it("should revert from unauthorized caller", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1, user1 } = await networkHelpers.loadFixture(deployRiskFixture);

            await expect(
                riskManager.connect(user1).assessStrategy(strategy1.address, 3000, 3000, true, 2, 8000, 0)
            ).to.be.revertedWith("Not authorized");
        });

        it("should revert invalid risk score", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            await expect(
                riskManager.assessStrategy(strategy1.address, 10001, 3000, true, 2, 8000, 0)
            ).to.be.revertedWith("Invalid risk score");
        });
    });

    describe("Flagging", function () {
        it("should flag strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            await riskManager.assessStrategy(strategy1.address, 3000, 3000, true, 2, 8000, 0);
            await riskManager.flagStrategy(strategy1.address, "Exploit detected");

            expect(await riskManager.isApproved(strategy1.address)).to.be.false;
        });
    });

    describe("Allocation Validation", function () {
        it("should validate allocation within limits", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            await riskManager.assessStrategy(strategy1.address, 3000, 3000, true, 2, 8000, 0);

            const [valid, reason] = await riskManager.validateAllocation(strategy1.address, 2000);
            expect(valid).to.be.true;
            expect(reason).to.equal("");
        });

        it("should reject unassessed strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            const [valid, reason] = await riskManager.validateAllocation(strategy1.address, 2000);
            expect(valid).to.be.false;
            expect(reason).to.include("not assessed");
        });

        it("should reject unapproved strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            await riskManager.assessStrategy(strategy1.address, 3000, 3000, false, 0, 8000, 0);

            const [valid, reason] = await riskManager.validateAllocation(strategy1.address, 2000);
            expect(valid).to.be.false;
            expect(reason).to.include("not risk-approved");
        });

        it("should reject exceeding strategy max", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            await riskManager.assessStrategy(strategy1.address, 3000, 2000, true, 2, 8000, 0);

            const [valid, reason] = await riskManager.validateAllocation(strategy1.address, 3000);
            expect(valid).to.be.false;
            expect(reason).to.include("Exceeds strategy max");
        });

        it("should return zero max allocation for unapproved", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, strategy1 } = await networkHelpers.loadFixture(deployRiskFixture);

            expect(await riskManager.getMaxAllocation(strategy1.address)).to.equal(0n);
        });
    });

    describe("Admin Functions", function () {
        it("should set global max allocation", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager } = await networkHelpers.loadFixture(deployRiskFixture);

            await riskManager.setGlobalMaxAllocation(5000);
            expect(await riskManager.globalMaxAllocationBps()).to.equal(5000n);
        });

        it("should revert invalid global max", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager } = await networkHelpers.loadFixture(deployRiskFixture);

            await expect(
                riskManager.setGlobalMaxAllocation(10001)
            ).to.be.revertedWith("Invalid bps");
        });

        it("should set max acceptable risk", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager } = await networkHelpers.loadFixture(deployRiskFixture);

            await riskManager.setMaxAcceptableRisk(8000);
            expect(await riskManager.maxAcceptableRisk()).to.equal(8000n);
        });

        it("should set risk assessor", async function () {
            const { networkHelpers } = await network.connect();
            const { riskManager, user1 } = await networkHelpers.loadFixture(deployRiskFixture);

            await riskManager.setRiskAssessor(user1.address);
            expect(await riskManager.riskAssessor()).to.equal(user1.address);
        });
    });
});
