import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("X402PaymentGateway", function () {
    async function deployGatewayFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, feeRecipient, provider1, provider2, payer1, payer2] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const usdc = await MockERC20.deploy("USD Coin", "USDC", 6);

        const X402PaymentGateway = await ethers.getContractFactory("X402PaymentGateway");
        const gateway = await X402PaymentGateway.deploy(
            owner.address, await usdc.getAddress(), feeRecipient.address
        );

        // Mint and approve
        const amount = ethers.parseUnits("100000", 6);
        await usdc.mint(payer1.address, amount);
        await usdc.mint(payer2.address, amount);
        await usdc.connect(payer1).approve(await gateway.getAddress(), amount);
        await usdc.connect(payer2).approve(await gateway.getAddress(), amount);

        return { gateway, usdc, owner, feeRecipient, provider1, provider2, payer1, payer2, ethers };
    }

    describe("Initialization", function () {
        it("should initialize correctly", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, usdc, owner, feeRecipient } = await networkHelpers.loadFixture(deployGatewayFixture);

            expect(await gateway.owner()).to.equal(owner.address);
            expect(await gateway.paymentToken()).to.equal(await usdc.getAddress());
            expect(await gateway.feeRecipient()).to.equal(feeRecipient.address);
            expect(await gateway.protocolFee()).to.equal(100n); // 1%
        });
    });

    describe("Escrow Management", function () {
        it("should deposit into escrow", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, payer1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.connect(payer1).deposit(ethers.parseUnits("1000", 6));
            expect(await gateway.getEscrowBalance(payer1.address)).to.equal(ethers.parseUnits("1000", 6));
        });

        it("should withdraw from escrow", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, payer1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.connect(payer1).deposit(ethers.parseUnits("1000", 6));
            await gateway.connect(payer1).withdraw(ethers.parseUnits("500", 6));

            expect(await gateway.getEscrowBalance(payer1.address)).to.equal(ethers.parseUnits("500", 6));
        });

        it("should revert zero deposit", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, payer1 } = await networkHelpers.loadFixture(deployGatewayFixture);

            await expect(
                gateway.connect(payer1).deposit(0)
            ).to.be.revertedWith("Invalid amount");
        });

        it("should revert overdraw", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, payer1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.connect(payer1).deposit(ethers.parseUnits("100", 6));

            await expect(
                gateway.connect(payer1).withdraw(ethers.parseUnits("200", 6))
            ).to.be.reverted;
        });
    });

    describe("Provider Management", function () {
        it("should register provider", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, provider1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.registerProvider(provider1.address, ethers.parseUnits("10", 6));

            expect(await gateway.isProviderActive(provider1.address)).to.be.true;
            expect(await gateway.getProviderPrice(provider1.address)).to.equal(ethers.parseUnits("10", 6));
        });

        it("should remove provider", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, provider1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.registerProvider(provider1.address, ethers.parseUnits("10", 6));
            await gateway.removeProvider(provider1.address);

            expect(await gateway.isProviderActive(provider1.address)).to.be.false;
        });

        it("should update provider price by provider", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, provider1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.registerProvider(provider1.address, ethers.parseUnits("10", 6));
            await gateway.connect(provider1).updateProviderPrice(provider1.address, ethers.parseUnits("20", 6));

            expect(await gateway.getProviderPrice(provider1.address)).to.equal(ethers.parseUnits("20", 6));
        });

        it("should revert unauthorized price update", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, provider1, payer1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.registerProvider(provider1.address, ethers.parseUnits("10", 6));

            await expect(
                gateway.connect(payer1).updateProviderPrice(provider1.address, ethers.parseUnits("20", 6))
            ).to.be.revertedWith("Not authorized");
        });
    });

    describe("Payment Processing", function () {
        it("should process payment", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, usdc, provider1, payer1, feeRecipient, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            const price = ethers.parseUnits("100", 6);
            await gateway.registerProvider(provider1.address, price);
            await gateway.connect(payer1).deposit(ethers.parseUnits("1000", 6));

            const requestId = ethers.keccak256(ethers.toUtf8Bytes("request1"));
            const providerBefore = await usdc.balanceOf(provider1.address);
            const feeBefore = await usdc.balanceOf(feeRecipient.address);

            await gateway.processPayment(requestId, payer1.address, provider1.address);

            // Provider gets 99 (100 - 1% fee)
            expect(await usdc.balanceOf(provider1.address) - providerBefore).to.equal(ethers.parseUnits("99", 6));
            // Fee recipient gets 1
            expect(await usdc.balanceOf(feeRecipient.address) - feeBefore).to.equal(ethers.parseUnits("1", 6));
            // Escrow reduced
            expect(await gateway.getEscrowBalance(payer1.address)).to.equal(ethers.parseUnits("900", 6));
            // Counters updated
            expect(await gateway.totalPayments()).to.equal(1n);
            expect(await gateway.totalPaymentVolume()).to.equal(price);
        });

        it("should revert for unauthorized provider", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, provider1, payer1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            const requestId = ethers.keccak256(ethers.toUtf8Bytes("request1"));

            await expect(
                gateway.processPayment(requestId, payer1.address, provider1.address)
            ).to.be.revertedWith("Provider not authorized");
        });

        it("should revert with insufficient escrow", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, provider1, payer1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.registerProvider(provider1.address, ethers.parseUnits("100", 6));
            const requestId = ethers.keccak256(ethers.toUtf8Bytes("request1"));

            await expect(
                gateway.processPayment(requestId, payer1.address, provider1.address)
            ).to.be.revertedWith("Insufficient escrow");
        });
    });

    describe("Refunds", function () {
        it("should refund payment", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, provider1, payer1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            const price = ethers.parseUnits("100", 6);
            await gateway.registerProvider(provider1.address, price);
            await gateway.connect(payer1).deposit(ethers.parseUnits("1000", 6));

            const requestId = ethers.keccak256(ethers.toUtf8Bytes("request1"));
            await gateway.processPayment(requestId, payer1.address, provider1.address);

            // Get payment ID (hash of requestId + provider + timestamp)
            const paymentId = ethers.keccak256(
                ethers.AbiCoder.defaultAbiCoder().encode(
                    ["bytes32", "address", "uint256"],
                    [requestId, provider1.address, (await ethers.provider.getBlock("latest"))!.timestamp]
                )
            );

            await gateway.refundPayment(paymentId);

            // Escrow restored (payer gets the full amount back)
            expect(await gateway.getEscrowBalance(payer1.address)).to.equal(ethers.parseUnits("1000", 6));
        });
    });

    describe("Inference Payment", function () {
        it("should process inference payment", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, provider1, payer1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.registerProvider(provider1.address, ethers.parseUnits("50", 6));
            await gateway.connect(payer1).deposit(ethers.parseUnits("1000", 6));

            const requestId = ethers.keccak256(ethers.toUtf8Bytes("inference1"));

            await gateway.processInferencePayment(requestId, payer1.address, provider1.address, "yield_prediction");

            expect(await gateway.totalPayments()).to.equal(1n);
        });
    });

    describe("Batch Payments", function () {
        it("should process batch payments", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, provider1, provider2, payer1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.registerProvider(provider1.address, ethers.parseUnits("10", 6));
            await gateway.registerProvider(provider2.address, ethers.parseUnits("20", 6));
            await gateway.connect(payer1).deposit(ethers.parseUnits("1000", 6));

            const requestId1 = ethers.keccak256(ethers.toUtf8Bytes("req1"));
            const requestId2 = ethers.keccak256(ethers.toUtf8Bytes("req2"));

            await gateway.batchProcessPayments(
                [requestId1, requestId2],
                [payer1.address, payer1.address],
                [provider1.address, provider2.address]
            );

            expect(await gateway.totalPayments()).to.equal(2n);
        });

        it("should revert batch with array mismatch", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, provider1, payer1, ethers } = await networkHelpers.loadFixture(deployGatewayFixture);

            const requestId = ethers.keccak256(ethers.toUtf8Bytes("req1"));

            await expect(
                gateway.batchProcessPayments(
                    [requestId],
                    [payer1.address, payer1.address],
                    [provider1.address]
                )
            ).to.be.revertedWith("Array length mismatch");
        });
    });

    describe("Admin Functions", function () {
        it("should set protocol fee", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.setProtocolFee(200);
            expect(await gateway.protocolFee()).to.equal(200n);
        });

        it("should revert fee too high", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway } = await networkHelpers.loadFixture(deployGatewayFixture);

            await expect(
                gateway.setProtocolFee(1001)
            ).to.be.revertedWith("Fee too high");
        });

        it("should set fee recipient", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway, payer1 } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.setFeeRecipient(payer1.address);
            expect(await gateway.feeRecipient()).to.equal(payer1.address);
        });

        it("should toggle native payments", async function () {
            const { networkHelpers } = await network.connect();
            const { gateway } = await networkHelpers.loadFixture(deployGatewayFixture);

            await gateway.setNativePaymentsEnabled(true);
            expect(await gateway.nativePaymentsEnabled()).to.be.true;
        });
    });
});
