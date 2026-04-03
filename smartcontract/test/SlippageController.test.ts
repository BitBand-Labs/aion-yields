import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("SlippageController", function () {
    async function deploySlippageFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, strategy1, strategy2, user1] = await ethers.getSigners();

        const SlippageController = await ethers.getContractFactory("SlippageController");
        const controller = await SlippageController.deploy(owner.address);

        return { controller, owner, strategy1, strategy2, user1, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct defaults", async function () {
            const { networkHelpers } = await network.connect();
            const { controller, owner } = await networkHelpers.loadFixture(deploySlippageFixture);

            expect(await controller.owner()).to.equal(owner.address);
            expect(await controller.defaultSlippageBps()).to.equal(50n); // 0.5%
            expect(await controller.MAX_SLIPPAGE()).to.equal(1000n); // 10%
        });
    });

    describe("Default Slippage", function () {
        it("should set default slippage", async function () {
            const { networkHelpers } = await network.connect();
            const { controller } = await networkHelpers.loadFixture(deploySlippageFixture);

            await controller.setDefaultSlippage(100);
            expect(await controller.defaultSlippageBps()).to.equal(100n);
        });

        it("should revert exceeding max slippage", async function () {
            const { networkHelpers } = await network.connect();
            const { controller } = await networkHelpers.loadFixture(deploySlippageFixture);

            await expect(
                controller.setDefaultSlippage(1001)
            ).to.be.revertedWith("Exceeds max slippage");
        });

        it("should only allow owner", async function () {
            const { networkHelpers } = await network.connect();
            const { controller, user1 } = await networkHelpers.loadFixture(deploySlippageFixture);

            await expect(
                controller.connect(user1).setDefaultSlippage(100)
            ).to.be.reverted;
        });
    });

    describe("Strategy Slippage", function () {
        it("should set custom slippage for strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { controller, strategy1 } = await networkHelpers.loadFixture(deploySlippageFixture);

            await controller.setStrategySlippage(strategy1.address, 200);

            expect(await controller.getSlippage(strategy1.address)).to.equal(200n);
            expect(await controller.hasCustomSlippage(strategy1.address)).to.be.true;
        });

        it("should return default for strategy without custom", async function () {
            const { networkHelpers } = await network.connect();
            const { controller, strategy1 } = await networkHelpers.loadFixture(deploySlippageFixture);

            expect(await controller.getSlippage(strategy1.address)).to.equal(50n);
        });

        it("should revert exceeding max slippage", async function () {
            const { networkHelpers } = await network.connect();
            const { controller, strategy1 } = await networkHelpers.loadFixture(deploySlippageFixture);

            await expect(
                controller.setStrategySlippage(strategy1.address, 1001)
            ).to.be.revertedWith("Exceeds max slippage");
        });
    });

    describe("Slippage Validation", function () {
        it("should calculate min output correctly", async function () {
            const { networkHelpers } = await network.connect();
            const { controller, strategy1, ethers } = await networkHelpers.loadFixture(deploySlippageFixture);

            // Default 0.5% slippage (50 bps)
            const expected = ethers.parseUnits("1000", 6);
            const minOutput = await controller.getMinOutput(strategy1.address, expected);

            // 1000 - (1000 * 50 / 10000) = 1000 - 5 = 995
            expect(minOutput).to.equal(ethers.parseUnits("995", 6));
        });

        it("should check slippage passes", async function () {
            const { networkHelpers } = await network.connect();
            const { controller, strategy1, ethers } = await networkHelpers.loadFixture(deploySlippageFixture);

            const expected = ethers.parseUnits("1000", 6);
            const actual = ethers.parseUnits("998", 6);

            expect(await controller.checkSlippage(strategy1.address, expected, actual)).to.be.true;
        });

        it("should check slippage fails", async function () {
            const { networkHelpers } = await network.connect();
            const { controller, strategy1, ethers } = await networkHelpers.loadFixture(deploySlippageFixture);

            const expected = ethers.parseUnits("1000", 6);
            const actual = ethers.parseUnits("990", 6); // 1% slippage > 0.5% threshold

            expect(await controller.checkSlippage(strategy1.address, expected, actual)).to.be.false;
        });

        it("should enforce slippage within tolerance", async function () {
            const { networkHelpers } = await network.connect();
            const { controller, strategy1, ethers } = await networkHelpers.loadFixture(deploySlippageFixture);

            const expected = ethers.parseUnits("1000", 6);
            const actual = ethers.parseUnits("998", 6);

            // Should not revert
            await controller.enforceSlippage(strategy1.address, expected, actual);
        });

        it("should revert when slippage exceeded", async function () {
            const { networkHelpers } = await network.connect();
            const { controller, strategy1, ethers } = await networkHelpers.loadFixture(deploySlippageFixture);

            const expected = ethers.parseUnits("1000", 6);
            const actual = ethers.parseUnits("990", 6);

            await expect(
                controller.enforceSlippage(strategy1.address, expected, actual)
            ).to.be.revertedWith("Slippage exceeded");
        });

        it("should use custom slippage for strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { controller, strategy1, ethers } = await networkHelpers.loadFixture(deploySlippageFixture);

            // Set 2% custom slippage
            await controller.setStrategySlippage(strategy1.address, 200);

            const expected = ethers.parseUnits("1000", 6);
            const actual = ethers.parseUnits("985", 6); // 1.5% slippage, within 2%

            expect(await controller.checkSlippage(strategy1.address, expected, actual)).to.be.true;
        });
    });
});
