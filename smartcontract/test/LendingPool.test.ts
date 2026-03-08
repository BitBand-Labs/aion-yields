
import { expect } from "chai";
import { network } from "hardhat";

describe("AION Yield LendingPool", function () {
    async function deployLendingPoolFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, user1, user2, treasury] = await ethers.getSigners();

        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        const irModel = await InterestRateModel.deploy();

        const LendingPool = await ethers.getContractFactory("LendingPool");
        const pool = await LendingPool.deploy(owner.address, await irModel.getAddress(), treasury.address);

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

        const AToken = await ethers.getContractFactory("AToken");
        const wethAToken = await AToken.deploy(
            "AION WETH", "aWETH", await weth.getAddress(), await pool.getAddress(), owner.address
        );

        const VariableDebtToken = await ethers.getContractFactory("VariableDebtToken");
        const wethDebtToken = await VariableDebtToken.deploy(
            "AION Debt WETH", "dWETH", await weth.getAddress(), await pool.getAddress(), owner.address
        );

        await pool.initReserve(
            await weth.getAddress(), await wethAToken.getAddress(), await wethDebtToken.getAddress(),
            ethers.ZeroAddress, 1000, 8000, 8500, 10500, 18
        );

        return { pool, irModel, weth, wethAToken, wethDebtToken, owner, user1, user2, treasury, ethers, connection };
    }

    describe("Initialization", function () {
        it("Should initialize the reserve correctly", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { pool, weth, wethAToken } = await networkHelpers.loadFixture(deployLendingPoolFixture);
            const reserve = await pool.getReserveData(await weth.getAddress());
            expect(reserve.aTokenAddress).to.equal(await wethAToken.getAddress());
            expect(reserve.isActive).to.be.true;
        });
    });

    describe("Deposit", function () {
        it("Should allow users to deposit assets", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { pool, weth, wethAToken, user1, ethers } = await networkHelpers.loadFixture(deployLendingPoolFixture);
            const amount = ethers.parseEther("10");

            await weth.mint(user1.address, amount);
            await weth.connect(user1).approve(await pool.getAddress(), amount);
            await pool.connect(user1).deposit(await weth.getAddress(), amount, user1.address);

            const reserve = await pool.getReserveData(await weth.getAddress());
            const userBalance = await wethAToken.getBalance(user1.address, reserve.liquidityIndex);
            expect(userBalance).to.equal(amount);
            expect(reserve.totalSupply).to.equal(amount);
        });
    });

    describe("Borrow & Interest", function () {
        it("Should accrue interest over time", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { pool, weth, wethAToken, wethDebtToken, user1, user2, ethers } =
                await networkHelpers.loadFixture(deployLendingPoolFixture);

            const depositAmount = ethers.parseEther("100");
            await weth.mint(user1.address, depositAmount);
            await weth.connect(user1).approve(await pool.getAddress(), depositAmount);
            await pool.connect(user1).deposit(await weth.getAddress(), depositAmount, user1.address);
            await pool.connect(user1).setUserUseReserveAsCollateral(await weth.getAddress(), true);

            const borrowAmount = ethers.parseEther("50");
            await pool.connect(user1).borrow(await weth.getAddress(), borrowAmount, user1.address);

            const initialDebt = await wethDebtToken.getBalance(user1.address, ethers.parseUnits("1", 27));
            expect(initialDebt).to.equal(borrowAmount);

            await networkHelpers.time.increase(31536000);

            await weth.mint(user2.address, ethers.parseEther("1"));
            await weth.connect(user2).approve(await pool.getAddress(), ethers.parseEther("1"));
            await pool.connect(user2).deposit(await weth.getAddress(), ethers.parseEther("1"), user2.address);

            const reserve = await pool.getReserveData(await weth.getAddress());
            const newDebt = await wethDebtToken.getBalance(user1.address, reserve.variableBorrowIndex);

            console.log("Initial Debt:", ethers.formatEther(initialDebt));
            console.log("New Debt after 1 year:", ethers.formatEther(newDebt));
            console.log("Borrow Index:", reserve.variableBorrowIndex.toString());

            expect(newDebt).to.be.gt(initialDebt);
        });
    });

    describe("Repay", function () {
        it("Should allow users to repay debt", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { pool, weth, wethDebtToken, user1, ethers } =
                await networkHelpers.loadFixture(deployLendingPoolFixture);

            const amount = ethers.parseEther("10");
            await weth.mint(user1.address, amount * 2n);
            await weth.connect(user1).approve(await pool.getAddress(), amount * 2n);
            await pool.connect(user1).deposit(await weth.getAddress(), amount, user1.address);
            await pool.connect(user1).setUserUseReserveAsCollateral(await weth.getAddress(), true);

            const borrowAmount = ethers.parseEther("5");
            await pool.connect(user1).borrow(await weth.getAddress(), borrowAmount, user1.address);

            const repayAmount = ethers.parseEther("2.5");
            await weth.connect(user1).approve(await pool.getAddress(), repayAmount);
            await pool.connect(user1).repay(await weth.getAddress(), repayAmount, user1.address);

            const reserve = await pool.getReserveData(await weth.getAddress());
            const remainingDebt = await wethDebtToken.getBalance(user1.address, reserve.variableBorrowIndex);

            expect(remainingDebt).to.be.closeTo(ethers.parseEther("2.5"), ethers.parseEther("0.0001"));
        });
    });
});
