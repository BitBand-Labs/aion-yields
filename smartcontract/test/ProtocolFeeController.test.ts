import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("ProtocolFeeController", function () {
    async function deployFeeFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, treasury, insurance, devFund, vault1, strategy1, user1] = await ethers.getSigners();

        const ProtocolFeeController = await ethers.getContractFactory("ProtocolFeeController");
        const feeController = await ProtocolFeeController.deploy(
            owner.address, treasury.address, insurance.address, devFund.address
        );

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

        return { feeController, usdc, owner, treasury, insurance, devFund, vault1, strategy1, user1, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, owner, treasury, insurance, devFund } = await networkHelpers.loadFixture(deployFeeFixture);

            expect(await feeController.owner()).to.equal(owner.address);
            expect(await feeController.treasury()).to.equal(treasury.address);
            expect(await feeController.insuranceFund()).to.equal(insurance.address);
            expect(await feeController.developmentFund()).to.equal(devFund.address);
            expect(await feeController.defaultPerformanceFee()).to.equal(1500n);
            expect(await feeController.defaultManagementFee()).to.equal(200n);
        });

        it("should revert with zero treasury", async function () {
            const { networkHelpers } = await network.connect();
            const { owner, insurance, devFund, ethers } = await networkHelpers.loadFixture(deployFeeFixture);

            const ProtocolFeeController = await ethers.getContractFactory("ProtocolFeeController");
            await expect(
                ProtocolFeeController.deploy(owner.address, ethers.ZeroAddress, insurance.address, devFund.address)
            ).to.be.revertedWith("Invalid treasury");
        });
    });

    describe("Global Fee Configuration", function () {
        it("should set default performance fee", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController } = await networkHelpers.loadFixture(deployFeeFixture);

            await feeController.setDefaultPerformanceFee(2000);
            expect(await feeController.defaultPerformanceFee()).to.equal(2000n);
        });

        it("should revert performance fee exceeding max", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController } = await networkHelpers.loadFixture(deployFeeFixture);

            await expect(
                feeController.setDefaultPerformanceFee(5001)
            ).to.be.revertedWith("Exceeds max");
        });

        it("should set default management fee", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController } = await networkHelpers.loadFixture(deployFeeFixture);

            await feeController.setDefaultManagementFee(300);
            expect(await feeController.defaultManagementFee()).to.equal(300n);
        });

        it("should revert management fee exceeding max", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController } = await networkHelpers.loadFixture(deployFeeFixture);

            await expect(
                feeController.setDefaultManagementFee(501)
            ).to.be.revertedWith("Exceeds max");
        });
    });

    describe("Per-Vault Fee Overrides", function () {
        it("should set vault fee override", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, vault1 } = await networkHelpers.loadFixture(deployFeeFixture);

            await feeController.setVaultFeeOverride(vault1.address, 1000, 100);

            expect(await feeController.getVaultPerformanceFee(vault1.address)).to.equal(1000n);
            expect(await feeController.getVaultManagementFee(vault1.address)).to.equal(100n);
        });

        it("should remove vault fee override", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, vault1 } = await networkHelpers.loadFixture(deployFeeFixture);

            await feeController.setVaultFeeOverride(vault1.address, 1000, 100);
            await feeController.removeVaultFeeOverride(vault1.address);

            expect(await feeController.getVaultPerformanceFee(vault1.address)).to.equal(1500n); // default
            expect(await feeController.getVaultManagementFee(vault1.address)).to.equal(200n); // default
        });

        it("should revert exceeding max fees", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, vault1 } = await networkHelpers.loadFixture(deployFeeFixture);

            await expect(
                feeController.setVaultFeeOverride(vault1.address, 5001, 200)
            ).to.be.revertedWith("Exceeds max performance fee");

            await expect(
                feeController.setVaultFeeOverride(vault1.address, 1500, 501)
            ).to.be.revertedWith("Exceeds max management fee");
        });
    });

    describe("Per-Strategy Fee Overrides", function () {
        it("should set strategy fee override", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, strategy1 } = await networkHelpers.loadFixture(deployFeeFixture);

            await feeController.setStrategyFeeOverride(strategy1.address, 2000);
            expect(await feeController.getStrategyPerformanceFee(strategy1.address)).to.equal(2000n);
        });

        it("should remove strategy fee override", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, strategy1 } = await networkHelpers.loadFixture(deployFeeFixture);

            await feeController.setStrategyFeeOverride(strategy1.address, 2000);
            await feeController.removeStrategyFeeOverride(strategy1.address);

            expect(await feeController.getStrategyPerformanceFee(strategy1.address)).to.equal(1500n);
        });
    });

    describe("Fee Distribution", function () {
        it("should distribute fees correctly", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, usdc, treasury, insurance, devFund, ethers } = await networkHelpers.loadFixture(deployFeeFixture);

            // Mint fees to the controller
            const feeAmount = ethers.parseUnits("10000", 6);
            await usdc.mint(await feeController.getAddress(), feeAmount);

            const treasuryBefore = await usdc.balanceOf(treasury.address);
            const insuranceBefore = await usdc.balanceOf(insurance.address);
            const devBefore = await usdc.balanceOf(devFund.address);

            await feeController.distributeFees(await usdc.getAddress());

            const treasuryAfter = await usdc.balanceOf(treasury.address);
            const insuranceAfter = await usdc.balanceOf(insurance.address);
            const devAfter = await usdc.balanceOf(devFund.address);

            // 50% to treasury = 5000
            expect(treasuryAfter - treasuryBefore).to.equal(ethers.parseUnits("5000", 6));
            // 30% to insurance = 3000
            expect(insuranceAfter - insuranceBefore).to.equal(ethers.parseUnits("3000", 6));
            // 20% to dev = 2000
            expect(devAfter - devBefore).to.equal(ethers.parseUnits("2000", 6));
        });

        it("should revert with no fees", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, usdc } = await networkHelpers.loadFixture(deployFeeFixture);

            await expect(
                feeController.distributeFees(await usdc.getAddress())
            ).to.be.revertedWith("No fees to distribute");
        });
    });

    describe("Distribution Ratios", function () {
        it("should update distribution ratios", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController } = await networkHelpers.loadFixture(deployFeeFixture);

            await feeController.setDistributionRatios(6000, 2000, 2000);
            expect(await feeController.treasuryShare()).to.equal(6000n);
            expect(await feeController.insuranceShare()).to.equal(2000n);
            expect(await feeController.developmentShare()).to.equal(2000n);
        });

        it("should revert if ratios dont sum to 10000", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController } = await networkHelpers.loadFixture(deployFeeFixture);

            await expect(
                feeController.setDistributionRatios(5000, 3000, 1000)
            ).to.be.revertedWith("Shares must sum to 10000");
        });
    });

    describe("Address Management", function () {
        it("should update treasury", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, user1 } = await networkHelpers.loadFixture(deployFeeFixture);

            await feeController.setTreasury(user1.address);
            expect(await feeController.treasury()).to.equal(user1.address);
        });

        it("should revert zero treasury", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, ethers } = await networkHelpers.loadFixture(deployFeeFixture);

            await expect(
                feeController.setTreasury(ethers.ZeroAddress)
            ).to.be.revertedWith("Invalid address");
        });

        it("should update insurance fund", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, user1 } = await networkHelpers.loadFixture(deployFeeFixture);

            await feeController.setInsuranceFund(user1.address);
            expect(await feeController.insuranceFund()).to.equal(user1.address);
        });

        it("should update development fund", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, user1 } = await networkHelpers.loadFixture(deployFeeFixture);

            await feeController.setDevelopmentFund(user1.address);
            expect(await feeController.developmentFund()).to.equal(user1.address);
        });
    });

    describe("View Functions", function () {
        it("should get pending fees", async function () {
            const { networkHelpers } = await network.connect();
            const { feeController, usdc, ethers } = await networkHelpers.loadFixture(deployFeeFixture);

            await usdc.mint(await feeController.getAddress(), ethers.parseUnits("1000", 6));
            expect(await feeController.getPendingFees(await usdc.getAddress())).to.equal(ethers.parseUnits("1000", 6));
        });
    });
});
