import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("AIRevenueDistributor", function () {
    async function deployDistributorFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, agent1, agent2, agent3, communityPool, protocolReserve] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

        const AIRevenueDistributor = await ethers.getContractFactory("AIRevenueDistributor");
        const distributor = await AIRevenueDistributor.deploy(
            owner.address,
            await usdc.getAddress(),
            owner.address, // agentRegistry placeholder
            communityPool.address,
            protocolReserve.address
        );

        // Mint USDC to agents
        const amount = ethers.parseUnits("100000", 6);
        await usdc.mint(agent1.address, amount);
        await usdc.mint(agent2.address, amount);
        await usdc.mint(owner.address, amount);

        // Approve
        await usdc.connect(agent1).approve(await distributor.getAddress(), amount);
        await usdc.connect(agent2).approve(await distributor.getAddress(), amount);
        await usdc.connect(owner).approve(await distributor.getAddress(), amount);

        return { distributor, usdc, owner, agent1, agent2, agent3, communityPool, protocolReserve, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor, owner, communityPool, protocolReserve } = await networkHelpers.loadFixture(deployDistributorFixture);

            expect(await distributor.owner()).to.equal(owner.address);
            expect(await distributor.currentEpoch()).to.equal(1n);
            expect(await distributor.epochDuration()).to.equal(604800n); // 7 days
            expect(await distributor.communityPool()).to.equal(communityPool.address);
            expect(await distributor.protocolReserveAddress()).to.equal(protocolReserve.address);
        });

        it("should have correct distribution shares", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor } = await networkHelpers.loadFixture(deployDistributorFixture);

            const [agent, bonus, community, reserve] = await distributor.getDistributionShares();
            expect(agent).to.equal(7000n);
            expect(bonus).to.equal(1500n);
            expect(community).to.equal(1000n);
            expect(reserve).to.equal(500n);
        });
    });

    describe("Revenue Deposit", function () {
        it("should deposit revenue", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor, agent1, ethers } = await networkHelpers.loadFixture(deployDistributorFixture);

            await distributor.connect(agent1).depositRevenue(ethers.parseUnits("1000", 6));

            expect(await distributor.getCurrentEpochTotalRevenue()).to.equal(ethers.parseUnits("1000", 6));
            expect(await distributor.totalRevenueReceived()).to.equal(ethers.parseUnits("1000", 6));
        });

        it("should revert zero deposit", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor, agent1 } = await networkHelpers.loadFixture(deployDistributorFixture);

            await expect(
                distributor.connect(agent1).depositRevenue(0)
            ).to.be.revertedWith("Zero amount");
        });
    });

    describe("Agent Revenue Recording", function () {
        it("should record agent revenue", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor, agent1, ethers } = await networkHelpers.loadFixture(deployDistributorFixture);

            await distributor.connect(agent1).recordAgentRevenue(agent1.address, ethers.parseUnits("500", 6));

            expect(await distributor.getEpochRevenue(1, agent1.address)).to.equal(ethers.parseUnits("500", 6));
        });

        it("should revert zero amount", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor, agent1 } = await networkHelpers.loadFixture(deployDistributorFixture);

            await expect(
                distributor.connect(agent1).recordAgentRevenue(agent1.address, 0)
            ).to.be.revertedWith("Zero amount");
        });
    });

    describe("Epoch Management", function () {
        it("should revert advance before epoch end", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor } = await networkHelpers.loadFixture(deployDistributorFixture);

            await expect(
                distributor.advanceEpoch()
            ).to.be.revertedWith("Epoch not ended");
        });
    });

    describe("Claiming", function () {
        it("should revert claim with nothing to claim", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor, agent1 } = await networkHelpers.loadFixture(deployDistributorFixture);

            await expect(
                distributor.connect(agent1).claimRevenue()
            ).to.be.revertedWith("Nothing to claim");
        });

        it("should revert partial claim with insufficient balance", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor, agent1, ethers } = await networkHelpers.loadFixture(deployDistributorFixture);

            await expect(
                distributor.connect(agent1).claimRevenuePartial(ethers.parseUnits("100", 6))
            ).to.be.revertedWith("Insufficient balance");
        });

        it("should revert zero partial claim", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor, agent1 } = await networkHelpers.loadFixture(deployDistributorFixture);

            await expect(
                distributor.connect(agent1).claimRevenuePartial(0)
            ).to.be.revertedWith("Zero amount");
        });
    });

    describe("Admin Functions", function () {
        it("should set distribution shares", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor } = await networkHelpers.loadFixture(deployDistributorFixture);

            await distributor.setDistributionShares(6000, 2000, 1000, 1000);
            const [agent, bonus, community, reserve] = await distributor.getDistributionShares();
            expect(agent).to.equal(6000n);
            expect(bonus).to.equal(2000n);
        });

        it("should revert shares not summing to 10000", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor } = await networkHelpers.loadFixture(deployDistributorFixture);

            await expect(
                distributor.setDistributionShares(6000, 2000, 1000, 500)
            ).to.be.revertedWith("Must sum to 10000");
        });

        it("should set epoch duration", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor } = await networkHelpers.loadFixture(deployDistributorFixture);

            await distributor.setEpochDuration(14 * 24 * 3600);
            expect(await distributor.epochDuration()).to.equal(1209600n);
        });

        it("should revert epoch duration too short", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor } = await networkHelpers.loadFixture(deployDistributorFixture);

            await expect(
                distributor.setEpochDuration(3600) // 1 hour < 1 day
            ).to.be.revertedWith("Too short");
        });

        it("should set top agent count", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor } = await networkHelpers.loadFixture(deployDistributorFixture);

            await distributor.setTopAgentCount(10);
            expect(await distributor.topAgentCount()).to.equal(10n);
        });

        it("should set min revenue threshold", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor, ethers } = await networkHelpers.loadFixture(deployDistributorFixture);

            await distributor.setMinRevenueThreshold(ethers.parseUnits("10", 6));
            expect(await distributor.minRevenueThreshold()).to.equal(ethers.parseUnits("10", 6));
        });
    });

    describe("View Functions", function () {
        it("should get agent revenue info", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor, agent1, ethers } = await networkHelpers.loadFixture(deployDistributorFixture);

            await distributor.connect(agent1).recordAgentRevenue(agent1.address, ethers.parseUnits("500", 6));

            const info = await distributor.getAgentRevenueInfo(agent1.address);
            expect(info.currentEpochRevenue).to.equal(ethers.parseUnits("500", 6));
            expect(info.claimable).to.equal(0n);
        });

        it("should get time until next epoch", async function () {
            const { networkHelpers } = await network.connect();
            const { distributor } = await networkHelpers.loadFixture(deployDistributorFixture);

            const time = await distributor.getTimeUntilNextEpoch();
            expect(time).to.be.above(0n);
        });
    });
});
