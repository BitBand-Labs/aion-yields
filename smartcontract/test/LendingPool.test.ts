
import { expect } from "chai";
import pkg from "hardhat";
const { ethers } = pkg;
import { loadFixture, time } from "@nomicfoundation/hardhat-network-helpers";

describe("AION Yield LendingPool", function () {
    async function deployLendingPoolFixture() {
        const [owner, user1, user2, treasury] = await ethers.getSigners();

        // 1. Deploy MathUtils (as library if needed, but it's internal functions)
        // Note: Our MathUtils uses only internal functions, so it's linked automatically.

        // 2. Deploy InterestRateModel
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        const irModel = await InterestRateModel.deploy();

        // 3. Deploy LendingPool
        const LendingPool = await ethers.getContractFactory("LendingPool");
        const pool = await LendingPool.deploy(owner.address, await irModel.getAddress(), treasury.address);

        // 4. Deploy Mock Assets (WETH and USDC)
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

        // 5. Deploy aToken and DebtToken for WETH
        const AToken = await ethers.getContractFactory("AToken");
        const wethAToken = await AToken.deploy(
            "AION WETH", 
            "aWETH", 
            await weth.getAddress(), 
            await pool.getAddress(), 
            owner.address
        );

        const VariableDebtToken = await ethers.getContractFactory("VariableDebtToken");
        const wethDebtToken = await VariableDebtToken.deploy(
            "AION Debt WETH", 
            "dWETH", 
            await weth.getAddress(), 
            await pool.getAddress(), 
            owner.address
        );

        // 6. Initialize WETH Reserve
        // reserveFactor: 10%, ltv: 80%, liqThreshold: 85%, liqBonus: 105% (5% bonus)
        await pool.initReserve(
            await weth.getAddress(),
            await wethAToken.getAddress(),
            await wethDebtToken.getAddress(),
            ethers.ZeroAddress, // Mock price feed
            1000,
            8000,
            8500,
            10500,
            18
        );

        return { pool, irModel, weth, wethAToken, wethDebtToken, owner, user1, user2, treasury };
    }

    describe("Initialization", function () {
        it("Should initialize the reserve correctly", async function () {
            const { pool, weth, wethAToken } = await loadFixture(deployLendingPoolFixture);
            const reserve = await pool.getReserveData(await weth.getAddress());
            expect(reserve.aTokenAddress).to.equal(await wethAToken.getAddress());
            expect(reserve.isActive).to.be.true;
        });
    });

    describe("Deposit", function () {
        it("Should allow users to deposit assets", async function () {
            const { pool, weth, wethAToken, user1 } = await loadFixture(deployLendingPoolFixture);
            const amount = ethers.parseEther("10");

            await weth.mint(user1.address, amount);
            await weth.connect(user1).approve(await pool.getAddress(), amount);

            await pool.connect(user1).deposit(await weth.getAddress(), amount, user1.address);

            const userBalance = await wethAToken.balanceOf(user1.address);
            expect(userBalance).to.equal(amount);

            const reserve = await pool.getReserveData(await weth.getAddress());
            expect(reserve.totalSupply).to.equal(amount);
        });
    });

    describe("Borrow & Interest", function () {
        it("Should accrue interest over time", async function () {
            const { pool, weth, wethAToken, wethDebtToken, user1, user2 } = await loadFixture(deployLendingPoolFixture);
            
            // User 1 deposits 100 WETH
            const depositAmount = ethers.parseEther("100");
            await weth.mint(user1.address, depositAmount);
            await weth.connect(user1).approve(await pool.getAddress(), depositAmount);
            await pool.connect(user1).deposit(await weth.getAddress(), depositAmount, user1.address);
            await pool.connect(user1).setUserUseReserveAsCollateral(await weth.getAddress(), true);

            // User 1 borrows 50 WETH
            const borrowAmount = ethers.parseEther("50");
            await pool.connect(user1).borrow(await weth.getAddress(), borrowAmount, user1.address);

            const initialDebt = await wethDebtToken.getBalance(user1.address, ethers.parseUnits("1", 27));
            expect(initialDebt).to.equal(borrowAmount);

            // Advance time by 1 year
            await time.increase(31536000);

            // Trigger an update (e.g., by depositing small amount or calling a view that calculates)
            // In our pool, deposit/withdraw/borrow/repay trigger _updateState
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
            const { pool, weth, wethDebtToken, user1 } = await loadFixture(deployLendingPoolFixture);
            
            const amount = ethers.parseEther("10");
            await weth.mint(user1.address, amount * 2n);
            await weth.connect(user1).approve(await pool.getAddress(), amount * 2n);
            await pool.connect(user1).deposit(await weth.getAddress(), amount, user1.address);
            await pool.connect(user1).setUserUseReserveAsCollateral(await weth.getAddress(), true);

            const borrowAmount = ethers.parseEther("5");
            await pool.connect(user1).borrow(await weth.getAddress(), borrowAmount, user1.address);

            // Repay half
            const repayAmount = ethers.parseEther("2.5");
            await weth.connect(user1).approve(await pool.getAddress(), repayAmount);
            await pool.connect(user1).repay(await weth.getAddress(), repayAmount, user1.address);

            const reserve = await pool.getReserveData(await weth.getAddress());
            const remainingDebt = await wethDebtToken.getBalance(user1.address, reserve.variableBorrowIndex);
            
            // Allow for tiny interest accrual between borrow and repay blocks
            expect(remainingDebt).to.be.closeTo(ethers.parseEther("2.5"), ethers.parseEther("0.0001"));
        });
    });
});
