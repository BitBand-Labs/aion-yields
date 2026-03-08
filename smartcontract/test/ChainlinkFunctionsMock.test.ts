
import { expect } from "chai";
import { network } from "hardhat";

describe("Chainlink Functions Mock Tests", function () {
    async function deployFunctionsFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, user1, authorizedCaller, attacker] = await ethers.getSigners();

        const MockERC20 = await ethers.getContractFactory("MockERC20");
        const weth = await MockERC20.deploy("Wrapped Ether", "WETH", 18);

        const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
        const irModel = await InterestRateModel.deploy();
        const LendingPool = await ethers.getContractFactory("LendingPool");
        const pool = await LendingPool.deploy(owner.address, await irModel.getAddress(), owner.address);

        const AIYieldEngine = await ethers.getContractFactory("AIYieldEngine");
        const aiEngine = await AIYieldEngine.deploy(owner.address, await pool.getAddress());

        const functionsRouter = ethers.Wallet.createRandom().address;
        const donId = ethers.keccak256(ethers.toUtf8Bytes("don-1"));
        const ChainlinkFunctionsConsumer = await ethers.getContractFactory("ChainlinkFunctionsConsumer");
        const consumer = await ChainlinkFunctionsConsumer.deploy(
            owner.address, functionsRouter, 1n, donId, await aiEngine.getAddress()
        );

        await aiEngine.setAuthorizedCaller(await consumer.getAddress(), true);

        await consumer.setSourceCode(0, "return Functions.encodeString('test')");
        await consumer.setSourceCode(1, "return Functions.encodeString('risk')");
        await consumer.setSourceCode(2, "return Functions.encodeString('rate')");

        return { consumer, aiEngine, pool, weth, owner, user1, authorizedCaller, attacker, ethers, connection };
    }

    describe("Request Sending", function () {
        it("Should create a request with correct parameters", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { consumer, weth } = await networkHelpers.loadFixture(deployFunctionsFixture);

            await consumer.sendRequest(await weth.getAddress(), 0, []);
            expect(await consumer.totalRequests()).to.equal(1n);
            expect(await consumer.getRequestHistoryCount(await weth.getAddress())).to.equal(1n);
        });

        it("Should reject request with unconfigured source code", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { consumer, weth } = await networkHelpers.loadFixture(deployFunctionsFixture);

            try {
                await consumer.sendRequest(await weth.getAddress(), 3, []);
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("Source not configured");
            }
        });

        it("Should track multiple requests per asset", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { consumer, weth } = await networkHelpers.loadFixture(deployFunctionsFixture);

            await consumer.sendRequest(await weth.getAddress(), 0, []);
            await consumer.sendRequest(await weth.getAddress(), 1, []);
            await consumer.sendRequest(await weth.getAddress(), 2, []);

            expect(await consumer.totalRequests()).to.equal(3n);
            expect(await consumer.getRequestHistoryCount(await weth.getAddress())).to.equal(3n);
        });
    });

    describe("Request Fulfillment", function () {
        it("Should fulfill a pending request successfully", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { consumer, weth } = await networkHelpers.loadFixture(deployFunctionsFixture);

            await consumer.sendRequest(await weth.getAddress(), 0, []);
            const requestId = await consumer.getLatestRequestId(await weth.getAddress());

            const response = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256)"],
                [[ethers.parseUnits("5", 27), 3000n, 8500n,
                  ethers.parseUnits("2", 25), ethers.parseUnits("4", 25),
                  ethers.parseUnits("300", 25), ethers.parseUnits("80", 25)]]
            );

            await consumer.fulfillRequest(requestId, response, "0x");

            const data = await consumer.getRequestData(requestId);
            expect(data.isFulfilled).to.be.true;
        });

        it("Should reject double fulfillment", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { consumer, weth } = await networkHelpers.loadFixture(deployFunctionsFixture);

            await consumer.sendRequest(await weth.getAddress(), 0, []);
            const requestId = await consumer.getLatestRequestId(await weth.getAddress());

            const response = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256)"],
                [[0n, 0n, 0n, 0n, 0n, 0n, 0n]]
            );

            await consumer.fulfillRequest(requestId, response, "0x");

            try {
                await consumer.fulfillRequest(requestId, response, "0x");
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("Already fulfilled");
            }
        });

        it("Should handle fulfillment with error (no response processing)", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { consumer, weth } = await networkHelpers.loadFixture(deployFunctionsFixture);

            await consumer.sendRequest(await weth.getAddress(), 0, []);
            const requestId = await consumer.getLatestRequestId(await weth.getAddress());

            const errorBytes = ethers.toUtf8Bytes("AI model timeout");
            await consumer.fulfillRequest(requestId, "0x", errorBytes);

            const data = await consumer.getRequestData(requestId);
            expect(data.isFulfilled).to.be.true;
            expect(data.error).to.not.equal("0x");
        });

        it("Should forward prediction to AIYieldEngine", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { consumer, weth, aiEngine } = await networkHelpers.loadFixture(deployFunctionsFixture);

            await consumer.sendRequest(await weth.getAddress(), 0, []);
            const requestId = await consumer.getLatestRequestId(await weth.getAddress());

            const predictedAPY = ethers.parseUnits("5", 27);
            const riskScore = 3000n;
            const confidence = 8500n;

            const response = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256)"],
                [[predictedAPY, riskScore, confidence, 0n, 0n, 0n, 0n]]
            );

            await consumer.fulfillRequest(requestId, response, "0x");

            const prediction = await aiEngine.getLatestPrediction(await weth.getAddress());
            expect(prediction.predictedAPY).to.equal(predictedAPY);
            expect(prediction.riskScore).to.equal(riskScore);
            expect(prediction.confidence).to.equal(confidence);
        });

        it("Should forward rate recommendation when recommendedBaseRate > 0", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { consumer, weth, aiEngine } = await networkHelpers.loadFixture(deployFunctionsFixture);

            await consumer.sendRequest(await weth.getAddress(), 0, []);
            const requestId = await consumer.getLatestRequestId(await weth.getAddress());

            const baseRate = ethers.parseUnits("2", 25);
            const slope1 = ethers.parseUnits("4", 25);

            const response = ethers.AbiCoder.defaultAbiCoder().encode(
                ["tuple(uint256,uint256,uint256,uint256,uint256,uint256,uint256)"],
                [[ethers.parseUnits("5", 27), 3000n, 8500n, baseRate, slope1,
                  ethers.parseUnits("300", 25), ethers.parseUnits("80", 25)]]
            );

            await consumer.fulfillRequest(requestId, response, "0x");

            const rates = await aiEngine.aiRecommendedRates(await weth.getAddress());
            expect(rates.baseRate).to.equal(baseRate);
            expect(rates.rateSlope1).to.equal(slope1);
        });
    });

    describe("Admin Configuration", function () {
        it("Should allow owner to update source code", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { consumer } = await networkHelpers.loadFixture(deployFunctionsFixture);

            await consumer.setSourceCode(3, "new source code");
            expect(await consumer.sourceCodes(3)).to.equal("new source code");
        });

        it("Should allow owner to update callback gas limit", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { consumer } = await networkHelpers.loadFixture(deployFunctionsFixture);

            await consumer.setCallbackGasLimit(500000);
            expect(await consumer.callbackGasLimit()).to.equal(500000n);
        });

        it("Should reject non-owner admin calls", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { consumer, attacker } = await networkHelpers.loadFixture(deployFunctionsFixture);

            try {
                await consumer.connect(attacker).setSourceCode(0, "hack");
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("revert");
            }
        });
    });

    describe("View Functions", function () {
        it("Should return request data correctly", async function () {
            const connection = await network.connect();
            const { networkHelpers } = connection;
            const { consumer, weth, owner } = await networkHelpers.loadFixture(deployFunctionsFixture);

            await consumer.sendRequest(await weth.getAddress(), 0, []);
            const requestId = await consumer.getLatestRequestId(await weth.getAddress());

            const data = await consumer.getRequestData(requestId);
            expect(data.requester).to.equal(owner.address);
            expect(data.targetAsset).to.equal(await weth.getAddress());
            expect(data.isFulfilled).to.be.false;
        });

        it("Should revert getLatestRequestId when no requests exist", async function () {
            const connection = await network.connect();
            const { networkHelpers, ethers } = connection;
            const { consumer } = await networkHelpers.loadFixture(deployFunctionsFixture);

            const randomAsset = ethers.Wallet.createRandom().address;
            try {
                await consumer.getLatestRequestId(randomAsset);
                expect.fail("Should have reverted");
            } catch (e: any) {
                expect(e.message).to.include("No requests");
            }
        });
    });
});
