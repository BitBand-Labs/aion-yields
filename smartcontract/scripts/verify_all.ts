/**
 * Verify all deployed contracts on Etherscan (Sepolia) and Snowtrace (Fuji).
 *
 * Hardhat 3 doesn't support hre.run("verify") — we shell out to the CLI instead.
 *
 * Prerequisites:
 *   - Add ETHERSCAN_API_KEY to .env
 *   - Add SNOWTRACE_API_KEY to .env (use "abc" for testnet)
 *
 * Usage:
 *   npx hardhat run scripts/verify_all.ts --network sepolia
 *   npx hardhat run scripts/verify_all.ts --network avalancheFuji
 */
import { network } from "hardhat";
import * as fs from "fs";
import { execSync } from "child_process";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function verifyContract(
    networkFlag: string,
    name: string,
    address: string,
    constructorArgs: string[],
    contractPath?: string
) {
    console.log(`\nVerifying ${name} at ${address}...`);
    try {
        const args = constructorArgs.join(" ");
        const contractFlag = contractPath ? `--contract "${contractPath}"` : "";
        const cmd = `npx hardhat verify --network ${networkFlag} ${contractFlag} ${address} ${args}`;
        console.log(`  $ ${cmd}`);
        const output = execSync(cmd, {
            cwd: process.cwd(),
            encoding: "utf8",
            timeout: 120000,
            stdio: ["pipe", "pipe", "pipe"],
            env: { ...process.env },
        });
        console.log(`  ✓ ${name} verified!`);
        if (output) console.log(`  ${output.trim().split("\n").slice(-2).join("\n  ")}`);
        return true;
    } catch (error: any) {
        const stderr = error.stderr || "";
        const stdout = error.stdout || "";
        const combined = stderr + stdout;
        if (combined.includes("Already Verified") || combined.includes("already verified")) {
            console.log(`  ✓ ${name} already verified.`);
            return true;
        }
        console.log(`  ✗ ${name} failed: ${combined.slice(0, 300)}`);
        return false;
    }
}

async function main() {
    const connection = await network.connect();
    const networkName = (connection as any).networkName as string;

    console.log(`\n========================================`);
    console.log(`  Verifying ALL contracts on ${networkName}`);
    console.log(`========================================\n`);

    const deploymentPath = `./deployments/${networkName}.json`;
    if (!fs.existsSync(deploymentPath)) {
        throw new Error(`No deployment file: ${deploymentPath}`);
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const c = deployment.contracts;
    const deployer = deployment.deployer;

    // Chainlink config
    const chainlink = deployment.chainlink || {};
    const functionsRouter = chainlink.functionsRouter || "0x" + "0".repeat(40);
    const donId = chainlink.donId || "0x" + "0".repeat(64);

    // Teleporter config
    const teleporter = deployment.teleporter || {};
    const teleporterAddr = teleporter.messengerAddress || "0x" + "0".repeat(40);

    // minStake = 100 USDC = 100000000 (6 decimals)
    const minStake = "100000000";

    // Define all contracts and their constructor args as string arrays
    const contracts: Array<{
        name: string;
        address: string;
        args: string[];
        contractPath?: string;
    }> = [
        {
            name: "InterestRateModel",
            address: c.InterestRateModel,
            args: [],
        },
        {
            name: "LendingPool",
            address: c.LendingPool,
            args: [deployer, c.InterestRateModel, deployer],
        },
        {
            name: "ChainlinkPriceOracle",
            address: c.ChainlinkPriceOracle,
            args: [deployer],
        },
        {
            name: "AIYieldEngine",
            address: c.AIYieldEngine,
            args: [deployer, c.LendingPool],
        },
        {
            name: "LiquidationAutomation",
            address: c.LiquidationAutomation,
            args: [deployer, c.LendingPool],
        },
        {
            name: "ChainlinkFunctionsConsumer",
            address: c.ChainlinkFunctionsConsumer,
            args: [deployer, functionsRouter, "1", donId, c.AIYieldEngine],
        },
        {
            name: "CrossChainVault",
            address: c.CrossChainVault,
            args: [teleporterAddr, c.LendingPool, deployer],
        },
        {
            name: "AutonomousAllocator",
            address: c.AutonomousAllocator,
            args: [deployer, c.LendingPool, c.AIYieldEngine],
        },
        {
            name: "CREExecutionHook",
            address: c.CREExecutionHook,
            args: [deployer, c.LendingPool, c.AIYieldEngine, c.LiquidationAutomation, c.CrossChainVault, c.AutonomousAllocator],
        },
        {
            name: "MockERC20",
            address: c.MockUSDC,
            args: ["AION USD Coin", "USDC", "6"],
            contractPath: "contracts/mocks/MockERC20.sol:MockERC20",
        },
        {
            name: "AIAgentRegistry",
            address: c.AIAgentRegistry,
            args: [deployer, c.MockUSDC, minStake],
        },
        {
            name: "X402PaymentGateway",
            address: c.X402PaymentGateway,
            args: [deployer, c.MockUSDC, deployer],
        },
        {
            name: "AIRevenueDistributor",
            address: c.AIRevenueDistributor,
            args: [deployer, c.MockUSDC, c.AIAgentRegistry, deployer, deployer],
        },
        {
            name: "GovernanceController",
            address: c.GovernanceController,
            args: [deployer, deployer],
        },
        {
            name: "ProtocolFeeController",
            address: c.ProtocolFeeController,
            args: [deployer, deployer, deployer, deployer],
        },
        {
            name: "PolicyEngine",
            address: c.PolicyEngine,
            args: [deployer],
        },
        {
            name: "CertifiedActionValidatorPolicy",
            address: c.CertifiedActionValidatorPolicy,
            args: [deployer, deployer],
        },
        {
            name: "VolumeRatePolicy",
            address: c.VolumeRatePolicy,
            args: [deployer],
        },
    ];

    let verified = 0;
    let failed = 0;

    for (const contract of contracts) {
        if (!contract.address) {
            console.log(`\n  Skipping ${contract.name} — no address found`);
            continue;
        }
        const ok = await verifyContract(
            networkName === "avalancheFuji" ? "avalancheFuji" : networkName,
            contract.name,
            contract.address,
            contract.args,
            contract.contractPath
        );
        if (ok) verified++;
        else failed++;
        await sleep(3000); // Rate limit between calls
    }

    console.log(`\n========================================`);
    console.log(`  Verification complete on ${networkName}`);
    console.log(`  Verified: ${verified} | Failed: ${failed}`);
    console.log(`========================================\n`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
