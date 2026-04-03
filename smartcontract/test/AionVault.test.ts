import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("AionVault", function () {
    async function deployVaultFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, user1, user2, feeRecipient, allocator] = await ethers.getSigners();

        // Deploy MockUSDC
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

        // Deploy AionVault implementation
        const AionVault = await ethers.getContractFactory("AionVault");
        const vaultImpl = await AionVault.deploy();

        // Deploy VaultFactory
        const VaultFactory = await ethers.getContractFactory("VaultFactory");
        const factory = await VaultFactory.deploy(
            await vaultImpl.getAddress(),
            feeRecipient.address,
            owner.address
        );

        // Deploy a STABLE vault via factory
        const depositLimit = ethers.parseUnits("10000000", 6); // 10M
        const tx = await factory.deployVault(await usdc.getAddress(), 0, depositLimit); // 0 = STABLE
        const receipt = await tx.wait();

        // Get vault address from event
        const event = receipt.logs.find((log: any) => {
            try {
                return factory.interface.parseLog({ topics: log.topics, data: log.data })?.name === "VaultDeployed";
            } catch { return false; }
        });
        const parsed = factory.interface.parseLog({ topics: event.topics, data: event.data });
        const vaultAddr = parsed!.args[0];

        const vault = AionVault.attach(vaultAddr) as any;

        // Set allocator
        await vault.setAllocator(allocator.address);

        // Mint USDC to users
        const mintAmount = ethers.parseUnits("100000", 6);
        await usdc.mint(user1.address, mintAmount);
        await usdc.mint(user2.address, mintAmount);
        await usdc.mint(owner.address, mintAmount);

        // Approve vault
        await usdc.connect(user1).approve(vaultAddr, ethers.MaxUint256);
        await usdc.connect(user2).approve(vaultAddr, ethers.MaxUint256);
        await usdc.connect(owner).approve(vaultAddr, ethers.MaxUint256);

        return { vault, usdc, factory, vaultImpl, owner, user1, user2, feeRecipient, allocator, ethers, connection, depositLimit };
    }

    describe("Initialization", function () {
        it("should initialize with correct parameters", async function () {
            const { connection } = await network.connect();
            const { networkHelpers } = await network.connect();
            const { vault, usdc, feeRecipient, depositLimit } = await networkHelpers.loadFixture(deployVaultFixture);

            expect(await vault.asset()).to.equal(await usdc.getAddress());
            expect(await vault.feeRecipient()).to.equal(feeRecipient.address);
            expect(await vault.depositLimit()).to.equal(depositLimit);
            expect(await vault.paused()).to.be.false;
        });

        it("should set STABLE vault type defaults", async function () {
            const { networkHelpers } = await network.connect();
            const { vault } = await networkHelpers.loadFixture(deployVaultFixture);

            expect(await vault.performanceFee()).to.equal(1000n);   // 10%
            expect(await vault.managementFee()).to.equal(200n);     // 2%
            expect(await vault.liquidityBufferBps()).to.equal(1500n); // 15%
        });

        it("should not allow re-initialization", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, usdc, feeRecipient, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            await expect(
                vault.initialize(
                    await usdc.getAddress(),
                    "AION Vault",
                    "aUSDC",
                    feeRecipient.address,
                    ethers.parseUnits("1000000", 6),
                    0
                )
            ).to.be.reverted;
        });
    });

    describe("ERC4626 Overrides", function () {
        it("should revert on standard deposit()", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            await expect(
                vault.connect(user1).deposit(ethers.parseUnits("1000", 6), user1.address)
            ).to.be.revertedWithCustomError(vault, "UseTrancheDeposit");
        });

        it("should revert on standard withdraw()", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            await expect(
                vault.connect(user1).withdraw(ethers.parseUnits("1000", 6), user1.address, user1.address)
            ).to.be.revertedWithCustomError(vault, "UseTrancheWithdraw");
        });

        it("should revert on standard mint()", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            await expect(
                vault.connect(user1).mint(ethers.parseUnits("1000", 6), user1.address)
            ).to.be.revertedWithCustomError(vault, "UseTrancheDeposit");
        });

        it("should revert on standard redeem()", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            await expect(
                vault.connect(user1).redeem(ethers.parseUnits("1000", 6), user1.address, user1.address)
            ).to.be.revertedWithCustomError(vault, "UseTrancheWithdraw");
        });

        it("should report correct totalAssets()", async function () {
            const { networkHelpers } = await network.connect();
            const { vault } = await networkHelpers.loadFixture(deployVaultFixture);

            expect(await vault.totalAssets()).to.equal(0n);
        });

        it("should return correct maxDeposit when not paused", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, depositLimit, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            expect(await vault.maxDeposit(ethers.ZeroAddress)).to.equal(depositLimit);
        });

        it("should return 0 maxDeposit when paused", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, owner, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            await vault.connect(owner).pause();
            expect(await vault.maxDeposit(ethers.ZeroAddress)).to.equal(0n);
        });
    });

    describe("Tranche Deposits", function () {
        it("should deposit into Senior tranche", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, usdc, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            const amount = ethers.parseUnits("10000", 6);
            await vault.connect(user1).depositTranche(amount, 0, user1.address); // 0 = SENIOR

            expect(await vault.totalAssets()).to.equal(amount);
            expect(await vault.totalIdle()).to.equal(amount);
            expect(await vault.getUserShares(user1.address, 0)).to.equal(amount); // 1:1 on first deposit
        });

        it("should deposit into Junior tranche", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            const amount = ethers.parseUnits("5000", 6);
            await vault.connect(user1).depositTranche(amount, 1, user1.address); // 1 = JUNIOR

            expect(await vault.getUserShares(user1.address, 1)).to.equal(amount);
            const tranche = await vault.getTranche(1);
            expect(tranche.totalAssets).to.equal(amount);
        });

        it("should allow deposits from multiple users into different tranches", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, user2, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            const seniorAmount = ethers.parseUnits("10000", 6);
            const juniorAmount = ethers.parseUnits("5000", 6);

            await vault.connect(user1).depositTranche(seniorAmount, 0, user1.address);
            await vault.connect(user2).depositTranche(juniorAmount, 1, user2.address);

            expect(await vault.totalAssets()).to.equal(seniorAmount + juniorAmount);
            expect(await vault.getUserShares(user1.address, 0)).to.equal(seniorAmount);
            expect(await vault.getUserShares(user2.address, 1)).to.equal(juniorAmount);
        });

        it("should revert on zero amount deposit", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1 } = await networkHelpers.loadFixture(deployVaultFixture);

            await expect(
                vault.connect(user1).depositTranche(0, 0, user1.address)
            ).to.be.revertedWithCustomError(vault, "ZeroAmount");
        });

        it("should revert on zero address receiver", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            await expect(
                vault.connect(user1).depositTranche(ethers.parseUnits("1000", 6), 0, ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(vault, "ZeroAddress");
        });

        it("should revert on invalid tranche ID", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            await expect(
                vault.connect(user1).depositTranche(ethers.parseUnits("1000", 6), 2, user1.address)
            ).to.be.reverted;
        });

        it("should revert when deposit exceeds limit", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers, depositLimit, usdc } = await networkHelpers.loadFixture(deployVaultFixture);

            // Mint more than deposit limit
            await usdc.mint(user1.address, depositLimit + 1n);
            await usdc.connect(user1).approve(await vault.getAddress(), ethers.MaxUint256);

            await expect(
                vault.connect(user1).depositTranche(depositLimit + 1n, 0, user1.address)
            ).to.be.revertedWithCustomError(vault, "DepositLimitExceeded");
        });

        it("should revert deposits when paused", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, owner, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            await vault.connect(owner).pause();
            await expect(
                vault.connect(user1).depositTranche(ethers.parseUnits("1000", 6), 0, user1.address)
            ).to.be.reverted;
        });
    });

    describe("Tranche Withdrawals", function () {
        it("should withdraw from Senior tranche", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, usdc, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            const amount = ethers.parseUnits("10000", 6);
            await vault.connect(user1).depositTranche(amount, 0, user1.address);

            const balBefore = await usdc.balanceOf(user1.address);
            await vault.connect(user1).withdrawTranche(amount, 0, user1.address);
            const balAfter = await usdc.balanceOf(user1.address);

            expect(balAfter - balBefore).to.equal(amount);
            expect(await vault.totalAssets()).to.equal(0n);
            expect(await vault.getUserShares(user1.address, 0)).to.equal(0n);
        });

        it("should withdraw partial amount", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            const depositAmt = ethers.parseUnits("10000", 6);
            const withdrawAmt = ethers.parseUnits("3000", 6);

            await vault.connect(user1).depositTranche(depositAmt, 0, user1.address);
            await vault.connect(user1).withdrawTranche(withdrawAmt, 0, user1.address);

            expect(await vault.totalAssets()).to.equal(depositAmt - withdrawAmt);
        });

        it("should revert if insufficient shares", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            const amount = ethers.parseUnits("1000", 6);
            await vault.connect(user1).depositTranche(amount, 0, user1.address);

            await expect(
                vault.connect(user1).withdrawTranche(amount + 1n, 0, user1.address)
            ).to.be.revertedWithCustomError(vault, "InsufficientShares");
        });

        it("should allow withdrawal even when paused (emergency exit)", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, owner, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            const amount = ethers.parseUnits("5000", 6);
            await vault.connect(user1).depositTranche(amount, 0, user1.address);

            await vault.connect(owner).pause();

            // Withdrawal should still work
            await expect(
                vault.connect(user1).withdrawTranche(amount, 0, user1.address)
            ).to.not.be.reverted;
        });
    });

    describe("Strategy Management", function () {
        async function deployWithStrategyFixture() {
            const connection = await network.connect();
            const { ethers } = connection;
            const [owner, user1, user2, feeRecipient, allocator] = await ethers.getSigners();

            const MockERC20 = await ethers.getContractFactory("MockERC20");
            const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

            const AionVault = await ethers.getContractFactory("AionVault");
            const vaultImpl = await AionVault.deploy();

            const VaultFactory = await ethers.getContractFactory("VaultFactory");
            const factory = await VaultFactory.deploy(
                await vaultImpl.getAddress(), feeRecipient.address, owner.address
            );

            const depositLimit = ethers.parseUnits("10000000", 6);
            const tx = await factory.deployVault(await usdc.getAddress(), 0, depositLimit);
            const receipt = await tx.wait();
            const event = receipt.logs.find((log: any) => {
                try { return factory.interface.parseLog({topics: log.topics, data: log.data})?.name === "VaultDeployed"; }
                catch { return false; }
            });
            const parsed = factory.interface.parseLog({topics: event.topics, data: event.data});
            const vaultAddr = parsed!.args[0];
            const vault = AionVault.attach(vaultAddr) as any;
            await vault.setAllocator(allocator.address);

            // Deploy a mock strategy (StrategyAave with dummy Aave)
            const StrategyAave = await ethers.getContractFactory("StrategyAave");
            const strategy = await StrategyAave.deploy(
                vaultAddr,
                await usdc.getAddress(),
                owner.address,
                "0x0000000000000000000000000000000000000001", // dummy pool
                "0x0000000000000000000000000000000000000001"  // dummy aToken
            );

            return { vault, usdc, factory, owner, user1, user2, feeRecipient, allocator, strategy, ethers, depositLimit };
        }

        it("should add a strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, strategy, owner, ethers } = await networkHelpers.loadFixture(deployWithStrategyFixture);

            const maxDebt = ethers.parseUnits("5000000", 6);
            await vault.connect(owner).addStrategy(await strategy.getAddress(), maxDebt);

            const params = await vault.strategies(await strategy.getAddress());
            expect(params.activation).to.be.gt(0n);
            expect(params.maxDebt).to.equal(maxDebt);
        });

        it("should revert adding zero address strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, owner, ethers } = await networkHelpers.loadFixture(deployWithStrategyFixture);

            await expect(
                vault.connect(owner).addStrategy(ethers.ZeroAddress, ethers.parseUnits("1000", 6))
            ).to.be.revertedWithCustomError(vault, "ZeroAddress");
        });

        it("should revert adding duplicate strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, strategy, owner, ethers } = await networkHelpers.loadFixture(deployWithStrategyFixture);

            const maxDebt = ethers.parseUnits("5000000", 6);
            await vault.connect(owner).addStrategy(await strategy.getAddress(), maxDebt);

            await expect(
                vault.connect(owner).addStrategy(await strategy.getAddress(), maxDebt)
            ).to.be.revertedWithCustomError(vault, "StrategyAlreadyActive");
        });

        it("should revoke a strategy with zero debt", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, strategy, owner, ethers } = await networkHelpers.loadFixture(deployWithStrategyFixture);

            const maxDebt = ethers.parseUnits("5000000", 6);
            await vault.connect(owner).addStrategy(await strategy.getAddress(), maxDebt);
            await vault.connect(owner).revokeStrategy(await strategy.getAddress());

            const params = await vault.strategies(await strategy.getAddress());
            expect(params.activation).to.equal(0n);
        });

        it("should update max debt", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, strategy, owner, ethers } = await networkHelpers.loadFixture(deployWithStrategyFixture);

            const maxDebt = ethers.parseUnits("5000000", 6);
            await vault.connect(owner).addStrategy(await strategy.getAddress(), maxDebt);

            const newMaxDebt = ethers.parseUnits("8000000", 6);
            await vault.connect(owner).updateMaxDebt(await strategy.getAddress(), newMaxDebt);

            const params = await vault.strategies(await strategy.getAddress());
            expect(params.maxDebt).to.equal(newMaxDebt);
        });

        it("should only allow owner to add/revoke strategies", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, strategy, user1, ethers } = await networkHelpers.loadFixture(deployWithStrategyFixture);

            await expect(
                vault.connect(user1).addStrategy(await strategy.getAddress(), ethers.parseUnits("1000", 6))
            ).to.be.reverted;
        });
    });

    describe("Admin Functions", function () {
        it("should set deposit limit", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, owner, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            const newLimit = ethers.parseUnits("20000000", 6);
            await vault.connect(owner).setDepositLimit(newLimit);
            expect(await vault.depositLimit()).to.equal(newLimit);
        });

        it("should set performance fee", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, owner } = await networkHelpers.loadFixture(deployVaultFixture);

            await vault.connect(owner).setPerformanceFee(1500); // 15%
            expect(await vault.performanceFee()).to.equal(1500n);
        });

        it("should revert setting fee above max", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, owner } = await networkHelpers.loadFixture(deployVaultFixture);

            await expect(
                vault.connect(owner).setPerformanceFee(5001) // > 50%
            ).to.be.revertedWithCustomError(vault, "InvalidFee");
        });

        it("should set management fee", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, owner } = await networkHelpers.loadFixture(deployVaultFixture);

            await vault.connect(owner).setManagementFee(100); // 1%
            expect(await vault.managementFee()).to.equal(100n);
        });

        it("should revert management fee above max", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, owner } = await networkHelpers.loadFixture(deployVaultFixture);

            await expect(
                vault.connect(owner).setManagementFee(501) // > 5%
            ).to.be.revertedWithCustomError(vault, "InvalidFee");
        });

        it("should pause and unpause", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, owner } = await networkHelpers.loadFixture(deployVaultFixture);

            await vault.connect(owner).pause();
            expect(await vault.paused()).to.be.true;

            await vault.connect(owner).unpause();
            expect(await vault.paused()).to.be.false;
        });

        it("should set allocator", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, owner, user1 } = await networkHelpers.loadFixture(deployVaultFixture);

            await vault.connect(owner).setAllocator(user1.address);
            expect(await vault.allocator()).to.equal(user1.address);
        });
    });

    describe("View Functions", function () {
        it("should return vault summary", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            const amount = ethers.parseUnits("10000", 6);
            await vault.connect(user1).depositTranche(amount, 0, user1.address);

            const summary = await vault.getVaultSummary();
            expect(summary.totalAssets_).to.equal(amount);
            expect(summary.totalIdle_).to.equal(amount);
            expect(summary.totalDebt_).to.equal(0n);
            expect(summary.seniorTotalAssets).to.equal(amount);
            expect(summary.juniorTotalAssets).to.equal(0n);
            expect(summary.isPaused).to.be.false;
        });

        it("should return user total value across tranches", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, user1, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            const seniorAmt = ethers.parseUnits("5000", 6);
            const juniorAmt = ethers.parseUnits("3000", 6);

            await vault.connect(user1).depositTranche(seniorAmt, 0, user1.address);
            await vault.connect(user1).depositTranche(juniorAmt, 1, user1.address);

            const [seniorVal, juniorVal, total] = await vault.getUserTotalValue(user1.address);
            expect(seniorVal).to.equal(seniorAmt);
            expect(juniorVal).to.equal(juniorAmt);
            expect(total).to.equal(seniorAmt + juniorAmt);
        });

        it("should return tranche price per share as 1e18 on first deposit", async function () {
            const { networkHelpers } = await network.connect();
            const { vault, ethers } = await networkHelpers.loadFixture(deployVaultFixture);

            expect(await vault.tranchePricePerShare(0)).to.equal(ethers.parseEther("1"));
        });
    });
});
