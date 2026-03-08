import { expect } from "chai";
import { network } from "hardhat";

describe("CrossChainVault", function () {
    let ethers: any;
    let networkHelpers: any;
    let connection: any;

    const FUJI_SELECTOR = 14767482510784806043n;
    const SEPOLIA_SELECTOR = 16015286601757825753n;

    before(async function () {
        connection = await network.connect();
        ethers = connection.ethers;
        networkHelpers = connection.networkHelpers;
    });

    async function deployCrossChainFixture() {

        const [owner, user, treasury] = await ethers.getSigners();
        const DEPOSIT_AMOUNT = ethers.parseUnits("1000", 6);

        // Deploy mock tokens
        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const mockUSDC = await MockERC20.deploy("USD Coin", "USDC", 6);
        const linkToken = await MockERC20.deploy("Chainlink", "LINK", 18);

        // Deploy mock CCIP router
        const MockRouter = await ethers.getContractFactory("MockCCIPRouter");
        const mockRouter = await MockRouter.deploy();

        // Deploy LendingPool with proper initialization
        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        const irm = await InterestRateModel.deploy();

        const LendingPool = await ethers.getContractFactory("LendingPool");
        const lendingPool = await LendingPool.deploy(owner.address, await irm.getAddress(), treasury.address);

        // Deploy AToken and DebtToken for USDC
        const AToken = await ethers.getContractFactory("AToken");
        const aToken = await AToken.deploy(
            "AION USDC", "aUSDC",
            await mockUSDC.getAddress(),
            await lendingPool.getAddress(),
            owner.address
        );

        const VariableDebtToken = await ethers.getContractFactory("VariableDebtToken");
        const debtToken = await VariableDebtToken.deploy(
            "AION Debt USDC", "dUSDC",
            await mockUSDC.getAddress(),
            await lendingPool.getAddress(),
            owner.address
        );

        // Initialize reserve
        await lendingPool.initReserve(
            await mockUSDC.getAddress(),
            await aToken.getAddress(),
            await debtToken.getAddress(),
            ethers.ZeroAddress, // oracle placeholder
            1000, 8000, 8500, 10500, 6
        );

        // Deploy two CrossChainVaults (simulating two chains)
        const CrossChainVault = await ethers.getContractFactory("CrossChainVault");

        const vaultA = await CrossChainVault.deploy(
            await mockRouter.getAddress(),
            await linkToken.getAddress(),
            await lendingPool.getAddress(),
            owner.address
        );

        const vaultB = await CrossChainVault.deploy(
            await mockRouter.getAddress(),
            await linkToken.getAddress(),
            await lendingPool.getAddress(),
            owner.address
        );

        // Configure vaultA: supports Fuji destination, remote vault is vaultB
        await vaultA.setSupportedChain(FUJI_SELECTOR, true);
        await vaultA.setRemoteVault(FUJI_SELECTOR, await vaultB.getAddress());

        // Configure vaultB: supports Sepolia destination, remote vault is vaultA
        await vaultB.setSupportedChain(SEPOLIA_SELECTOR, true);
        await vaultB.setRemoteVault(SEPOLIA_SELECTOR, await vaultA.getAddress());
        await vaultB.setTokenMapping(
            SEPOLIA_SELECTOR,
            await mockUSDC.getAddress(),
            await mockUSDC.getAddress()
        );

        // Fund user with USDC
        await mockUSDC.mint(user.address, ethers.parseUnits("10000", 6));

        // Fund vaultA with LINK for fees
        await linkToken.mint(await vaultA.getAddress(), ethers.parseEther("10"));

        // Fund vaultB with USDC for destination deposits
        await mockUSDC.mint(await vaultB.getAddress(), ethers.parseUnits("100000", 6));

        return {
            owner, user, mockUSDC, linkToken, mockRouter,
            lendingPool, vaultA, vaultB, DEPOSIT_AMOUNT, ethers
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

    describe("Configuration", function () {
        it("should set supported chains correctly", async function () {
            const { vaultA } = await networkHelpers.loadFixture(deployCrossChainFixture);
            expect(await vaultA.supportedChains(FUJI_SELECTOR)).to.be.true;
            expect(await vaultA.supportedChains(SEPOLIA_SELECTOR)).to.be.false;
        });

        it("should set remote vaults correctly", async function () {
            const { vaultA, vaultB } = await networkHelpers.loadFixture(deployCrossChainFixture);
            expect(await vaultA.remoteVaults(FUJI_SELECTOR)).to.equal(await vaultB.getAddress());
            expect(await vaultB.remoteVaults(SEPOLIA_SELECTOR)).to.equal(await vaultA.getAddress());
        });

        it("should set token mappings correctly", async function () {
            const { vaultB, mockUSDC } = await networkHelpers.loadFixture(deployCrossChainFixture);
            expect(
                await vaultB.tokenMappings(SEPOLIA_SELECTOR, await mockUSDC.getAddress())
            ).to.equal(await mockUSDC.getAddress());
        });

        it("should only allow owner to configure", async function () {
            const { vaultA, user } = await networkHelpers.loadFixture(deployCrossChainFixture);
            await expectRevert(
                vaultA.connect(user).setSupportedChain(SEPOLIA_SELECTOR, true)
            );
        });
    });

    describe("depositCrossChain (Source Chain)", function () {
        it("should lock tokens and send CCIP message", async function () {
            const { vaultA, vaultB, mockUSDC, user, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            await mockUSDC.connect(user).approve(await vaultA.getAddress(), DEPOSIT_AMOUNT);
            const balBefore = await mockUSDC.balanceOf(user.address);

            await vaultA.connect(user).depositCrossChain(
                FUJI_SELECTOR,
                await vaultB.getAddress(),
                await mockUSDC.getAddress(),
                DEPOSIT_AMOUNT
            );

            const balAfter = await mockUSDC.balanceOf(user.address);
            expect(balBefore - balAfter).to.equal(DEPOSIT_AMOUNT);
            expect(await vaultA.lockedBalance(await mockUSDC.getAddress())).to.equal(DEPOSIT_AMOUNT);
        });

        it("should revert if chain not supported", async function () {
            const { vaultA, vaultB, mockUSDC, user, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            await mockUSDC.connect(user).approve(await vaultA.getAddress(), DEPOSIT_AMOUNT);

            await expectRevert(
                vaultA.connect(user).depositCrossChain(
                    SEPOLIA_SELECTOR,
                    await vaultB.getAddress(),
                    await mockUSDC.getAddress(),
                    DEPOSIT_AMOUNT
                ),
                "Chain not supported"
            );
        });

        it("should revert if insufficient LINK for fees", async function () {
            const { mockRouter, linkToken, lendingPool, vaultB, mockUSDC, user, owner, DEPOSIT_AMOUNT } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            const CrossChainVault = await ethers.getContractFactory("CrossChainVault");
            const noLinkVault = await CrossChainVault.deploy(
                await mockRouter.getAddress(),
                await linkToken.getAddress(),
                await lendingPool.getAddress(),
                owner.address
            );
            await noLinkVault.setSupportedChain(FUJI_SELECTOR, true);

            await mockUSDC.connect(user).approve(await noLinkVault.getAddress(), DEPOSIT_AMOUNT);

            await expectRevert(
                noLinkVault.connect(user).depositCrossChain(
                    FUJI_SELECTOR,
                    await vaultB.getAddress(),
                    await mockUSDC.getAddress(),
                    DEPOSIT_AMOUNT
                ),
                "Insufficient LINK for fees"
            );
        });
    });

    describe("_ccipReceive (Destination Chain)", function () {
        it("should deposit into LendingPool on behalf of user via CCIP message", async function () {
            const { vaultA, vaultB, mockUSDC, mockRouter, lendingPool, user } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            const usdcAddr = await mockUSDC.getAddress();
            const DEPOSIT_AMOUNT = ethers.parseUnits("1000", 6);

            const payload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [user.address, usdcAddr, DEPOSIT_AMOUNT]
            );

            await mockRouter.deliverMessage(
                await vaultB.getAddress(),
                SEPOLIA_SELECTOR,
                await vaultA.getAddress(),
                payload
            );

            const userReserve = await lendingPool.userReserves(user.address, usdcAddr);
            expect(userReserve[0]).to.be.gt(0n);
        });

        it("should revert if sender is not authorized remote vault", async function () {
            const { vaultB, mockUSDC, mockRouter, user } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            const payload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [user.address, await mockUSDC.getAddress(), ethers.parseUnits("1000", 6)]
            );

            await expectRevert(
                mockRouter.deliverMessage(
                    await vaultB.getAddress(),
                    SEPOLIA_SELECTOR,
                    user.address,
                    payload
                ),
                "Invalid remote sender"
            );
        });

        it("should revert if token mapping not set", async function () {
            const { vaultA, vaultB, mockRouter, user } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            const fakeToken = "0x0000000000000000000000000000000000000001";
            const payload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [user.address, fakeToken, ethers.parseUnits("1000", 6)]
            );

            await expectRevert(
                mockRouter.deliverMessage(
                    await vaultB.getAddress(),
                    SEPOLIA_SELECTOR,
                    await vaultA.getAddress(),
                    payload
                ),
                "Token mapping not set"
            );
        });
    });

    describe("End-to-End Flow", function () {
        it("should complete full lock-message-deposit cycle", async function () {
            const { vaultA, vaultB, mockUSDC, mockRouter, lendingPool, user } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            const usdcAddr = await mockUSDC.getAddress();
            const DEPOSIT_AMOUNT = ethers.parseUnits("1000", 6);

            // 1. Lock tokens on source chain
            await mockUSDC.connect(user).approve(await vaultA.getAddress(), DEPOSIT_AMOUNT);
            await vaultA.connect(user).depositCrossChain(
                FUJI_SELECTOR,
                await vaultB.getAddress(),
                usdcAddr,
                DEPOSIT_AMOUNT
            );
            expect(await vaultA.lockedBalance(usdcAddr)).to.equal(DEPOSIT_AMOUNT);

            // 2. Simulate CCIP delivery to destination
            const payload = ethers.AbiCoder.defaultAbiCoder().encode(
                ["address", "address", "uint256"],
                [user.address, usdcAddr, DEPOSIT_AMOUNT]
            );
            await mockRouter.deliverMessage(
                await vaultB.getAddress(),
                SEPOLIA_SELECTOR,
                await vaultA.getAddress(),
                payload
            );

            // 3. Verify user has deposit in LendingPool
            const userReserve = await lendingPool.userReserves(user.address, usdcAddr);
            expect(userReserve[0]).to.be.gt(0n);
        });
    });

    describe("Admin Functions", function () {
        it("should allow funding the vault", async function () {
            const { vaultA, mockUSDC, owner } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            const amount = ethers.parseUnits("5000", 6);
            await mockUSDC.mint(owner.address, amount);
            await mockUSDC.approve(await vaultA.getAddress(), amount);
            await vaultA.fundVault(await mockUSDC.getAddress(), amount);

            const bal = await mockUSDC.balanceOf(await vaultA.getAddress());
            expect(bal).to.equal(amount);
        });

        it("should allow owner to withdraw tokens", async function () {
            const { vaultA, mockUSDC, owner } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            const amount = ethers.parseUnits("5000", 6);
            await mockUSDC.mint(await vaultA.getAddress(), amount);

            const balBefore = await mockUSDC.balanceOf(owner.address);
            await vaultA.withdrawToken(await mockUSDC.getAddress(), amount);
            const balAfter = await mockUSDC.balanceOf(owner.address);

            expect(balAfter - balBefore).to.equal(amount);
        });

        it("should not allow non-owner to withdraw", async function () {
            const { vaultA, mockUSDC, user } =
                await networkHelpers.loadFixture(deployCrossChainFixture);

            await expectRevert(
                vaultA.connect(user).withdrawToken(await mockUSDC.getAddress(), 1)
            );
        });
    });
});
