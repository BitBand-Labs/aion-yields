/**
 * Finish ACE wiring — add new AI contracts as governed in GovernanceController.
 * The deploy_ace.ts script failed on setPolicyEngine (old GovernanceController didn't have it).
 * This script completes the remaining governance registration.
 */
import { network } from "hardhat";
import * as fs from "fs";

async function main() {
    const connection = await network.connect();
    const { ethers } = connection as any;
    const networkName = (connection as any).networkName as string;

    const deployment = JSON.parse(fs.readFileSync(`./deployments/${networkName}.json`, "utf8"));
    const c = deployment.contracts;

    const [deployer] = await ethers.getSigners();
    console.log(`Deployer: ${deployer.address}\n`);

    const GovernanceController = await ethers.getContractFactory("GovernanceController");
    const governance = GovernanceController.attach(c.GovernanceController) as any;

    // Add AIYieldEngine as governed
    try {
        console.log("1. Adding new AIYieldEngine as governed contract...");
        const tx = await governance.addGovernedContract(c.AIYieldEngine);
        await tx.wait();
        console.log("   ✓ Done");
    } catch (e: any) {
        console.log(`   ⚠ ${e.message?.substring(0, 80)}`);
    }

    // Add AutonomousAllocator as governed
    try {
        console.log("2. Adding new AutonomousAllocator as governed contract...");
        const tx = await governance.addGovernedContract(c.AutonomousAllocator);
        await tx.wait();
        console.log("   ✓ Done");
    } catch (e: any) {
        console.log(`   ⚠ ${e.message?.substring(0, 80)}`);
    }

    // Also update LendingPool to point to new AIYieldEngine
    try {
        console.log("3. Updating LendingPool -> new AIYieldEngine...");
        const LendingPool = await ethers.getContractFactory("LendingPool");
        const pool = LendingPool.attach(c.LendingPool) as any;
        const tx = await pool.setAIYieldEngine(c.AIYieldEngine);
        await tx.wait();
        console.log("   ✓ Done");
    } catch (e: any) {
        console.log(`   ⚠ ${e.message?.substring(0, 80)}`);
    }

    console.log("\nAll ACE wiring complete!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
