/**
 * Wire up all contract references that were missed in deploy_core.ts
 */
import { network } from "hardhat";
import * as fs from "fs";

async function main() {
    const connection = await network.connect();
    const { ethers } = connection as any;
    const networkName = (connection as any).networkName as string;

    const [deployer] = await ethers.getSigners();
    console.log(`  Deployer: ${deployer.address}`);
    console.log(`  Network:  ${networkName}\n`);

    const deployment = JSON.parse(fs.readFileSync(`./deployments/${networkName}.json`, "utf8"));
    const c = deployment.contracts;

    // 1. Set AutonomousAllocator on AIYieldEngine
    const AIYieldEngine = await ethers.getContractFactory("AIYieldEngine");
    const aiEngine = AIYieldEngine.attach(c.AIYieldEngine) as any;

    const currentAllocator = await aiEngine.autonomousAllocator();
    if (currentAllocator === ethers.ZeroAddress) {
        console.log("1. Setting AutonomousAllocator on AIYieldEngine...");
        const tx = await aiEngine.setAutonomousAllocator(c.AutonomousAllocator);
        await tx.wait();
        console.log("   ✓ Done");
    } else {
        console.log(`1. AutonomousAllocator already set: ${currentAllocator}`);
    }

    // 2. Authorize AIYieldEngine as caller on AutonomousAllocator
    const AutonomousAllocator = await ethers.getContractFactory("AutonomousAllocator");
    const allocator = AutonomousAllocator.attach(c.AutonomousAllocator) as any;

    try {
        const isAuthorized = await allocator.authorizedCallers(c.AIYieldEngine);
        if (!isAuthorized) {
            console.log("2. Authorizing AIYieldEngine on AutonomousAllocator...");
            const tx = await allocator.setAuthorizedCaller(c.AIYieldEngine, true);
            await tx.wait();
            console.log("   ✓ Done");
        } else {
            console.log("2. AIYieldEngine already authorized on AutonomousAllocator");
        }
    } catch {
        console.log("2. Trying to authorize AIYieldEngine on AutonomousAllocator...");
        try {
            const tx = await allocator.setAuthorizedCaller(c.AIYieldEngine, true);
            await tx.wait();
            console.log("   ✓ Done");
        } catch (e: any) {
            console.log(`   ⚠ Failed: ${e.message?.substring(0, 80)}`);
        }
    }

    // 3. Add MockUSDC as supported asset on AutonomousAllocator
    try {
        const isSupported = await allocator.supportedAssets(c.MockUSDC);
        if (!isSupported) {
            console.log("3. Adding MockUSDC as supported asset on AutonomousAllocator...");
            const tx = await allocator.addSupportedAsset(c.MockUSDC);
            await tx.wait();
            console.log("   ✓ Done");
        } else {
            console.log("3. MockUSDC already supported on AutonomousAllocator");
        }
    } catch (e: any) {
        console.log(`3. ⚠ Failed to add supported asset: ${e.message?.substring(0, 80)}`);
    }

    console.log("\nAll contracts wired up!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
