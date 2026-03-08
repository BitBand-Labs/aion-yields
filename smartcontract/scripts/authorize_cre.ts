/**
 * Authorize CREExecutionHook on AIYieldEngine and enable AI allocation
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

    const AIYieldEngine = await ethers.getContractFactory("AIYieldEngine");
    const aiEngine = AIYieldEngine.attach(c.AIYieldEngine) as any;

    console.log("1/3 Authorizing CREExecutionHook as caller on AIYieldEngine...");
    const tx1 = await aiEngine.setAuthorizedCaller(c.CREExecutionHook, true);
    await tx1.wait();
    console.log("    ✓ Authorized");

    console.log("2/3 Enabling AI adjustments...");
    const tx2 = await aiEngine.setAIAdjustmentsEnabled(true);
    await tx2.wait();
    console.log("    ✓ AI adjustments enabled");

    console.log("3/3 Enabling AI allocation...");
    const tx3 = await aiEngine.setAIAllocationEnabled(true);
    await tx3.wait();
    console.log("    ✓ AI allocation enabled");

    console.log("\nDone! CRE workflow should now complete successfully.");
}

main()
    .then(() => process.exit(0))
    .catch((error) => { console.error(error); process.exit(1); });
