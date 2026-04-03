import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("GovernanceController", function () {
    async function deployGovernanceFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, guardian, user1, target1] = await ethers.getSigners();

        const GovernanceController = await ethers.getContractFactory("GovernanceController");
        const governance = await GovernanceController.deploy(owner.address, guardian.address);

        // Deploy a simple governed contract (use MockERC20 as a dummy target)
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const governed = await MockERC20.deploy("Test", "TST", 18);

        // Add as governed contract
        await governance.addGovernedContract(await governed.getAddress());

        return { governance, governed, owner, guardian, user1, target1, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, owner, guardian } = await networkHelpers.loadFixture(deployGovernanceFixture);

            expect(await governance.owner()).to.equal(owner.address);
            expect(await governance.guardian()).to.equal(guardian.address);
            expect(await governance.timelockDelay()).to.equal(86400n); // 24 hours
            expect(await governance.paused()).to.be.false;
        });
    });

    describe("Governed Contracts", function () {
        it("should add governed contract", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, target1 } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await governance.addGovernedContract(target1.address);
            expect(await governance.governedContracts(target1.address)).to.be.true;
        });

        it("should remove governed contract", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, governed } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await governance.removeGovernedContract(await governed.getAddress());
            expect(await governance.governedContracts(await governed.getAddress())).to.be.false;
        });

        it("should revert adding zero address", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, ethers } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await expect(
                governance.addGovernedContract(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });

        it("should only allow owner", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, user1, target1 } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await expect(
                governance.connect(user1).addGovernedContract(target1.address)
            ).to.be.reverted;
        });
    });

    describe("Proposal Queue", function () {
        it("should queue a proposal", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, governed, ethers } = await networkHelpers.loadFixture(deployGovernanceFixture);

            const callData = governed.interface.encodeFunctionData("mint", [governed.target, ethers.parseEther("100")]);

            const tx = await governance.queueProposal(await governed.getAddress(), callData, "Mint 100 tokens");
            const receipt = await tx.wait();

            expect(await governance.proposalCount()).to.equal(1n);
        });

        it("should revert queue for non-governed target", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, target1 } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await expect(
                governance.queueProposal(target1.address, "0x", "Test")
            ).to.be.revertedWith("Target not governed");
        });

        it("should only allow owner to queue", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, governed, user1 } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await expect(
                governance.connect(user1).queueProposal(await governed.getAddress(), "0x", "Test")
            ).to.be.reverted;
        });
    });

    describe("Proposal Cancellation", function () {
        it("should cancel a queued proposal by owner", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, governed, ethers } = await networkHelpers.loadFixture(deployGovernanceFixture);

            const callData = governed.interface.encodeFunctionData("mint", [governed.target, ethers.parseEther("100")]);
            const tx = await governance.queueProposal(await governed.getAddress(), callData, "Mint tokens");
            const receipt = await tx.wait();

            // Get proposal ID from event
            const event = receipt.logs.find((log: any) => {
                try {
                    return governance.interface.parseLog({ topics: log.topics, data: log.data })?.name === "ProposalQueued";
                } catch { return false; }
            });
            const parsed = governance.interface.parseLog({ topics: event.topics, data: event.data });
            const proposalId = parsed!.args[0];

            await governance.cancelProposal(proposalId);

            const status = await governance.getProposalStatus(proposalId);
            expect(status).to.equal(3n); // CANCELLED
        });

        it("should allow guardian to cancel", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, governed, guardian, ethers } = await networkHelpers.loadFixture(deployGovernanceFixture);

            const callData = governed.interface.encodeFunctionData("mint", [governed.target, ethers.parseEther("100")]);
            const tx = await governance.queueProposal(await governed.getAddress(), callData, "Test");
            const receipt = await tx.wait();

            const event = receipt.logs.find((log: any) => {
                try {
                    return governance.interface.parseLog({ topics: log.topics, data: log.data })?.name === "ProposalQueued";
                } catch { return false; }
            });
            const parsed = governance.interface.parseLog({ topics: event.topics, data: event.data });
            const proposalId = parsed!.args[0];

            await governance.connect(guardian).cancelProposal(proposalId);
        });
    });

    describe("Emergency Actions", function () {
        it("should allow guardian to pause protocol", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, guardian } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await governance.connect(guardian).pauseProtocol();
            expect(await governance.isProtocolPaused()).to.be.true;
        });

        it("should allow owner to pause and unpause", async function () {
            const { networkHelpers } = await network.connect();
            const { governance } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await governance.pauseProtocol();
            expect(await governance.paused()).to.be.true;

            await governance.unpauseProtocol();
            expect(await governance.paused()).to.be.false;
        });

        it("should revert unpause from non-owner", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, guardian } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await governance.pauseProtocol();

            await expect(
                governance.connect(guardian).unpauseProtocol()
            ).to.be.reverted;
        });

        it("should allow guardian emergency action", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, governed, guardian, ethers } = await networkHelpers.loadFixture(deployGovernanceFixture);

            // Mock mint is a simple call that should succeed
            const callData = governed.interface.encodeFunctionData("mint", [guardian.address, ethers.parseEther("10")]);
            await governance.connect(guardian).emergencyAction(await governed.getAddress(), callData);
        });

        it("should revert emergency action from non-guardian", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, governed, user1 } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await expect(
                governance.connect(user1).emergencyAction(await governed.getAddress(), "0x")
            ).to.be.revertedWith("Only guardian");
        });
    });

    describe("Parameter Bounds", function () {
        it("should set parameter bounds", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, ethers } = await networkHelpers.loadFixture(deployGovernanceFixture);

            const paramHash = ethers.keccak256(ethers.toUtf8Bytes("maxFee"));
            await governance.setParameterBounds(paramHash, 100, 5000);

            expect(await governance.isWithinBounds(paramHash, 1000)).to.be.true;
            expect(await governance.isWithinBounds(paramHash, 50)).to.be.false;
            expect(await governance.isWithinBounds(paramHash, 5001)).to.be.false;
        });

        it("should revert invalid bounds", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, ethers } = await networkHelpers.loadFixture(deployGovernanceFixture);

            const paramHash = ethers.keccak256(ethers.toUtf8Bytes("test"));
            await expect(
                governance.setParameterBounds(paramHash, 5000, 100)
            ).to.be.revertedWith("Invalid bounds");
        });

        it("should return true for unset bounds", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, ethers } = await networkHelpers.loadFixture(deployGovernanceFixture);

            const paramHash = ethers.keccak256(ethers.toUtf8Bytes("unknown"));
            expect(await governance.isWithinBounds(paramHash, 999999)).to.be.true;
        });
    });

    describe("Admin Functions", function () {
        it("should set guardian", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, user1 } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await governance.setGuardian(user1.address);
            expect(await governance.guardian()).to.equal(user1.address);
        });

        it("should set timelock delay", async function () {
            const { networkHelpers } = await network.connect();
            const { governance } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await governance.setTimelockDelay(2 * 24 * 3600); // 2 days
            expect(await governance.timelockDelay()).to.equal(172800n);
        });

        it("should revert timelock below minimum", async function () {
            const { networkHelpers } = await network.connect();
            const { governance } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await expect(
                governance.setTimelockDelay(1800) // 30 min < 1 hour
            ).to.be.revertedWith("Below minimum delay");
        });

        it("should revert timelock above maximum", async function () {
            const { networkHelpers } = await network.connect();
            const { governance } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await expect(
                governance.setTimelockDelay(31 * 24 * 3600) // 31 days > 30 days
            ).to.be.revertedWith("Above maximum delay");
        });

        it("should set policy engine", async function () {
            const { networkHelpers } = await network.connect();
            const { governance, target1 } = await networkHelpers.loadFixture(deployGovernanceFixture);

            await governance.setPolicyEngine(target1.address);
            expect(await governance.policyEngine()).to.equal(target1.address);
        });
    });
});
