
import { expect } from "chai";
import { network } from "hardhat";

describe("Liquidation Edge Case Tests", function () {
    async function deployFullLendingFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, borrower, liquidator, depositor, treasury] = await ethers.getSigners();

        const MockAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
        const wethFeed = await MockAggregator.deploy(200000000000, 8);
        const usdcFeed = await MockAggregator.deploy(100000000, 8);

        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        const irModel = await InterestRateModel.deploy();

        const LendingPool = await ethers.getContractFactory("LendingPool");
        const pool = await LendingPool.deploy(owner.address, await irModel.getAddress(), treasury.address);

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

        const AToken = await ethers.getContractFactory("AToken");
        const wethAToken = await AToken.deploy("AION WETH", "aWETH", await weth.getAddress(), await pool.getAddress(), owner.address);
        const VariableDebtToken = await ethers.getContractFactory("VariableDebtToken");
        const wethDebtToken = await VariableDebtToken.deploy("AION Debt WETH", "dWETH", await weth.getAddress(), await pool.getAddress(), owner.address);

        const usdcAToken = await AToken.deploy("AION USDC", "aUSDC", await usdc.getAddress(), await pool.getAddress(), owner.address);
        const usdcDebtToken = await VariableDebtToken.deploy("AION Debt USDC", "dUSDC", await usdc.getAddress(), await pool.getAddress(), owner.address);

        await pool.initReserve(
            await weth.getAddress(), await wethAToken.getAddress(), await wethDebtToken.getAddress(),
            await wethFeed.getAddress(), 1000, 8000, 8500, 10500, 18
        );
        await pool.initReserve(
            await usdc.getAddress(), await usdcAToken.getAddress(), await usdcDebtToken.getAddress(),
            await usdcFeed.getAddress(), 1000, 8000, 8500, 10500, 6
        );

        const usdcLiquidity = ethers.parseUnits("1000000", 6);
        await usdc.mint(depositor.address, usdcLiquidity);
        await usdc.connect(depositor).approve(await pool.getAddress(), usdcLiquidity);
        await pool.connect(depositor).deposit(await usdc.getAddress(), usdcLiquidity, depositor.address);

        const wethLiquidity = ethers.parseEther("500");
        await weth.mint(depositor.address, wethLiquidity);
        await weth.connect(depositor).approve(await pool.getAddress(), wethLiquidity);
        await pool.connect(depositor).deposit(await weth.getAddress(), wethLiquidity, depositor.address);

        return {
            pool, weth, usdc, wethAToken, usdcAToken, wethDebtToken, usdcDebtToken,
            wethFeed, usdcFeed, owner, borrower, liquidator, depositor, treasury, ethers, connection
        };
    }

    async function setupBorrowerPosition(
        pool: any, weth: any, usdc: any, borrower: any,
        wethDeposit: bigint, usdcBorrow: bigint
    ) {
        await weth.mint(borrower.address, wethDeposit);
        await weth.connect(borrower).approve(await pool.getAddress(), wethDeposit);
        await pool.connect(borrower).deposit(await weth.getAddress(), wethDeposit, borrower.address);
        await pool.connect(borrower).setUserUseReserveAsCollateral(await weth.getAddress(), true);
        await pool.connect(borrower).borrow(await usdc.getAddress(), usdcBorrow, borrower.address);
    }

    describe("Healthy Position Protection", function () {
        it("Should revert liquidation on healthy position", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, borrower, liquidator } = await networkHelpers.loadFixture(deployFullLendingFixture);

            await setupBorrowerPosition(pool, weth, usdc, borrower, ethers.parseEther("10"), ethers.parseUnits("5000", 6));

            const hf = await pool.getHealthFactor(borrower.address);
            expect(hf).to.be.gt(ethers.parseEther("1"));

            const repayAmount = ethers.parseUnits("1000", 6);
            await usdc.mint(liquidator.address, repayAmount);
            await usdc.connect(liquidator).approve(await pool.getAddress(), repayAmount);

            try {
                await pool.connect(liquidator).liquidate(
                    await weth.getAddress(), await usdc.getAddress(), borrower.address, repayAmount, false
                );
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("HEALTH_FACTOR_NOT_BELOW_THRESHOLD");
            }
        });
    });

    describe("Close Factor Enforcement", function () {
        it("Should enforce 50% close factor - cap debt coverage", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, wethFeed, borrower, liquidator, usdcDebtToken } =
                await networkHelpers.loadFixture(deployFullLendingFixture);

            await setupBorrowerPosition(pool, weth, usdc, borrower, ethers.parseEther("10"), ethers.parseUnits("13000", 6));
            await wethFeed.setAnswer(100000000000); // $1000

            const hf = await pool.getHealthFactor(borrower.address);
            expect(hf).to.be.lt(ethers.parseEther("1"));

            const fullDebt = ethers.parseUnits("13000", 6);
            await usdc.mint(liquidator.address, fullDebt);
            await usdc.connect(liquidator).approve(await pool.getAddress(), fullDebt);

            await pool.connect(liquidator).liquidate(
                await weth.getAddress(), await usdc.getAddress(), borrower.address, fullDebt, false
            );

            const reserve = await pool.getReserveData(await usdc.getAddress());
            const remainingDebt = await usdcDebtToken.getBalance(borrower.address, reserve.variableBorrowIndex);
            // 50% of ~13000 = ~6500 remaining
            expect(remainingDebt).to.be.closeTo(ethers.parseUnits("6500", 6), ethers.parseUnits("10", 6));
        });
    });

    describe("Health Factor Boundary", function () {
        it("Should not allow liquidation at HF >= 1.0", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, borrower, liquidator } = await networkHelpers.loadFixture(deployFullLendingFixture);

            // HF = (10 * 2000 * 0.85) / 16000 ~ 1.0625 (safely above 1.0)
            await setupBorrowerPosition(pool, weth, usdc, borrower, ethers.parseEther("10"), ethers.parseUnits("16000", 6));

            const hf = await pool.getHealthFactor(borrower.address);
            expect(hf).to.be.gte(ethers.parseEther("1"));

            const repayAmount = ethers.parseUnits("1000", 6);
            await usdc.mint(liquidator.address, repayAmount);
            await usdc.connect(liquidator).approve(await pool.getAddress(), repayAmount);

            try {
                await pool.connect(liquidator).liquidate(
                    await weth.getAddress(), await usdc.getAddress(), borrower.address, repayAmount, false
                );
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("HEALTH_FACTOR_NOT_BELOW_THRESHOLD");
            }
        });

        it("Should allow liquidation at HF just below 1.0", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, wethFeed, borrower, liquidator } =
                await networkHelpers.loadFixture(deployFullLendingFixture);

            await setupBorrowerPosition(pool, weth, usdc, borrower, ethers.parseEther("10"), ethers.parseUnits("13000", 6));
            await wethFeed.setAnswer(152900000000); // $1529

            const hf = await pool.getHealthFactor(borrower.address);
            expect(hf).to.be.lt(ethers.parseEther("1"));

            const repayAmount = ethers.parseUnits("1000", 6);
            await usdc.mint(liquidator.address, repayAmount);
            await usdc.connect(liquidator).approve(await pool.getAddress(), repayAmount);

            // Should not revert
            await pool.connect(liquidator).liquidate(
                await weth.getAddress(), await usdc.getAddress(), borrower.address, repayAmount, false
            );
        });
    });

    describe("Interest-Driven Liquidation", function () {
        it("Should become liquidatable through interest accrual alone", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { pool, weth, usdc, borrower, liquidator, depositor, ethers, connection: fixtureConn } =
                await networkHelpers.loadFixture(deployFullLendingFixture);
            const fixtureHelpers = fixtureConn.networkHelpers;

            // Borrow very close to max so interest pushes HF below 1.0
            await setupBorrowerPosition(pool, weth, usdc, borrower, ethers.parseEther("10"), ethers.parseUnits("16990", 6));

            const hfBefore = await pool.getHealthFactor(borrower.address);
            expect(hfBefore).to.be.gte(ethers.parseEther("1"));

            await fixtureHelpers.time.increase(2 * 365 * 24 * 3600); // 2 years

            await usdc.mint(depositor.address, ethers.parseUnits("1", 6));
            await usdc.connect(depositor).approve(await pool.getAddress(), ethers.parseUnits("1", 6));
            await pool.connect(depositor).deposit(await usdc.getAddress(), ethers.parseUnits("1", 6), depositor.address);

            const hfAfter = await pool.getHealthFactor(borrower.address);
            expect(hfAfter).to.be.lt(ethers.parseEther("1"));

            const repayAmount = ethers.parseUnits("5000", 6);
            await usdc.mint(liquidator.address, repayAmount);
            await usdc.connect(liquidator).approve(await pool.getAddress(), repayAmount);

            await pool.connect(liquidator).liquidate(
                await weth.getAddress(), await usdc.getAddress(), borrower.address, repayAmount, false
            );
        });
    });

    describe("Liquidation Output Type", function () {
        it("Should allow liquidator to receive aTokens", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, wethFeed, wethAToken, borrower, liquidator } =
                await networkHelpers.loadFixture(deployFullLendingFixture);

            await setupBorrowerPosition(pool, weth, usdc, borrower, ethers.parseEther("10"), ethers.parseUnits("13000", 6));
            await wethFeed.setAnswer(100000000000);

            const repayAmount = ethers.parseUnits("3000", 6);
            await usdc.mint(liquidator.address, repayAmount);
            await usdc.connect(liquidator).approve(await pool.getAddress(), repayAmount);

            const scaledBefore = await wethAToken.balanceOfScaled(liquidator.address);

            await pool.connect(liquidator).liquidate(
                await weth.getAddress(), await usdc.getAddress(), borrower.address, repayAmount, true
            );

            const scaledAfter = await wethAToken.balanceOfScaled(liquidator.address);
            expect(scaledAfter).to.be.gt(scaledBefore);
        });

        it("Should allow liquidator to receive underlying tokens", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, wethFeed, borrower, liquidator } =
                await networkHelpers.loadFixture(deployFullLendingFixture);

            await setupBorrowerPosition(pool, weth, usdc, borrower, ethers.parseEther("10"), ethers.parseUnits("13000", 6));
            await wethFeed.setAnswer(100000000000);

            const repayAmount = ethers.parseUnits("3000", 6);
            await usdc.mint(liquidator.address, repayAmount);
            await usdc.connect(liquidator).approve(await pool.getAddress(), repayAmount);

            const wethBalBefore = await weth.balanceOf(liquidator.address);

            await pool.connect(liquidator).liquidate(
                await weth.getAddress(), await usdc.getAddress(), borrower.address, repayAmount, false
            );

            const wethBalAfter = await weth.balanceOf(liquidator.address);
            expect(wethBalAfter).to.be.gt(wethBalBefore);
        });
    });

    describe("Liquidation Bonus", function () {
        it("Should give liquidator the correct bonus (5%)", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, wethFeed, borrower, liquidator } =
                await networkHelpers.loadFixture(deployFullLendingFixture);

            await setupBorrowerPosition(pool, weth, usdc, borrower, ethers.parseEther("10"), ethers.parseUnits("13000", 6));
            await wethFeed.setAnswer(100000000000); // $1000

            const debtToCover = ethers.parseUnits("2000", 6);
            await usdc.mint(liquidator.address, debtToCover);
            await usdc.connect(liquidator).approve(await pool.getAddress(), debtToCover);

            const wethBalBefore = await weth.balanceOf(liquidator.address);

            await pool.connect(liquidator).liquidate(
                await weth.getAddress(), await usdc.getAddress(), borrower.address, debtToCover, false
            );

            const wethBalAfter = await weth.balanceOf(liquidator.address);
            const received = wethBalAfter - wethBalBefore;
            // $2000 / $1000 = 2 ETH * 1.05 bonus = 2.1 ETH
            expect(received).to.be.closeTo(ethers.parseEther("2.1"), ethers.parseEther("0.01"));
        });
    });

    describe("Self-Liquidation", function () {
        it("Should allow self-liquidation", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, wethFeed, borrower } =
                await networkHelpers.loadFixture(deployFullLendingFixture);

            await setupBorrowerPosition(pool, weth, usdc, borrower, ethers.parseEther("10"), ethers.parseUnits("13000", 6));
            await wethFeed.setAnswer(100000000000);

            const repayAmount = ethers.parseUnits("3000", 6);
            await usdc.mint(borrower.address, repayAmount);
            await usdc.connect(borrower).approve(await pool.getAddress(), repayAmount);

            await pool.connect(borrower).liquidate(
                await weth.getAddress(), await usdc.getAddress(), borrower.address, repayAmount, false
            );
        });
    });

    describe("Withdrawal Health Factor Validation", function () {
        it("Should prevent withdrawal that would make position liquidatable", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, borrower } = await networkHelpers.loadFixture(deployFullLendingFixture);

            await setupBorrowerPosition(pool, weth, usdc, borrower, ethers.parseEther("10"), ethers.parseUnits("13000", 6));

            try {
                await pool.connect(borrower).withdraw(await weth.getAddress(), ethers.parseEther("5"), borrower.address);
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("WITHDRAWAL_WOULD_BREAK_HF");
            }
        });

        it("Should allow partial withdrawal that maintains health factor", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, borrower } = await networkHelpers.loadFixture(deployFullLendingFixture);

            await setupBorrowerPosition(pool, weth, usdc, borrower, ethers.parseEther("10"), ethers.parseUnits("5000", 6));

            await pool.connect(borrower).withdraw(await weth.getAddress(), ethers.parseEther("1"), borrower.address);
        });
    });
});
