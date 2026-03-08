
import { expect } from "chai";
import { network } from "hardhat";

describe("Oracle Manipulation Tests", function () {
    async function deployOracleFixture() {
        const connection = await network.connect();
        const { ethers, networkHelpers } = connection;
        const [owner, user1, user2, treasury, attacker] = await ethers.getSigners();

        const MockAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
        const primaryFeed = await MockAggregator.deploy(200000000000, 8);
        const fallbackFeed = await MockAggregator.deploy(200000000000, 8);

        const ChainlinkPriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle");
        const oracle = await ChainlinkPriceOracle.deploy(owner.address);

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);

        await oracle.setPriceFeed(
            await weth.getAddress(), await primaryFeed.getAddress(),
            await fallbackFeed.getAddress(), 3600, 8
        );

        return { oracle, primaryFeed, fallbackFeed, weth, owner, user1, attacker, ethers, networkHelpers };
    }

    async function deployLendingPoolWithOracleFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, user1, user2, liquidator, treasury] = await ethers.getSigners();

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

        return {
            pool, weth, usdc, wethAToken, usdcAToken, wethDebtToken, usdcDebtToken,
            wethFeed, usdcFeed, owner, user1, user2, liquidator, treasury, ethers, connection
        };
    }

    describe("Stale Price Detection", function () {
        it("Should detect stale primary feed and use fallback", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { oracle, primaryFeed, fallbackFeed, weth } = await networkHelpers.loadFixture(deployOracleFixture);

            // Make primary stale by setting its updatedAt to 0
            await primaryFeed.setUpdatedAt(0);
            await fallbackFeed.setAnswer(190000000000);

            const [price2, isValid2] = await oracle.getAssetPrice(await weth.getAddress());
            expect(isValid2).to.be.true;
            expect(price2).to.equal(190000000000n);
        });

        it("Should return invalid when both feeds are stale", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { oracle, primaryFeed, fallbackFeed, weth } = await networkHelpers.loadFixture(deployOracleFixture);

            // Make both feeds stale
            await primaryFeed.setUpdatedAt(0);
            await fallbackFeed.setUpdatedAt(0);

            const [, isValid] = await oracle.getAssetPrice(await weth.getAddress());
            expect(isValid).to.be.false;
        });

        it("Should return invalid for unconfigured assets", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { oracle } = await networkHelpers.loadFixture(deployOracleFixture);
            const randomAddr = ethers.Wallet.createRandom().address;
            const [price, isValid] = await oracle.getAssetPrice(randomAddr);
            expect(price).to.equal(0n);
            expect(isValid).to.be.false;
        });
    });

    describe("Zero / Negative Price Handling", function () {
        it("Should reject zero price from aggregator and fall back", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { oracle, primaryFeed, weth } = await networkHelpers.loadFixture(deployOracleFixture);

            await primaryFeed.setAnswer(0);
            const [, isValid] = await oracle.getAssetPrice(await weth.getAddress());
            expect(isValid).to.be.true; // Fallback still has valid price
        });

        it("Should reject negative price from aggregator", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { oracle, primaryFeed, fallbackFeed, weth } = await networkHelpers.loadFixture(deployOracleFixture);

            await primaryFeed.setAnswer(-100);
            await fallbackFeed.setAnswer(-200);

            const [, isValid] = await oracle.getAssetPrice(await weth.getAddress());
            expect(isValid).to.be.false;
        });

        it("getAssetPriceOrRevert should revert on stale price with no valid fallback", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { oracle, primaryFeed, fallbackFeed, weth } = await networkHelpers.loadFixture(deployOracleFixture);

            await primaryFeed.setUpdatedAt(0);
            await fallbackFeed.setUpdatedAt(0);

            try {
                await oracle.getAssetPriceOrRevert(await weth.getAddress());
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("Stale price");
            }
        });
    });

    describe("Feed Revert Handling", function () {
        it("Should handle reverting primary feed gracefully", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { oracle, primaryFeed, weth } = await networkHelpers.loadFixture(deployOracleFixture);

            await primaryFeed.setShouldRevert(true);
            const [price, isValid] = await oracle.getAssetPrice(await weth.getAddress());
            expect(isValid).to.be.true;
            expect(price).to.equal(200000000000n);
        });

        it("Should return invalid when both feeds revert", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { oracle, primaryFeed, fallbackFeed, weth } = await networkHelpers.loadFixture(deployOracleFixture);

            await primaryFeed.setShouldRevert(true);
            await fallbackFeed.setShouldRevert(true);

            const [price, isValid] = await oracle.getAssetPrice(await weth.getAddress());
            expect(price).to.equal(0n);
            expect(isValid).to.be.false;
        });
    });

    describe("Decimal Normalization", function () {
        it("Should normalize feed with more decimals than standard", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { oracle, weth, ethers } = await networkHelpers.loadFixture(deployOracleFixture);

            const MockAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
            const answer18 = ethers.parseUnits("2000", 18);
            const feed18 = await MockAggregator.deploy(answer18, 18);

            await oracle.setPriceFeed(await weth.getAddress(), await feed18.getAddress(), ethers.ZeroAddress, 3600, 18);

            const [price, isValid] = await oracle.getAssetPrice(await weth.getAddress());
            expect(isValid).to.be.true;
            // 2000 * 10^18 / 10^(18-8) = 2000 * 10^8
            expect(price).to.equal(ethers.parseUnits("2000", 8));
        });

        it("Should normalize feed with fewer decimals than standard", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { oracle, weth, ethers } = await networkHelpers.loadFixture(deployOracleFixture);

            const MockAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
            const answer6 = ethers.parseUnits("2000", 6);
            const feed6 = await MockAggregator.deploy(answer6, 6);

            await oracle.setPriceFeed(await weth.getAddress(), await feed6.getAddress(), ethers.ZeroAddress, 3600, 6);

            const [price, isValid] = await oracle.getAssetPrice(await weth.getAddress());
            expect(isValid).to.be.true;
            // 2000 * 10^6 * 10^(8-6) = 2000 * 10^8
            expect(price).to.equal(ethers.parseUnits("2000", 8));
        });
    });

    describe("Price Flash Crash - Impact on LendingPool", function () {
        it("Should make positions liquidatable after sudden price drop", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, wethFeed, user1, user2 } =
                await networkHelpers.loadFixture(deployLendingPoolWithOracleFixture);

            const wethAmount = ethers.parseEther("10");
            await weth.mint(user1.address, wethAmount);
            await weth.connect(user1).approve(await pool.getAddress(), wethAmount);
            await pool.connect(user1).deposit(await weth.getAddress(), wethAmount, user1.address);
            await pool.connect(user1).setUserUseReserveAsCollateral(await weth.getAddress(), true);

            const usdcAmount = ethers.parseUnits("15000", 6);
            await usdc.mint(user2.address, usdcAmount);
            await usdc.connect(user2).approve(await pool.getAddress(), usdcAmount);
            await pool.connect(user2).deposit(await usdc.getAddress(), usdcAmount, user2.address);

            const borrowAmount = ethers.parseUnits("13600", 6);
            await pool.connect(user1).borrow(await usdc.getAddress(), borrowAmount, user1.address);

            const hfBefore = await pool.getHealthFactor(user1.address);
            expect(hfBefore).to.be.gte(ethers.parseEther("1"));

            await wethFeed.setAnswer(80000000000); // ETH crashes to $800

            const hfAfter = await pool.getHealthFactor(user1.address);
            expect(hfAfter).to.be.lt(ethers.parseEther("1"));
        });

        it("Should prevent borrowing after oracle price crash", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { pool, weth, usdc, wethFeed, user1, user2 } =
                await networkHelpers.loadFixture(deployLendingPoolWithOracleFixture);

            const wethAmount = ethers.parseEther("10");
            await weth.mint(user1.address, wethAmount);
            await weth.connect(user1).approve(await pool.getAddress(), wethAmount);
            await pool.connect(user1).deposit(await weth.getAddress(), wethAmount, user1.address);
            await pool.connect(user1).setUserUseReserveAsCollateral(await weth.getAddress(), true);

            const usdcLiq = ethers.parseUnits("50000", 6);
            await usdc.mint(user2.address, usdcLiq);
            await usdc.connect(user2).approve(await pool.getAddress(), usdcLiq);
            await pool.connect(user2).deposit(await usdc.getAddress(), usdcLiq, user2.address);

            await pool.connect(user1).borrow(await usdc.getAddress(), ethers.parseUnits("10000", 6), user1.address);
            await wethFeed.setAnswer(50000000000); // $500

            try {
                await pool.connect(user1).borrow(await usdc.getAddress(), ethers.parseUnits("1", 6), user1.address);
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("HEALTH_FACTOR_TOO_LOW");
            }
        });
    });

    describe("Oracle Admin Access Control", function () {
        it("Should reject non-owner setting price feeds", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { oracle, weth, attacker } = await networkHelpers.loadFixture(deployOracleFixture);

            try {
                await oracle.connect(attacker).setPriceFeed(
                    await weth.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, 3600, 8
                );
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("revert");
            }
        });

        it("Should reject primary feed set to zero address", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { oracle, weth } = await networkHelpers.loadFixture(deployOracleFixture);

            try {
                await oracle.setPriceFeed(await weth.getAddress(), ethers.ZeroAddress, ethers.ZeroAddress, 3600, 8);
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("Invalid primary feed");
            }
        });
    });

    describe("Staleness Edge Cases", function () {
        it("Should use default max staleness when 0 is passed", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { oracle, weth } = await networkHelpers.loadFixture(deployOracleFixture);

            const MockAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
            const feed = await MockAggregator.deploy(200000000000, 8);

            await oracle.setPriceFeed(await weth.getAddress(), await feed.getAddress(), ethers.ZeroAddress, 0, 8);

            const config = await oracle.feedConfigs(await weth.getAddress());
            expect(config.maxStaleness).to.equal(3600n);
        });

        it("Should accept price at exact staleness boundary", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { oracle, weth } = await networkHelpers.loadFixture(deployOracleFixture);

            await networkHelpers.time.increase(3600);
            const [, isValid] = await oracle.getAssetPrice(await weth.getAddress());
            expect(isValid).to.be.true;
        });
    });
});
