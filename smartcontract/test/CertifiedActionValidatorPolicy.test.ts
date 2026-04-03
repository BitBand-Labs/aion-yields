import "./setup.js";
import { expect } from "chai";
import { network } from "hardhat";

describe("CertifiedActionValidatorPolicy", function () {
    async function deployCertFixture() {
        const connection = await network.connect();
        const { ethers } = connection;
        const [owner, signer1, agent1, agent2, target1, policyEngine] = await ethers.getSigners();

        const CertPolicy = await ethers.getContractFactory("CertifiedActionValidatorPolicy");
        const certPolicy = await CertPolicy.deploy(owner.address, signer1.address);

        await certPolicy.setPolicyEngine(policyEngine.address);

        return { certPolicy, owner, signer1, agent1, agent2, target1, policyEngine, ethers };
    }

    describe("Initialization", function () {
        it("should initialize with correct owner", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, owner } = await networkHelpers.loadFixture(deployCertFixture);
            expect(await certPolicy.owner()).to.equal(owner.address);
        });

        it("should set initial signer as authorized", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, signer1 } = await networkHelpers.loadFixture(deployCertFixture);
            expect(await certPolicy.authorizedSigners(signer1.address)).to.be.true;
        });

        it("should start active", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy } = await networkHelpers.loadFixture(deployCertFixture);
            expect(await certPolicy.isActive()).to.be.true;
        });

        it("should return correct policy name", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy } = await networkHelpers.loadFixture(deployCertFixture);
            expect(await certPolicy.policyName()).to.equal("CertifiedActionValidator");
        });
    });

    describe("Agent Registration", function () {
        it("should register an agent", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, agent1 } = await networkHelpers.loadFixture(deployCertFixture);

            await certPolicy.registerAgent(agent1.address, true);
            expect(await certPolicy.registeredAgents(agent1.address)).to.be.true;
        });

        it("should deregister an agent", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, agent1 } = await networkHelpers.loadFixture(deployCertFixture);

            await certPolicy.registerAgent(agent1.address, true);
            await certPolicy.registerAgent(agent1.address, false);
            expect(await certPolicy.registeredAgents(agent1.address)).to.be.false;
        });

        it("should only allow owner to register agents", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, agent1, agent2 } = await networkHelpers.loadFixture(deployCertFixture);

            await expect(
                certPolicy.connect(agent2).registerAgent(agent1.address, true)
            ).to.be.reverted;
        });
    });

    describe("Signer Management", function () {
        it("should add authorized signer", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, agent1 } = await networkHelpers.loadFixture(deployCertFixture);

            await certPolicy.setAuthorizedSigner(agent1.address, true);
            expect(await certPolicy.authorizedSigners(agent1.address)).to.be.true;
        });

        it("should remove authorized signer", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, signer1 } = await networkHelpers.loadFixture(deployCertFixture);

            await certPolicy.setAuthorizedSigner(signer1.address, false);
            expect(await certPolicy.authorizedSigners(signer1.address)).to.be.false;
        });
    });

    describe("Certificate Submission", function () {
        it("should submit valid certificate", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, signer1, agent1, target1, ethers } = await networkHelpers.loadFixture(deployCertFixture);

            await certPolicy.registerAgent(agent1.address, true);

            const selector = "0x12345678";
            const paramsHash = ethers.keccak256(ethers.toUtf8Bytes("params"));
            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const nonce = 0;

            // Build EIP-712 signature
            const domain = {
                name: "AION-ACE-CertifiedAction",
                version: "1",
                chainId: (await ethers.provider.getNetwork()).chainId,
                verifyingContract: await certPolicy.getAddress()
            };

            const types = {
                ActionCertificate: [
                    { name: "agent", type: "address" },
                    { name: "target", type: "address" },
                    { name: "selector", type: "bytes4" },
                    { name: "paramsHash", type: "bytes32" },
                    { name: "nonce", type: "uint256" },
                    { name: "deadline", type: "uint256" }
                ]
            };

            const value = {
                agent: agent1.address,
                target: target1.address,
                selector: selector,
                paramsHash: paramsHash,
                nonce: nonce,
                deadline: deadline
            };

            const signature = await signer1.signTypedData(domain, types, value);

            await certPolicy.submitCertificate(
                agent1.address,
                target1.address,
                selector,
                paramsHash,
                deadline,
                signature
            );

            expect(await certPolicy.agentNonces(agent1.address)).to.equal(1n);
        });

        it("should revert for unregistered agent", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, agent1, target1, ethers } = await networkHelpers.loadFixture(deployCertFixture);

            const deadline = Math.floor(Date.now() / 1000) + 3600;
            const paramsHash = ethers.keccak256(ethers.toUtf8Bytes("params"));

            await expect(
                certPolicy.submitCertificate(agent1.address, target1.address, "0x12345678", paramsHash, deadline, "0x" + "00".repeat(65))
            ).to.be.revertedWith("Agent not registered");
        });

        it("should revert for expired certificate", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, agent1, target1, ethers } = await networkHelpers.loadFixture(deployCertFixture);

            await certPolicy.registerAgent(agent1.address, true);
            const paramsHash = ethers.keccak256(ethers.toUtf8Bytes("params"));

            await expect(
                certPolicy.submitCertificate(agent1.address, target1.address, "0x12345678", paramsHash, 0, "0x" + "00".repeat(65))
            ).to.be.revertedWith("Certificate expired");
        });
    });

    describe("Validation", function () {
        it("should pass for non-registered agents (skip policy)", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, agent1, target1 } = await networkHelpers.loadFixture(deployCertFixture);

            const [valid] = await certPolicy.validate(agent1.address, target1.address, "0x12345678", "0x");
            expect(valid).to.be.true;
        });

        it("should fail for registered agent without certificate", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, agent1, target1 } = await networkHelpers.loadFixture(deployCertFixture);

            await certPolicy.registerAgent(agent1.address, true);

            const [valid, reason] = await certPolicy.validate(agent1.address, target1.address, "0x12345678", "0x");
            expect(valid).to.be.false;
            expect(reason).to.include("No valid certificate");
        });

        it("should pass when inactive", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, agent1, target1 } = await networkHelpers.loadFixture(deployCertFixture);

            await certPolicy.registerAgent(agent1.address, true);
            await certPolicy.setActive(false);

            const [valid] = await certPolicy.validate(agent1.address, target1.address, "0x12345678", "0x");
            expect(valid).to.be.true;
        });
    });

    describe("Admin Functions", function () {
        it("should toggle active state", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy } = await networkHelpers.loadFixture(deployCertFixture);

            await certPolicy.setActive(false);
            expect(await certPolicy.isActive()).to.be.false;
        });

        it("should set policy engine", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, agent1 } = await networkHelpers.loadFixture(deployCertFixture);

            await certPolicy.setPolicyEngine(agent1.address);
            expect(await certPolicy.policyEngine()).to.equal(agent1.address);
        });

        it("should return domain separator", async function () {
            const { networkHelpers } = await network.connect();
            const { certPolicy, ethers } = await networkHelpers.loadFixture(deployCertFixture);

            const separator = await certPolicy.domainSeparator();
            expect(separator).to.not.equal(ethers.ZeroHash);
        });
    });
});
