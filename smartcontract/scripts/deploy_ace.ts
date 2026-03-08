/**
 * Deploy Chainlink ACE (Automated Compliance Engine) contracts
 * and wire them into existing AION Yield protocol.
 *
 * Run after deploy_core.ts and deploy_remaining.ts:
 *   npx hardhat run scripts/deploy_ace.ts --network sepolia
 */
import { network } from "hardhat";
import * as fs from "fs";

async function main() {
    const connection = await network.connect();
    const { ethers } = connection as any;
    const networkName = (connection as any).networkName as string;

    console.log(`\n========================================`);
    console.log(`  AION Yield - Deploying ACE Contracts to ${networkName}`);
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
    console.log(`Balance:  ${ethers.formatEther(balance)} ETH\n`);

    if (balance === 0n) {
        throw new Error("Deployer has zero balance. Fund the wallet first.");
    }

    const owner = deployer.address;

    // ============================================================
    //  1. Deploy PolicyEngine
    // ============================================================
    console.log("1/3  Deploying PolicyEngine...");
    const PolicyEngine = await ethers.getContractFactory("PolicyEngine");
    const policyEngine = await PolicyEngine.deploy(owner);
    await policyEngine.waitForDeployment();
    deployed.PolicyEngine = await policyEngine.getAddress();
    console.log(`     -> ${deployed.PolicyEngine}`);

    // ============================================================
    //  2. Deploy CertifiedActionValidatorPolicy
    // ============================================================
    console.log("2/3  Deploying CertifiedActionValidatorPolicy...");
    const CertifiedActionValidatorPolicy = await ethers.getContractFactory("CertifiedActionValidatorPolicy");
    // Use deployer as the initial authorized signer (can be changed to DON address later)
    const certPolicy = await CertifiedActionValidatorPolicy.deploy(owner, owner);
    await certPolicy.waitForDeployment();
    deployed.CertifiedActionValidatorPolicy = await certPolicy.getAddress();
    console.log(`     -> ${deployed.CertifiedActionValidatorPolicy}`);

    // ============================================================
    //  3. Deploy VolumeRatePolicy
    // ============================================================
    console.log("3/3  Deploying VolumeRatePolicy...");
    const VolumeRatePolicy = await ethers.getContractFactory("VolumeRatePolicy");
    const volumePolicy = await VolumeRatePolicy.deploy(owner);
    await volumePolicy.waitForDeployment();
    deployed.VolumeRatePolicy = await volumePolicy.getAddress();
    console.log(`     -> ${deployed.VolumeRatePolicy}`);

    // ============================================================
    //  Post-Deploy Wiring
    // ============================================================
    console.log("\nWiring ACE into AION Yield protocol...");

    // --- Wire PolicyEngine into CertifiedActionValidatorPolicy ---
    console.log("  - Setting PolicyEngine on CertifiedActionValidatorPolicy...");
    const tx1 = await certPolicy.setPolicyEngine(deployed.PolicyEngine);
    await tx1.wait();
    console.log("    ✓ Done");

    // --- Wire PolicyEngine into VolumeRatePolicy ---
    console.log("  - Setting PolicyEngine on VolumeRatePolicy...");
    const tx2 = await volumePolicy.setPolicyEngine(deployed.PolicyEngine);
    await tx2.wait();
    console.log("    ✓ Done");

    // --- Set GovernanceController on PolicyEngine ---
    console.log("  - Setting GovernanceController on PolicyEngine...");
    const tx3 = await policyEngine.setGovernanceController(deployed.GovernanceController);
    await tx3.wait();
    console.log("    ✓ Done");

    // --- Re-deploy AIYieldEngine with PolicyProtected ---
    console.log("\n  Redeploying AIYieldEngine (with PolicyProtected)...");
    const AIYieldEngine = await ethers.getContractFactory("AIYieldEngine");
    const newAIEngine = await AIYieldEngine.deploy(owner, deployed.LendingPool);
    await newAIEngine.waitForDeployment();
    const newAIEngineAddr = await newAIEngine.getAddress();
    console.log(`    -> New AIYieldEngine: ${newAIEngineAddr}`);

    // Copy over settings from old engine
    console.log("    - Setting AutonomousAllocator...");
    const txA = await newAIEngine.setAutonomousAllocator(deployed.AutonomousAllocator);
    await txA.wait();

    // Authorize CREExecutionHook as caller
    console.log("    - Authorizing CREExecutionHook...");
    const txB = await newAIEngine.setAuthorizedCaller(deployed.CREExecutionHook, true);
    await txB.wait();

    // Authorize ChainlinkFunctionsConsumer as caller
    console.log("    - Authorizing ChainlinkFunctionsConsumer...");
    const txC = await newAIEngine.setAuthorizedCaller(deployed.ChainlinkFunctionsConsumer, true);
    await txC.wait();

    // Wire PolicyEngine into new AIYieldEngine
    console.log("    - Setting PolicyEngine on AIYieldEngine...");
    const txD = await newAIEngine.setPolicyEngine(deployed.PolicyEngine);
    await txD.wait();

    // Enable policy enforcement
    console.log("    - Enabling policy enforcement on AIYieldEngine...");
    const txE = await newAIEngine.setPolicyEnforcement(true);
    await txE.wait();

    deployed.AIYieldEngine = newAIEngineAddr;
    console.log("    ✓ AIYieldEngine redeployed and wired");

    // --- Re-deploy AutonomousAllocator with PolicyProtected ---
    console.log("\n  Redeploying AutonomousAllocator (with PolicyProtected)...");
    const AutonomousAllocator = await ethers.getContractFactory("AutonomousAllocator");
    const newAllocator = await AutonomousAllocator.deploy(owner, deployed.LendingPool, deployed.AIYieldEngine);
    await newAllocator.waitForDeployment();
    const newAllocatorAddr = await newAllocator.getAddress();
    console.log(`    -> New AutonomousAllocator: ${newAllocatorAddr}`);

    // Add MockUSDC as supported asset
    console.log("    - Adding MockUSDC as supported asset...");
    const txF = await newAllocator.addSupportedAsset(deployed.MockUSDC);
    await txF.wait();

    // Wire PolicyEngine
    console.log("    - Setting PolicyEngine on AutonomousAllocator...");
    const txG = await newAllocator.setPolicyEngine(deployed.PolicyEngine);
    await txG.wait();

    // Enable policy enforcement
    console.log("    - Enabling policy enforcement on AutonomousAllocator...");
    const txH = await newAllocator.setPolicyEnforcement(true);
    await txH.wait();

    deployed.AutonomousAllocator = newAllocatorAddr;
    console.log("    ✓ AutonomousAllocator redeployed and wired");

    // --- Update AIYieldEngine's allocator reference ---
    console.log("\n  Updating AIYieldEngine -> AutonomousAllocator reference...");
    const aiEngine2 = AIYieldEngine.attach(deployed.AIYieldEngine) as any;
    const txI = await aiEngine2.setAutonomousAllocator(deployed.AutonomousAllocator);
    await txI.wait();
    console.log("    ✓ Done");

    // --- Authorize both contracts on PolicyEngine ---
    console.log("  - Authorizing AIYieldEngine on PolicyEngine...");
    const txJ = await policyEngine.setAuthorizedCaller(deployed.AIYieldEngine, true);
    await txJ.wait();
    console.log("    ✓ Done");

    console.log("  - Authorizing AutonomousAllocator on PolicyEngine...");
    const txK = await policyEngine.setAuthorizedCaller(deployed.AutonomousAllocator, true);
    await txK.wait();
    console.log("    ✓ Done");

    // --- Register policies on PolicyEngine ---
    // CertifiedActionValidatorPolicy as global policy (applies to all protected functions)
    console.log("  - Adding CertifiedActionValidatorPolicy as global policy...");
    const txL = await policyEngine.addGlobalPolicy(deployed.CertifiedActionValidatorPolicy);
    await txL.wait();
    console.log("    ✓ Done");

    // VolumeRatePolicy for AutonomousAllocator.executeAllocation
    const executeAllocationSelector = "0x" + ethers.keccak256(
        ethers.toUtf8Bytes("executeAllocation(address,(uint256,uint256)[],uint256,bytes32)")
    ).slice(2, 10);
    console.log(`  - Adding VolumeRatePolicy for executeAllocation (${executeAllocationSelector})...`);
    const txM = await policyEngine.addPolicy(
        deployed.AutonomousAllocator,
        executeAllocationSelector,
        deployed.VolumeRatePolicy
    );
    await txM.wait();
    console.log("    ✓ Done");

    // --- Configure VolumeRatePolicy limits ---
    console.log("  - Configuring VolumeRatePolicy limits for executeAllocation...");
    const txN = await volumePolicy.setRateLimit(
        deployed.AutonomousAllocator,
        executeAllocationSelector,
        1000, // maxSingleAmountBps: 10% of TVL per action
        ethers.parseUnits("500000", 6), // maxWindowAmount: 500K USDC per window
        5, // maxActionsPerWindow: 5 rebalances per window
        3600 // windowDuration: 1 hour
    );
    await txN.wait();
    console.log("    ✓ VolumeRatePolicy: max 10% TVL/action, 500K/hour, 5 actions/hour");

    // --- Add PolicyEngine as governed contract in GovernanceController ---
    console.log("  - Adding PolicyEngine as governed contract...");
    const GovernanceController = await ethers.getContractFactory("GovernanceController");
    const governance = GovernanceController.attach(deployed.GovernanceController) as any;
    const txO = await governance.addGovernedContract(deployed.PolicyEngine);
    await txO.wait();
    console.log("    ✓ Done");

    // --- Set PolicyEngine on GovernanceController ---
    console.log("  - Setting PolicyEngine on GovernanceController...");
    const txP = await governance.setPolicyEngine(deployed.PolicyEngine);
    await txP.wait();
    console.log("    ✓ Done");

    // --- Add new AI contracts as governed ---
    console.log("  - Adding new AIYieldEngine as governed contract...");
    const txQ = await governance.addGovernedContract(deployed.AIYieldEngine);
    await txQ.wait();
    console.log("    ✓ Done");

    console.log("  - Adding new AutonomousAllocator as governed contract...");
    const txR = await governance.addGovernedContract(deployed.AutonomousAllocator);
    await txR.wait();
    console.log("    ✓ Done");

    // ============================================================
    //  Save deployment
    // ============================================================
    console.log(`\n========================================`);
    console.log(`  ACE contracts deployed on ${networkName}!`);
    console.log(`========================================\n`);

    const aceContracts = ["PolicyEngine", "CertifiedActionValidatorPolicy", "VolumeRatePolicy"];
    const redeployed = ["AIYieldEngine", "AutonomousAllocator"];

    console.log("NEW ACE contracts:");
    for (const name of aceContracts) {
        console.log(`  ${name.padEnd(40)} ${deployed[name]}`);
    }
    console.log("\nRedeployed (with PolicyProtected):");
    for (const name of redeployed) {
        console.log(`  ${name.padEnd(40)} ${deployed[name]}`);
    }

    // Update deployment file
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
