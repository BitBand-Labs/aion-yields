import { network } from "hardhat";
import * as fs from "fs";

async function main() {
    const connection = await network.connect();
    const { ethers } = connection as any;
    const networkName = (connection as any).networkName as string;

    console.log(`\n========================================`);
    console.log(`  AION Yield - Deploying Remaining Contracts to ${networkName}`);
    console.log(`========================================\n`);

    // Load existing deployment
    const deploymentPath = `./deployments/${networkName}.json`;
    if (!fs.existsSync(deploymentPath)) {
        throw new Error(`No existing deployment found at ${deploymentPath}. Run deploy_core.ts first.`);
    }
    const existing = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const deployed = { ...existing.contracts };

    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance:  ${ethers.formatEther(balance)} ETH/AVAX\n`);

    if (balance === 0n) {
        throw new Error("Deployer has zero balance. Fund the wallet first.");
    }

    const owner = deployer.address;
    const treasury = deployer.address;
    const insuranceFund = deployer.address;
    const developmentFund = deployer.address;

    // 1. Deploy MockERC20 as USDC for payment/staking modules
    console.log("1/6  Deploying MockUSDC (staking/payment token)...");
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const mockUsdc = await MockERC20.deploy("AION USD Coin", "USDC", 6);
    await mockUsdc.waitForDeployment();
    deployed.MockUSDC = await mockUsdc.getAddress();
    console.log(`     -> ${deployed.MockUSDC}`);

    // 2. AIAgentRegistry(owner, stakingToken, minStake)
    console.log("2/6  Deploying AIAgentRegistry...");
    const minStake = ethers.parseUnits("100", 6); // 100 USDC minimum stake
    const AIAgentRegistry = await ethers.getContractFactory("AIAgentRegistry");
    const registry = await AIAgentRegistry.deploy(owner, deployed.MockUSDC, minStake);
    await registry.waitForDeployment();
    deployed.AIAgentRegistry = await registry.getAddress();
    console.log(`     -> ${deployed.AIAgentRegistry}`);

    // 3. X402PaymentGateway(owner, paymentToken, feeRecipient)
    console.log("3/6  Deploying X402PaymentGateway...");
    const X402PaymentGateway = await ethers.getContractFactory("X402PaymentGateway");
    const gateway = await X402PaymentGateway.deploy(owner, deployed.MockUSDC, treasury);
    await gateway.waitForDeployment();
    deployed.X402PaymentGateway = await gateway.getAddress();
    console.log(`     -> ${deployed.X402PaymentGateway}`);

    // 4. AIRevenueDistributor(owner, revenueToken, agentRegistry, communityPool, protocolReserve)
    console.log("4/6  Deploying AIRevenueDistributor...");
    const AIRevenueDistributor = await ethers.getContractFactory("AIRevenueDistributor");
    const distributor = await AIRevenueDistributor.deploy(
        owner, deployed.MockUSDC, deployed.AIAgentRegistry, treasury, treasury
    );
    await distributor.waitForDeployment();
    deployed.AIRevenueDistributor = await distributor.getAddress();
    console.log(`     -> ${deployed.AIRevenueDistributor}`);

    // 5. GovernanceController(owner, guardian)
    console.log("5/6  Deploying GovernanceController...");
    const GovernanceController = await ethers.getContractFactory("GovernanceController");
    const governance = await GovernanceController.deploy(owner, owner);
    await governance.waitForDeployment();
    deployed.GovernanceController = await governance.getAddress();
    console.log(`     -> ${deployed.GovernanceController}`);

    // 6. ProtocolFeeController(owner, treasury, insuranceFund, developmentFund)
    console.log("6/6  Deploying ProtocolFeeController...");
    const ProtocolFeeController = await ethers.getContractFactory("ProtocolFeeController");
    const feeController = await ProtocolFeeController.deploy(owner, treasury, insuranceFund, developmentFund);
    await feeController.waitForDeployment();
    deployed.ProtocolFeeController = await feeController.getAddress();
    console.log(`     -> ${deployed.ProtocolFeeController}`);

    // --- Post-deploy wiring ---
    console.log("\nWiring permissions...");

    // Register core contracts as governed in GovernanceController
    const tx1 = await governance.addGovernedContract(deployed.LendingPool);
    await tx1.wait();
    console.log("  - GovernanceController: added LendingPool as governed");

    const tx2 = await governance.addGovernedContract(deployed.AIYieldEngine);
    await tx2.wait();
    console.log("  - GovernanceController: added AIYieldEngine as governed");

    console.log(`\n========================================`);
    console.log(`  Remaining contracts deployed on ${networkName}!`);
    console.log(`========================================\n`);

    // Print summary of NEW contracts
    const newContracts = ["MockUSDC", "AIAgentRegistry", "X402PaymentGateway", "AIRevenueDistributor", "GovernanceController", "ProtocolFeeController"];
    console.log("New deployed addresses:");
    for (const name of newContracts) {
        console.log(`  ${name.padEnd(30)} ${deployed[name]}`);
    }

    // Update deployment file with all contracts
    fs.writeFileSync(deploymentPath, JSON.stringify({
        ...existing,
        timestamp: new Date().toISOString(),
        contracts: deployed,
    }, null, 2));
    console.log(`\nDeployment file updated: ${deploymentPath}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
