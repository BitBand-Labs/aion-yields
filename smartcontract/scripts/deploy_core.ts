import { network } from "hardhat";
import * as fs from "fs";

interface ChainlinkConfig {
    linkToken: string;
    ccipRouter: string;
    functionsRouter: string;
    donId: string;
}

const CHAINLINK_CONFIG: Record<string, ChainlinkConfig> = {
    sepolia: {
        linkToken: process.env.SEPOLIA_LINK_TOKEN || "0x779877A7B0D9E8603169DdbD7836e478b4624789",
        ccipRouter: process.env.SEPOLIA_CCIP_ROUTER || "0x0BF3dE8c5D3e8A2B34D2BEeB17ABfCeBaf363A59",
        functionsRouter: process.env.SEPOLIA_FUNCTIONS_ROUTER || "0xb83E47C2bC239B3bf370bc41e1459A34b41238D0",
        donId: process.env.SEPOLIA_DON_ID || "0x66756e2d657468657265756d2d7365706f6c69612d3100000000000000000000",
    },
    avalancheFuji: {
        linkToken: process.env.FUJI_LINK_TOKEN || "0x0b9d5D9136855f6FEc3c0993feE6E9CE8a297846",
        ccipRouter: process.env.FUJI_CCIP_ROUTER || "0xF694E193200268f9a4868e4Aa017A0118C9a8177",
        functionsRouter: process.env.FUJI_FUNCTIONS_ROUTER || "0xA9d587a00A31A52Ed70D6026794a8FC5E2F5E6f0",
        donId: process.env.FUJI_DON_ID || "0x66756e2d6176616c616e6368652d66756a692d31000000000000000000000000",
    },
};

async function main() {
    const connection = await network.connect();
    const { ethers } = connection as any;
    const networkName = (connection as any).networkName as string;

    console.log(`\n========================================`);
    console.log(`  AION Yield - Deploying to ${networkName}`);
    console.log(`========================================\n`);

    const rawCfg = CHAINLINK_CONFIG[networkName];
    if (!rawCfg) {
        throw new Error(`No Chainlink config for network: ${networkName}. Supported: ${Object.keys(CHAINLINK_CONFIG).join(", ")}`);
    }
    // Fix checksums by lowercasing addresses (ethers will auto-checksum)
    const chainlinkCfg = {
        linkToken: ethers.getAddress(rawCfg.linkToken.toLowerCase()),
        ccipRouter: ethers.getAddress(rawCfg.ccipRouter.toLowerCase()),
        functionsRouter: ethers.getAddress(rawCfg.functionsRouter.toLowerCase()),
        donId: rawCfg.donId,
    };

    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance:  ${ethers.formatEther(balance)} ETH/AVAX\n`);

    if (balance === 0n) {
        throw new Error("Deployer has zero balance. Fund the wallet first.");
    }

    const owner = deployer.address;
    const treasury = deployer.address; // In production, use a multisig

    const deployed: Record<string, string> = {};

    // 1. InterestRateModel (no constructor args)
    console.log("1/9  Deploying InterestRateModel...");
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    const irModel = await InterestRateModel.deploy();
    await irModel.waitForDeployment();
    deployed.InterestRateModel = await irModel.getAddress();
    console.log(`     -> ${deployed.InterestRateModel}`);

    // 2. LendingPool
    console.log("2/9  Deploying LendingPool...");
    const LendingPool = await ethers.getContractFactory("LendingPool");
    const pool = await LendingPool.deploy(owner, deployed.InterestRateModel, treasury);
    await pool.waitForDeployment();
    deployed.LendingPool = await pool.getAddress();
    console.log(`     -> ${deployed.LendingPool}`);

    // 3. ChainlinkPriceOracle
    console.log("3/9  Deploying ChainlinkPriceOracle...");
    const ChainlinkPriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle");
    const oracle = await ChainlinkPriceOracle.deploy(owner);
    await oracle.waitForDeployment();
    deployed.ChainlinkPriceOracle = await oracle.getAddress();
    console.log(`     -> ${deployed.ChainlinkPriceOracle}`);

    // 4. AIYieldEngine
    console.log("4/9  Deploying AIYieldEngine...");
    const AIYieldEngine = await ethers.getContractFactory("AIYieldEngine");
    const aiEngine = await AIYieldEngine.deploy(owner, deployed.LendingPool);
    await aiEngine.waitForDeployment();
    deployed.AIYieldEngine = await aiEngine.getAddress();
    console.log(`     -> ${deployed.AIYieldEngine}`);

    // 5. LiquidationAutomation
    console.log("5/9  Deploying LiquidationAutomation...");
    const LiquidationAutomation = await ethers.getContractFactory("LiquidationAutomation");
    const automation = await LiquidationAutomation.deploy(owner, deployed.LendingPool);
    await automation.waitForDeployment();
    deployed.LiquidationAutomation = await automation.getAddress();
    console.log(`     -> ${deployed.LiquidationAutomation}`);

    // 6. ChainlinkFunctionsConsumer
    console.log("6/9  Deploying ChainlinkFunctionsConsumer...");
    const subscriptionId = 1n; // Placeholder — update after creating a Functions subscription
    const ChainlinkFunctionsConsumer = await ethers.getContractFactory("ChainlinkFunctionsConsumer");
    const functionsConsumer = await ChainlinkFunctionsConsumer.deploy(
        owner, chainlinkCfg.functionsRouter, subscriptionId, chainlinkCfg.donId, deployed.AIYieldEngine
    );
    await functionsConsumer.waitForDeployment();
    deployed.ChainlinkFunctionsConsumer = await functionsConsumer.getAddress();
    console.log(`     -> ${deployed.ChainlinkFunctionsConsumer}`);

    // 7. CrossChainVault
    console.log("7/9  Deploying CrossChainVault...");
    const CrossChainVault = await ethers.getContractFactory("CrossChainVault");
    const ccVault = await CrossChainVault.deploy(
        chainlinkCfg.ccipRouter, chainlinkCfg.linkToken, deployed.LendingPool, owner
    );
    await ccVault.waitForDeployment();
    deployed.CrossChainVault = await ccVault.getAddress();
    console.log(`     -> ${deployed.CrossChainVault}`);

    // 8. AutonomousAllocator
    console.log("8/9  Deploying AutonomousAllocator...");
    const AutonomousAllocator = await ethers.getContractFactory("AutonomousAllocator");
    const allocator = await AutonomousAllocator.deploy(owner, deployed.LendingPool, deployed.AIYieldEngine);
    await allocator.waitForDeployment();
    deployed.AutonomousAllocator = await allocator.getAddress();
    console.log(`     -> ${deployed.AutonomousAllocator}`);

    // 9. CREExecutionHook
    console.log("9/9  Deploying CREExecutionHook...");
    const CREExecutionHook = await ethers.getContractFactory("CREExecutionHook");
    const creHook = await CREExecutionHook.deploy(
        owner, deployed.LendingPool, deployed.AIYieldEngine,
        deployed.LiquidationAutomation, deployed.CrossChainVault, deployed.AutonomousAllocator
    );
    await creHook.waitForDeployment();
    deployed.CREExecutionHook = await creHook.getAddress();
    console.log(`     -> ${deployed.CREExecutionHook}`);

    // --- Post-deploy wiring ---
    console.log("\nWiring permissions...");

    // Authorize the FunctionsConsumer to call AIYieldEngine
    const tx1 = await aiEngine.setAuthorizedCaller(deployed.ChainlinkFunctionsConsumer, true);
    await tx1.wait();
    console.log("  - AIYieldEngine: authorized ChainlinkFunctionsConsumer");

    // Authorize CREExecutionHook as executor on itself
    const tx2 = await creHook.setAuthorizedExecutor(owner, true);
    await tx2.wait();
    console.log("  - CREExecutionHook: authorized deployer as executor");

    console.log(`\n========================================`);
    console.log(`  Deployment complete on ${networkName}!`);
    console.log(`========================================\n`);

    // Print summary
    console.log("Deployed addresses:");
    for (const [name, addr] of Object.entries(deployed)) {
        console.log(`  ${name.padEnd(30)} ${addr}`);
    }

    // Save to file
    const outputPath = `./deployments/${networkName}.json`;
    fs.mkdirSync("./deployments", { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify({
        network: networkName,
        chainlink: chainlinkCfg,
        deployer: deployer.address,
        timestamp: new Date().toISOString(),
        contracts: deployed,
    }, null, 2));
    console.log(`\nAddresses saved to ${outputPath}`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
