import { expect } from "chai";
import { network } from "hardhat";

describe("Warp Messaging via Avalanche Teleporter", function () {
    let ethers: any;
    let networkHelpers: any;
    let connection: any;

    // Avalanche blockchain IDs (bytes32)
    let FUJI_BLOCKCHAIN_ID: string;
    let SEPOLIA_BLOCKCHAIN_ID: string;
    let ARBITRUM_BLOCKCHAIN_ID: string;

    // Message type constants (must match contract)
    const MSG_DEPOSIT = 1;
    const MSG_WITHDRAW = 2;
    const MSG_RATE_SYNC = 3;
    const MSG_LIQUIDITY_REPORT = 4;

    before(async function () {
        connection = await network.connect();
        ethers = connection.ethers;
        networkHelpers = connection.networkHelpers;

        // Generate deterministic blockchain IDs (bytes32)
        FUJI_BLOCKCHAIN_ID = ethers.keccak256(ethers.toUtf8Bytes("avalanche-fuji"));
        SEPOLIA_BLOCKCHAIN_ID = ethers.keccak256(ethers.toUtf8Bytes("ethereum-sepolia"));
        ARBITRUM_BLOCKCHAIN_ID = ethers.keccak256(ethers.toUtf8Bytes("arbitrum-one"));
    });

    async function deployWarpFixture() {
        const [owner, user, user2, treasury] = await ethers.getSigners();
        const DEPOSIT_AMOUNT = ethers.parseUnits("1000", 6);

        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);

        // Deploy mock Teleporter Messenger
        const MockTeleporter = await ethers.getContractFactory("MockTeleporterMessenger");
        const mockTeleporter = await MockTeleporter.deploy();

        // Deploy InterestRateModel + LendingPool (Chain A)
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        const irmA = await InterestRateModel.deploy();

        const LendingPool = await ethers.getContractFactory("LendingPool");
        const poolA = await LendingPool.deploy(owner.address, await irmA.getAddress(), treasury.address);

        // Deploy AToken + DebtToken for USDC on pool A
        const AToken = await ethers.getContractFactory("AToken");
        const aTokenA = await AToken.deploy(
            "AION USDC", "aUSDC",
            await mockUSDC.getAddress(),
            await poolA.getAddress(),
            owner.address
        );

        const VariableDebtToken = await ethers.getContractFactory("VariableDebtToken");
        const debtTokenA = await VariableDebtToken.deploy(
            "AION Debt USDC", "dUSDC",
            await mockUSDC.getAddress(),
            await poolA.getAddress(),
            owner.address
        );

        await poolA.initReserve(
            await mockUSDC.getAddress(),
            await aTokenA.getAddress(),
            await debtTokenA.getAddress(),
            ethers.ZeroAddress,
            1000, 8000, 8500, 10500, 6
        );

        // Deploy second LendingPool (Chain B)
        const irmB = await InterestRateModel.deploy();
        const poolB = await LendingPool.deploy(owner.address, await irmB.getAddress(), treasury.address);

        const aTokenB = await AToken.deploy(
            "AION USDC B", "aUSDC-B",
            await mockUSDC.getAddress(),
            await poolB.getAddress(),
            owner.address
        );

        const debtTokenB = await VariableDebtToken.deploy(
            "AION Debt USDC B", "dUSDC-B",
            await mockUSDC.getAddress(),
            await poolB.getAddress(),
            owner.address
        );

        await poolB.initReserve(
            await mockUSDC.getAddress(),
            await aTokenB.getAddress(),
            await debtTokenB.getAddress(),
            ethers.ZeroAddress,
            1000, 8000, 8500, 10500, 6
        );

        // Deploy two CrossChainVaults (no LINK token needed with Teleporter)
        const CrossChainVault = await ethers.getContractFactory("CrossChainVault");

        const vaultA = await CrossChainVault.deploy(
            await mockTeleporter.getAddress(),
            await poolA.getAddress(),
            owner.address
        );

        const vaultB = await CrossChainVault.deploy(
            await mockTeleporter.getAddress(),
            await poolB.getAddress(),
            owner.address
        );

        // Configure vaultA (Chain A): supports Fuji destination
        await vaultA.setSupportedChain(FUJI_BLOCKCHAIN_ID, true);
        await vaultA.setRemoteVault(FUJI_BLOCKCHAIN_ID, await vaultB.getAddress());
        await vaultA.setTokenMapping(
            FUJI_BLOCKCHAIN_ID,
            await mockUSDC.getAddress(),
            await mockUSDC.getAddress()
        );

        // Configure vaultB (Chain B): supports Sepolia destination
        await vaultB.setSupportedChain(SEPOLIA_BLOCKCHAIN_ID, true);
        await vaultB.setRemoteVault(SEPOLIA_BLOCKCHAIN_ID, await vaultA.getAddress());
        await vaultB.setTokenMapping(
            SEPOLIA_BLOCKCHAIN_ID,
            await mockUSDC.getAddress(),
            await mockUSDC.getAddress()
        );

        // Fund user with USDC
        await mockUSDC.mint(user.address, ethers.parseUnits("50000", 6));
        await mockUSDC.mint(user2.address, ethers.parseUnits("50000", 6));

        // Fund vaultB with USDC for destination deposits
        await mockUSDC.mint(await vaultB.getAddress(), ethers.parseUnits("500000", 6));

        // Seed poolA with some deposits for rate/liquidity data
        const seedAmount = ethers.parseUnits("10000", 6);
        await mockUSDC.mint(owner.address, seedAmount);
        await mockUSDC.connect(owner).approve(await poolA.getAddress(), seedAmount);
        await poolA.connect(owner).deposit(await mockUSDC.getAddress(), seedAmount, owner.address);

        // Seed poolB with some deposits
        await mockUSDC.mint(owner.address, seedAmount);
        await mockUSDC.connect(owner).approve(await poolB.getAddress(), seedAmount);
        await poolB.connect(owner).deposit(await mockUSDC.getAddress(), seedAmount, owner.address);

        return {
            owner, user, user2, treasury,
            mockUSDC, mockTeleporter,
            poolA, poolB, irmA, irmB,
            vaultA, vaultB,
            DEPOSIT_AMOUNT, ethers
        };
    }

    // Helper to assert a tx reverts
    async function expectRevert(promise: Promise<any>, reason?: string) {
        try {
            await promise;
            expect.fail("Expected transaction to revert");
        } catch (error: any) {
            if (error.message === "Expected transaction to revert") throw error;
            if (reason) {
                const msg = error.message || error.reason || "";
                expect(msg).to.include(reason);
            }
        }
    }

    // ================================================================
    //  1. Typed Message Routing
    // ================================================================

    describe("Message Type Routing", function () {
        it("should expose correct message type constants", async function () {
            const { vaultA } = await networkHelpers.loadFixture(deployWarpFixture);
            expect(await vaultA.MSG_DEPOSIT()).to.equal(1n);
            expect(await vaultA.MSG_WITHDRAW()).to.equal(2n);
            expect(await vaultA.MSG_RATE_SYNC()).to.equal(3n);
            expect(await vaultA.MSG_LIQUIDITY_REPORT()).to.equal(4n);
        });

        it("should revert on unknown message type", async function () {
            const { vaultA, vaultB, mockTeleporter } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const unknownPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [99, "0x"]
            );

            await expectRevert(
                mockTeleporter.deliverMessage(
                    await vaultB.getAddress(),
                    SEPOLIA_BLOCKCHAIN_ID,
                    await vaultA.getAddress(),
                    unknownPayload
                ),
                "Unknown message type"
            );
        });

        it("should still reject unauthorized senders for all message types", async function () {
            const { vaultB, mockTeleporter, user, mockUSDC } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const depositPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_DEPOSIT, ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "address", "uint256"],
                    [user.address, await mockUSDC.getAddress(), 1000]
                )]
            );

            // Unauthorized sender (user.address instead of vaultA)
            await expectRevert(
                mockTeleporter.deliverMessage(
                    await vaultB.getAddress(),
                    SEPOLIA_BLOCKCHAIN_ID,
                    user.address,
                    depositPayload
                ),
                "Invalid remote sender"
            );
        });
    });

    // ================================================================
    //  2. Cross-Chain Deposits (MSG_DEPOSIT)
    // ================================================================

    describe("Cross-Chain Deposits (MSG_DEPOSIT)", function () {
        it("should lock tokens and emit deposit event on source chain", async function () {
            const { vaultA, vaultB, mockUSDC, user, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployWarpFixture);

            await mockUSDC.connect(user).approve(await vaultA.getAddress(), DEPOSIT_AMOUNT);
            const balBefore = await mockUSDC.balanceOf(user.address);

            const tx = await vaultA.connect(user).depositCrossChain(
                FUJI_BLOCKCHAIN_ID,
                await vaultB.getAddress(),
                await mockUSDC.getAddress(),
                DEPOSIT_AMOUNT
            );

            const balAfter = await mockUSDC.balanceOf(user.address);
            expect(balBefore - balAfter).to.equal(DEPOSIT_AMOUNT);
            expect(await vaultA.lockedBalance(await mockUSDC.getAddress())).to.equal(DEPOSIT_AMOUNT);
        });

        it("should credit user on destination chain via typed deposit message", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter, poolB, user, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();

            // Build typed deposit message
            const innerPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [user.address, usdcAddr, DEPOSIT_AMOUNT]
            );
            const typedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_DEPOSIT, innerPayload]
            );

            await mockTeleporter.deliverMessage(
                await vaultB.getAddress(),
                SEPOLIA_BLOCKCHAIN_ID,
                await vaultA.getAddress(),
                typedPayload
            );

            // Verify deposit in LendingPool
            const userReserve = await poolB.userReserves(user.address, usdcAddr);
            expect(userReserve[0]).to.be.gt(0n);
        });

        it("should revert deposit if chain not supported", async function () {
            const { vaultA, vaultB, mockUSDC, user, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployWarpFixture);

            await mockUSDC.connect(user).approve(await vaultA.getAddress(), DEPOSIT_AMOUNT);

            await expectRevert(
                vaultA.connect(user).depositCrossChain(
                    SEPOLIA_BLOCKCHAIN_ID, // Not supported on vaultA
                    await vaultB.getAddress(),
                    await mockUSDC.getAddress(),
                    DEPOSIT_AMOUNT
                ),
                "Chain not supported"
            );
        });

        it("should revert deposit if token mapping not set", async function () {
            const { vaultA, vaultB, mockTeleporter, user } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const fakeToken = "0x0000000000000000000000000000000000000001";
            const innerPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [user.address, fakeToken, ethers.parseUnits("1000", 6)]
            );
            const typedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_DEPOSIT, innerPayload]
            );

            await expectRevert(
                mockTeleporter.deliverMessage(
                    await vaultB.getAddress(),
                    SEPOLIA_BLOCKCHAIN_ID,
                    await vaultA.getAddress(),
                    typedPayload
                ),
                "Token mapping not set"
            );
        });
    });

    // ================================================================
    //  3. Cross-Chain Withdrawals (MSG_WITHDRAW)
    // ================================================================

    describe("Cross-Chain Withdrawals (MSG_WITHDRAW)", function () {
        it("should send a withdrawal request and emit event", async function () {
            const { vaultB, vaultA, mockUSDC, user, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployWarpFixture);

            await vaultB.connect(user).withdrawCrossChain(
                SEPOLIA_BLOCKCHAIN_ID,
                await vaultA.getAddress(),
                await mockUSDC.getAddress(),
                DEPOSIT_AMOUNT
            );

            // Nonce should have incremented
            expect(await vaultB.withdrawalNonce()).to.equal(1n);
        });

        it("should increment withdrawal nonce for each request", async function () {
            const { vaultB, vaultA, mockUSDC, user, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployWarpFixture);

            expect(await vaultB.withdrawalNonce()).to.equal(0n);

            await vaultB.connect(user).withdrawCrossChain(
                SEPOLIA_BLOCKCHAIN_ID,
                await vaultA.getAddress(),
                await mockUSDC.getAddress(),
                DEPOSIT_AMOUNT
            );
            expect(await vaultB.withdrawalNonce()).to.equal(1n);

            await vaultB.connect(user).withdrawCrossChain(
                SEPOLIA_BLOCKCHAIN_ID,
                await vaultA.getAddress(),
                await mockUSDC.getAddress(),
                DEPOSIT_AMOUNT
            );
            expect(await vaultB.withdrawalNonce()).to.equal(2n);
        });

        it("should revert withdrawal request if chain not supported", async function () {
            const { vaultA, mockUSDC, user, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployWarpFixture);

            await expectRevert(
                vaultA.connect(user).withdrawCrossChain(
                    ARBITRUM_BLOCKCHAIN_ID, // Not supported
                    ethers.ZeroAddress,
                    await mockUSDC.getAddress(),
                    DEPOSIT_AMOUNT
                ),
                "Chain not supported"
            );
        });

        it("should fulfill withdrawal: unlock tokens and transfer to user", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter, user, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();

            // First: deposit cross-chain to lock tokens in vaultA
            await mockUSDC.connect(user).approve(await vaultA.getAddress(), DEPOSIT_AMOUNT);
            await vaultA.connect(user).depositCrossChain(
                FUJI_BLOCKCHAIN_ID,
                await vaultB.getAddress(),
                usdcAddr,
                DEPOSIT_AMOUNT
            );

            expect(await vaultA.lockedBalance(usdcAddr)).to.equal(DEPOSIT_AMOUNT);
            const balBefore = await mockUSDC.balanceOf(user.address);

            // Now: simulate withdrawal message arriving at vaultA (source chain)
            const nonce = 0;
            const innerPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256", "uint256"],
                [user.address, usdcAddr, DEPOSIT_AMOUNT, nonce]
            );
            const typedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_WITHDRAW, innerPayload]
            );

            await mockTeleporter.deliverMessage(
                await vaultA.getAddress(),
                FUJI_BLOCKCHAIN_ID,
                await vaultB.getAddress(),
                typedPayload
            );

            // Verify tokens unlocked and sent to user
            const balAfter = await mockUSDC.balanceOf(user.address);
            expect(balAfter - balBefore).to.equal(DEPOSIT_AMOUNT);
            expect(await vaultA.lockedBalance(usdcAddr)).to.equal(0n);

            // Verify pending withdrawal record
            const pw = await vaultA.pendingWithdrawals(nonce);
            expect(pw.user).to.equal(user.address);
            expect(pw.amount).to.equal(DEPOSIT_AMOUNT);
            expect(pw.fulfilled).to.be.true;
        });

        it("should revert withdrawal fulfillment if insufficient locked balance", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter, user, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();

            // No tokens locked, try to withdraw
            const innerPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256", "uint256"],
                [user.address, usdcAddr, DEPOSIT_AMOUNT, 0]
            );
            const typedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_WITHDRAW, innerPayload]
            );

            await expectRevert(
                mockTeleporter.deliverMessage(
                    await vaultA.getAddress(),
                    FUJI_BLOCKCHAIN_ID,
                    await vaultB.getAddress(),
                    typedPayload
                ),
                "Insufficient locked balance"
            );
        });
    });

    // ================================================================
    //  4. Rate Synchronization (MSG_RATE_SYNC)
    // ================================================================

    describe("Rate Synchronization (MSG_RATE_SYNC)", function () {
        it("should send rate sync message from source chain", async function () {
            const { vaultA, mockUSDC, mockTeleporter } =
                await networkHelpers.loadFixture(deployWarpFixture);

            await vaultA.syncRates(
                FUJI_BLOCKCHAIN_ID,
                await mockUSDC.getAddress()
            );

            // Verify a Teleporter message was sent
            const msgCount = await mockTeleporter.getSentMessagesCount();
            expect(msgCount).to.be.gt(0n);
        });

        it("should store remote rate data when rate sync message is received", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter, poolA } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();

            // Get current rates from poolA to build the sync message
            const reserve = await poolA.getReserveData(usdcAddr);
            const supplyRate = BigInt(reserve.currentLiquidityRate);
            const borrowRate = BigInt(reserve.currentVariableBorrowRate);
            const totalSupply = BigInt(reserve.totalSupply);
            const totalBorrow = BigInt(reserve.totalBorrow);
            const utilization = totalSupply > 0n
                ? (totalBorrow * BigInt(1e27)) / totalSupply
                : 0n;

            const ratePayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256", "uint256", "uint256"],
                [usdcAddr, supplyRate, borrowRate, utilization, totalSupply, totalBorrow]
            );
            const typedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_RATE_SYNC, ratePayload]
            );

            await mockTeleporter.deliverMessage(
                await vaultB.getAddress(),
                SEPOLIA_BLOCKCHAIN_ID,
                await vaultA.getAddress(),
                typedPayload
            );

            // Verify stored rate data
            const rateData = await vaultB.remoteRates(SEPOLIA_BLOCKCHAIN_ID, usdcAddr);
            expect(rateData.supplyRate).to.equal(supplyRate);
            expect(rateData.borrowRate).to.equal(borrowRate);
            expect(rateData.totalSupply).to.equal(totalSupply);
            expect(rateData.totalBorrow).to.equal(totalBorrow);
            expect(rateData.lastSyncTime).to.be.gt(0n);
        });

        it("should overwrite stale rate data with fresh sync", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();

            // First sync with dummy data
            const ratePayload1 = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256", "uint256", "uint256"],
                [usdcAddr, 100n, 200n, 50n, 10000n, 5000n]
            );
            const typed1 = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_RATE_SYNC, ratePayload1]
            );

            await mockTeleporter.deliverMessage(
                await vaultB.getAddress(),
                SEPOLIA_BLOCKCHAIN_ID,
                await vaultA.getAddress(),
                typed1
            );

            let rateData = await vaultB.remoteRates(SEPOLIA_BLOCKCHAIN_ID, usdcAddr);
            expect(rateData.supplyRate).to.equal(100n);

            // Second sync with updated data
            const ratePayload2 = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256", "uint256", "uint256"],
                [usdcAddr, 500n, 800n, 60n, 20000n, 12000n]
            );
            const typed2 = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_RATE_SYNC, ratePayload2]
            );

            await mockTeleporter.deliverMessage(
                await vaultB.getAddress(),
                SEPOLIA_BLOCKCHAIN_ID,
                await vaultA.getAddress(),
                typed2
            );

            rateData = await vaultB.remoteRates(SEPOLIA_BLOCKCHAIN_ID, usdcAddr);
            expect(rateData.supplyRate).to.equal(500n);
            expect(rateData.borrowRate).to.equal(800n);
            expect(rateData.totalSupply).to.equal(20000n);
        });

        it("should revert syncRates if chain not supported", async function () {
            const { vaultA, mockUSDC } =
                await networkHelpers.loadFixture(deployWarpFixture);

            await expectRevert(
                vaultA.syncRates(ARBITRUM_BLOCKCHAIN_ID, await mockUSDC.getAddress()),
                "Chain not supported"
            );
        });

        it("should revert syncRates if remote vault not set", async function () {
            const { vaultA, mockUSDC } =
                await networkHelpers.loadFixture(deployWarpFixture);

            // Enable chain but don't set remote vault
            await vaultA.setSupportedChain(ARBITRUM_BLOCKCHAIN_ID, true);
            await vaultA.setRemoteVault(ARBITRUM_BLOCKCHAIN_ID, ethers.ZeroAddress);

            await expectRevert(
                vaultA.syncRates(ARBITRUM_BLOCKCHAIN_ID, await mockUSDC.getAddress()),
                "Remote vault not set"
            );
        });
    });

    // ================================================================
    //  5. Liquidity Reporting (MSG_LIQUIDITY_REPORT)
    // ================================================================

    describe("Liquidity Reporting (MSG_LIQUIDITY_REPORT)", function () {
        it("should send liquidity report and emit event", async function () {
            const { vaultA, mockUSDC, mockTeleporter } =
                await networkHelpers.loadFixture(deployWarpFixture);

            await vaultA.reportLiquidity(
                FUJI_BLOCKCHAIN_ID,
                await mockUSDC.getAddress()
            );

            // Verify message was sent
            const msgCount = await mockTeleporter.getSentMessagesCount();
            expect(msgCount).to.be.gt(0n);
        });

        it("should store remote liquidity data when report is received", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();
            const availableLiquidity = ethers.parseUnits("8000", 6);

            const innerPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [usdcAddr, availableLiquidity]
            );
            const typedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_LIQUIDITY_REPORT, innerPayload]
            );

            await mockTeleporter.deliverMessage(
                await vaultB.getAddress(),
                SEPOLIA_BLOCKCHAIN_ID,
                await vaultA.getAddress(),
                typedPayload
            );

            // Verify stored liquidity data
            const liqData = await vaultB.remoteLiquidity(SEPOLIA_BLOCKCHAIN_ID, usdcAddr);
            expect(liqData.availableLiquidity).to.equal(availableLiquidity);
            expect(liqData.timestamp).to.be.gt(0n);
        });

        it("should revert reportLiquidity if chain not supported", async function () {
            const { vaultA, mockUSDC } =
                await networkHelpers.loadFixture(deployWarpFixture);

            await expectRevert(
                vaultA.reportLiquidity(ARBITRUM_BLOCKCHAIN_ID, await mockUSDC.getAddress()),
                "Chain not supported"
            );
        });
    });

    // ================================================================
    //  6. Chain Registry (Multi-Chain Awareness)
    // ================================================================

    describe("Chain Registry", function () {
        it("should register a new chain", async function () {
            const { vaultA } =
                await networkHelpers.loadFixture(deployWarpFixture);

            await vaultA.registerChain(
                ARBITRUM_BLOCKCHAIN_ID,
                "Arbitrum One",
                "0x0000000000000000000000000000000000000042"
            );

            const info = await vaultA.chainRegistry(ARBITRUM_BLOCKCHAIN_ID);
            expect(info.chainName).to.equal("Arbitrum One");
            expect(info.isActive).to.be.true;

            // Should auto-configure supported chain + remote vault
            expect(await vaultA.supportedChains(ARBITRUM_BLOCKCHAIN_ID)).to.be.true;
            expect(await vaultA.remoteVaults(ARBITRUM_BLOCKCHAIN_ID)).to.equal(
                "0x0000000000000000000000000000000000000042"
            );
        });

        it("should not allow duplicate chain registration", async function () {
            const { vaultA } = await networkHelpers.loadFixture(deployWarpFixture);

            await vaultA.registerChain(
                ARBITRUM_BLOCKCHAIN_ID,
                "Arbitrum One",
                "0x0000000000000000000000000000000000000042"
            );

            await expectRevert(
                vaultA.registerChain(
                    ARBITRUM_BLOCKCHAIN_ID,
                    "Arbitrum One Duplicate",
                    "0x0000000000000000000000000000000000000043"
                ),
                "Chain already registered"
            );
        });

        it("should deactivate a chain", async function () {
            const { vaultA } = await networkHelpers.loadFixture(deployWarpFixture);

            await vaultA.registerChain(
                ARBITRUM_BLOCKCHAIN_ID,
                "Arbitrum",
                "0x0000000000000000000000000000000000000042"
            );

            await vaultA.deactivateChain(ARBITRUM_BLOCKCHAIN_ID);

            const info = await vaultA.chainRegistry(ARBITRUM_BLOCKCHAIN_ID);
            expect(info.isActive).to.be.false;
            expect(await vaultA.supportedChains(ARBITRUM_BLOCKCHAIN_ID)).to.be.false;
        });

        it("should only allow owner to register/deactivate chains", async function () {
            const { vaultA, user } = await networkHelpers.loadFixture(deployWarpFixture);

            await expectRevert(
                vaultA.connect(user).registerChain(
                    ARBITRUM_BLOCKCHAIN_ID,
                    "Arbitrum",
                    "0x0000000000000000000000000000000000000042"
                )
            );

            await expectRevert(
                vaultA.connect(user).deactivateChain(FUJI_BLOCKCHAIN_ID)
            );
        });

        it("should track registered chains count", async function () {
            const { vaultA } = await networkHelpers.loadFixture(deployWarpFixture);

            expect(await vaultA.getRegisteredChainsCount()).to.equal(0n);

            await vaultA.registerChain(
                ARBITRUM_BLOCKCHAIN_ID,
                "Arbitrum",
                "0x0000000000000000000000000000000000000042"
            );

            expect(await vaultA.getRegisteredChainsCount()).to.equal(1n);
        });
    });

    // ================================================================
    //  7. Multi-Chain View Functions
    // ================================================================

    describe("Multi-Chain Awareness Views", function () {
        it("should return aggregated TVL across chains", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();

            // Register Fuji chain
            await vaultA.registerChain(
                FUJI_BLOCKCHAIN_ID,
                "Avalanche Fuji",
                await vaultB.getAddress()
            );

            // Simulate rate sync from Fuji with 20000 total supply
            const ratePayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256", "uint256", "uint256"],
                [usdcAddr, 100n, 200n, 50n, ethers.parseUnits("20000", 6), ethers.parseUnits("5000", 6)]
            );
            const typedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_RATE_SYNC, ratePayload]
            );

            await mockTeleporter.deliverMessage(
                await vaultA.getAddress(),
                FUJI_BLOCKCHAIN_ID,
                await vaultB.getAddress(),
                typedPayload
            );

            const [totalTVL, chainCount] = await vaultA.getAggregatedTVL(usdcAddr);

            // Local (10000) + Remote (20000) = 30000
            expect(totalTVL).to.equal(
                ethers.parseUnits("10000", 6) + ethers.parseUnits("20000", 6)
            );
            expect(chainCount).to.equal(2n); // local + 1 remote
        });

        it("should find the best supply rate across chains", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();

            // Register Fuji chain
            await vaultA.registerChain(
                FUJI_BLOCKCHAIN_ID,
                "Avalanche Fuji",
                await vaultB.getAddress()
            );

            // Sync a higher supply rate from Fuji
            const highRate = ethers.parseUnits("1", 27); // 100% APY (very high for testing)
            const ratePayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256", "uint256", "uint256"],
                [usdcAddr, highRate, 200n, 50n, 10000n, 5000n]
            );
            const typedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_RATE_SYNC, ratePayload]
            );

            await mockTeleporter.deliverMessage(
                await vaultA.getAddress(),
                FUJI_BLOCKCHAIN_ID,
                await vaultB.getAddress(),
                typedPayload
            );

            const [bestRate, bestChain] = await vaultA.getBestSupplyRate(usdcAddr);
            expect(bestRate).to.equal(highRate);
            expect(bestChain).to.equal(FUJI_BLOCKCHAIN_ID);
        });

        it("should find the best borrow rate (lowest) across chains", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();

            // Register Fuji chain
            await vaultA.registerChain(
                FUJI_BLOCKCHAIN_ID,
                "Avalanche Fuji",
                await vaultB.getAddress()
            );

            // Sync a lower borrow rate from Fuji
            const lowBorrowRate = 1n; // Nearly zero
            const ratePayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256", "uint256", "uint256", "uint256", "uint256"],
                [usdcAddr, 100n, lowBorrowRate, 50n, 10000n, 5000n]
            );
            const typedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_RATE_SYNC, ratePayload]
            );

            await mockTeleporter.deliverMessage(
                await vaultA.getAddress(),
                FUJI_BLOCKCHAIN_ID,
                await vaultB.getAddress(),
                typedPayload
            );

            const [bestRate, bestChain] = await vaultA.getBestBorrowRate(usdcAddr);
            expect(bestRate).to.equal(lowBorrowRate);
            expect(bestChain).to.equal(FUJI_BLOCKCHAIN_ID);
        });

        it("should get total available liquidity across chains", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();

            // Register Fuji chain
            await vaultA.registerChain(
                FUJI_BLOCKCHAIN_ID,
                "Avalanche Fuji",
                await vaultB.getAddress()
            );

            // Send liquidity report from Fuji
            const remoteLiq = ethers.parseUnits("15000", 6);
            const innerPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "uint256"],
                [usdcAddr, remoteLiq]
            );
            const typedPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_LIQUIDITY_REPORT, innerPayload]
            );

            await mockTeleporter.deliverMessage(
                await vaultA.getAddress(),
                FUJI_BLOCKCHAIN_ID,
                await vaultB.getAddress(),
                typedPayload
            );

            const totalLiq = await vaultA.getTotalAvailableLiquidity(usdcAddr);
            // Local (10000 supply - 0 borrow) + Remote (15000)
            expect(totalLiq).to.equal(
                ethers.parseUnits("10000", 6) + remoteLiq
            );
        });
    });

    // ================================================================
    //  8. End-to-End Flows
    // ================================================================

    describe("End-to-End: Deposit → Withdraw Round-Trip", function () {
        it("should complete full lock-deposit-withdraw-unlock cycle", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter, poolB, user, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();
            const initialBalance = await mockUSDC.balanceOf(user.address);

            // === Step 1: Deposit from Chain A → Chain B ===
            await mockUSDC.connect(user).approve(await vaultA.getAddress(), DEPOSIT_AMOUNT);
            await vaultA.connect(user).depositCrossChain(
                FUJI_BLOCKCHAIN_ID,
                await vaultB.getAddress(),
                usdcAddr,
                DEPOSIT_AMOUNT
            );

            // Tokens locked on source
            expect(await vaultA.lockedBalance(usdcAddr)).to.equal(DEPOSIT_AMOUNT);
            expect(await mockUSDC.balanceOf(user.address)).to.equal(initialBalance - DEPOSIT_AMOUNT);

            // Simulate Teleporter delivery to Chain B
            const depositInner = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [user.address, usdcAddr, DEPOSIT_AMOUNT]
            );
            const depositPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_DEPOSIT, depositInner]
            );
            await mockTeleporter.deliverMessage(
                await vaultB.getAddress(),
                SEPOLIA_BLOCKCHAIN_ID,
                await vaultA.getAddress(),
                depositPayload
            );

            // User has deposit on Chain B
            const userReserve = await poolB.userReserves(user.address, usdcAddr);
            expect(userReserve[0]).to.be.gt(0n);

            // === Step 2: Withdraw from Chain B → Chain A ===
            const withdrawInner = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256", "uint256"],
                [user.address, usdcAddr, DEPOSIT_AMOUNT, 0]
            );
            const withdrawPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_WITHDRAW, withdrawInner]
            );
            await mockTeleporter.deliverMessage(
                await vaultA.getAddress(),
                FUJI_BLOCKCHAIN_ID,
                await vaultB.getAddress(),
                withdrawPayload
            );

            // Tokens unlocked and returned to user
            expect(await vaultA.lockedBalance(usdcAddr)).to.equal(0n);
            expect(await mockUSDC.balanceOf(user.address)).to.equal(initialBalance);
        });
    });

    describe("End-to-End: Multi-Chain Rate Awareness", function () {
        it("should sync rates from multiple chains and find best opportunity", async function () {
            const { vaultA, vaultB, mockUSDC, mockTeleporter } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const usdcAddr = await mockUSDC.getAddress();

            // Register two remote chains
            await vaultA.registerChain(
                FUJI_BLOCKCHAIN_ID,
                "Avalanche Fuji",
                await vaultB.getAddress()
            );

            const mockArbitrumVault = "0x0000000000000000000000000000000000000099";
            await vaultA.registerChain(
                ARBITRUM_BLOCKCHAIN_ID,
                "Arbitrum One",
                mockArbitrumVault
            );

            // Sync rates from Fuji: 5% supply rate
            const fujiRate = ethers.parseUnits("0.05", 27); // 5% in RAY
            const fujiPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_RATE_SYNC, ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256", "uint256", "uint256"],
                    [usdcAddr, fujiRate, ethers.parseUnits("0.08", 27), 0, ethers.parseUnits("50000", 6), 0]
                )]
            );
            await mockTeleporter.deliverMessage(
                await vaultA.getAddress(),
                FUJI_BLOCKCHAIN_ID,
                await vaultB.getAddress(),
                fujiPayload
            );

            // Sync rates from Arbitrum: 8% supply rate (better!)
            const arbRate = ethers.parseUnits("0.08", 27); // 8% in RAY
            const arbPayload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["uint8", "bytes"],
                [MSG_RATE_SYNC, ethers.AbiCoder.defaultAbiCoder().encode(
                    ["address", "uint256", "uint256", "uint256", "uint256", "uint256"],
                    [usdcAddr, arbRate, ethers.parseUnits("0.12", 27), 0, ethers.parseUnits("30000", 6), 0]
                )]
            );
            await mockTeleporter.deliverMessage(
                await vaultA.getAddress(),
                ARBITRUM_BLOCKCHAIN_ID,
                mockArbitrumVault,
                arbPayload
            );

            // Best supply rate should be Arbitrum's 8%
            const [bestRate, bestChain] = await vaultA.getBestSupplyRate(usdcAddr);
            expect(bestRate).to.equal(arbRate);
            expect(bestChain).to.equal(ARBITRUM_BLOCKCHAIN_ID);

            // Aggregated TVL: local (10000) + Fuji (50000) + Arbitrum (30000) = 90000
            const [totalTVL, chainCount] = await vaultA.getAggregatedTVL(usdcAddr);
            expect(totalTVL).to.equal(
                ethers.parseUnits("10000", 6) +
                ethers.parseUnits("50000", 6) +
                ethers.parseUnits("30000", 6)
            );
            expect(chainCount).to.equal(3n);
        });
    });

    // ================================================================
    //  9. Admin & Backward Compatibility
    // ================================================================

    describe("Admin Functions", function () {
        it("should allow funding the vault", async function () {
            const { vaultA, mockUSDC, owner } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const amount = ethers.parseUnits("5000", 6);
            await mockUSDC.mint(owner.address, amount);
            await mockUSDC.approve(await vaultA.getAddress(), amount);
            await vaultA.fundVault(await mockUSDC.getAddress(), amount);

            const bal = await mockUSDC.balanceOf(await vaultA.getAddress());
            expect(bal).to.be.gte(amount);
        });

        it("should allow owner to withdraw tokens", async function () {
            const { vaultA, mockUSDC, owner } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const amount = ethers.parseUnits("5000", 6);
            await mockUSDC.mint(await vaultA.getAddress(), amount);

            const balBefore = await mockUSDC.balanceOf(owner.address);
            await vaultA.withdrawToken(await mockUSDC.getAddress(), amount);
            const balAfter = await mockUSDC.balanceOf(owner.address);

            expect(balAfter - balBefore).to.equal(amount);
        });

        it("should not allow non-owner to withdraw", async function () {
            const { vaultA, mockUSDC, user } =
                await networkHelpers.loadFixture(deployWarpFixture);

            await expectRevert(
                vaultA.connect(user).withdrawToken(await mockUSDC.getAddress(), 1)
            );
        });

        it("should allow setting lending pool", async function () {
            const { vaultA } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const newPool = "0x0000000000000000000000000000000000000042";
            await vaultA.setLendingPool(newPool);
            expect(await vaultA.lendingPool()).to.equal(newPool);
        });

        it("should allow setting token mappings", async function () {
            const { vaultA } =
                await networkHelpers.loadFixture(deployWarpFixture);

            const sourceToken = "0x0000000000000000000000000000000000000001";
            const localToken = "0x0000000000000000000000000000000000000002";

            await vaultA.setTokenMapping(ARBITRUM_BLOCKCHAIN_ID, sourceToken, localToken);
            expect(await vaultA.tokenMappings(ARBITRUM_BLOCKCHAIN_ID, sourceToken)).to.equal(localToken);
        });

        it("should allow setting message gas limit", async function () {
            const { vaultA } =
                await networkHelpers.loadFixture(deployWarpFixture);

            await vaultA.setMessageGasLimit(500000);
            expect(await vaultA.messageGasLimit()).to.equal(500000n);
        });
    });
});
