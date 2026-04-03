import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("WithdrawalQueue", function () {
    async function deployQueueFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, vault1, strategy1, strategy2, strategy3, user1] = await ethers.getSigners();

        const WithdrawalQueue = await ethers.getContractFactory("WithdrawalQueue");
        const queue = await WithdrawalQueue.deploy(owner.address);

        return { queue, owner, vault1, strategy1, strategy2, strategy3, user1, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct owner", async function () {
            const { networkHelpers } = await network.connect();
            const { queue, owner } = await networkHelpers.loadFixture(deployQueueFixture);
            expect(await queue.owner()).to.equal(owner.address);
        });
    });

    describe("Queue Management", function () {
        it("should set full queue", async function () {
            const { networkHelpers } = await network.connect();
            const { queue, vault1, strategy1, strategy2 } = await networkHelpers.loadFixture(deployQueueFixture);

            await queue.setQueue(vault1.address, [strategy1.address, strategy2.address]);
            const q = await queue.getQueue(vault1.address);
            expect(q.length).to.equal(2);
            expect(q[0]).to.equal(strategy1.address);
            expect(q[1]).to.equal(strategy2.address);
        });

        it("should add strategy to queue", async function () {
            const { networkHelpers } = await network.connect();
            const { queue, vault1, strategy1 } = await networkHelpers.loadFixture(deployQueueFixture);

            await queue.addToQueue(vault1.address, strategy1.address);
            expect(await queue.getQueueLength(vault1.address)).to.equal(1n);
            expect(await queue.getStrategyAt(vault1.address, 0)).to.equal(strategy1.address);
        });

        it("should remove strategy from queue", async function () {
            const { networkHelpers } = await network.connect();
            const { queue, vault1, strategy1, strategy2 } = await networkHelpers.loadFixture(deployQueueFixture);

            await queue.setQueue(vault1.address, [strategy1.address, strategy2.address]);
            await queue.removeFromQueue(vault1.address, strategy1.address);

            expect(await queue.getQueueLength(vault1.address)).to.equal(1n);
        });

        it("should revert removing non-existent strategy", async function () {
            const { networkHelpers } = await network.connect();
            const { queue, vault1, strategy1 } = await networkHelpers.loadFixture(deployQueueFixture);

            await expect(
                queue.removeFromQueue(vault1.address, strategy1.address)
            ).to.be.revertedWith("Strategy not in queue");
        });

        it("should swap positions", async function () {
            const { networkHelpers } = await network.connect();
            const { queue, vault1, strategy1, strategy2, strategy3 } = await networkHelpers.loadFixture(deployQueueFixture);

            await queue.setQueue(vault1.address, [strategy1.address, strategy2.address, strategy3.address]);
            await queue.swapPositions(vault1.address, 0, 2);

            expect(await queue.getStrategyAt(vault1.address, 0)).to.equal(strategy3.address);
            expect(await queue.getStrategyAt(vault1.address, 2)).to.equal(strategy1.address);
        });

        it("should revert swap with invalid index", async function () {
            const { networkHelpers } = await network.connect();
            const { queue, vault1, strategy1 } = await networkHelpers.loadFixture(deployQueueFixture);

            await queue.addToQueue(vault1.address, strategy1.address);

            await expect(
                queue.swapPositions(vault1.address, 0, 5)
            ).to.be.revertedWith("Invalid index");
        });
    });

    describe("Access Control", function () {
        it("should only allow owner to set queue", async function () {
            const { networkHelpers } = await network.connect();
            const { queue, vault1, strategy1, user1 } = await networkHelpers.loadFixture(deployQueueFixture);

            await expect(
                queue.connect(user1).setQueue(vault1.address, [strategy1.address])
            ).to.be.reverted;
        });

        it("should only allow owner to add to queue", async function () {
            const { networkHelpers } = await network.connect();
            const { queue, vault1, strategy1, user1 } = await networkHelpers.loadFixture(deployQueueFixture);

            await expect(
                queue.connect(user1).addToQueue(vault1.address, strategy1.address)
            ).to.be.reverted;
        });

        it("should only allow owner to remove from queue", async function () {
            const { networkHelpers } = await network.connect();
            const { queue, vault1, strategy1, user1 } = await networkHelpers.loadFixture(deployQueueFixture);

            await queue.addToQueue(vault1.address, strategy1.address);

            await expect(
                queue.connect(user1).removeFromQueue(vault1.address, strategy1.address)
            ).to.be.reverted;
        });
    });
});
