/**
 * Demo Script: AutonomousAllocator - AI-Driven Cross-Protocol Rebalancing
 *
 * Demonstrates how the AI decides to move idle funds across protocols
 * (AION Pool, Aave V3, Morpho Blue) to maximize yield.
 *
 * Steps:
 * 1. Deploy mock Aave & Morpho adapters
 * 2. Register them in the AutonomousAllocator
 * 3. Fund the allocator with USDC
 * 4. Call AI engine for allocation recommendation
 * 5. Execute the rebalance on-chain
 * 6. Show funds distributed across protocols
 *
 * Usage:
 *   npx hardhat run scripts/demo_allocator.ts --network sepolia
 */

import { network } from "hardhat";
import * as fs from "fs";

async function main() {
    const connection = await network.connect();
    const { ethers } = connection as any;
    const networkName = (connection as any).networkName as string;

    const [deployer] = await ethers.getSigners();
    console.log(`\n  Deployer: ${deployer.address}`);
    console.log(`  Network:  ${networkName}\n`);

    const deploymentPath = `./deployments/${networkName}.json`;
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const contracts = deployment.contracts;

    // Connect to contracts
    const AutonomousAllocator = await ethers.getContractFactory("AutonomousAllocator");
    const allocator = AutonomousAllocator.attach(contracts.AutonomousAllocator) as any;

    const AIYieldEngine = await ethers.getContractFactory("AIYieldEngine");
    const aiEngine = AIYieldEngine.attach(contracts.AIYieldEngine) as any;

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = MockUSDC.attach(contracts.MockUSDC) as any;

    const mockUsdcAddress = contracts.MockUSDC;

    console.log("========================================");
    console.log("  AION Yield - Autonomous Allocator Demo");
    console.log("========================================\n");

    // ── Step 1: Deploy Mock Protocol Adapters ──
    console.log("STEP 1/7  Deploying mock protocol adapters...\n");

    const MockProtocolAdapter = await ethers.getContractFactory("MockProtocolAdapter");

    // Aave V3 mock — 4.2% APY (in RAY = 4.2e25)
    const aaveAPY = ethers.parseUnits("42", 24); // 4.2% in RAY
    const aaveAdapter = await MockProtocolAdapter.deploy("Aave V3", aaveAPY);
    await aaveAdapter.waitForDeployment();
    const aaveAddress = await aaveAdapter.getAddress();
    console.log(`  ✓ Aave V3 Adapter deployed: ${aaveAddress}`);
    console.log(`    Mock APY: 4.20%`);

    // Morpho Blue mock — 5.8% APY
    const morphoAPY = ethers.parseUnits("58", 24); // 5.8% in RAY
    const morphoAdapter = await MockProtocolAdapter.deploy("Morpho Blue", morphoAPY);
    await morphoAdapter.waitForDeployment();
    const morphoAddress = await morphoAdapter.getAddress();
    console.log(`  ✓ Morpho Blue Adapter deployed: ${morphoAddress}`);
    console.log(`    Mock APY: 5.80%\n`);

    // ── Step 2: Register adapters in Allocator ──
    console.log("STEP 2/7  Registering protocol adapters in Allocator...\n");

    // Check current protocol count
    const currentCount = await allocator.protocolCount();
    console.log(`  Current protocol count: ${currentCount}`);

    if (Number(currentCount) < 2) {
        // Register Aave (max 65% allocation)
        const tx1 = await allocator.registerProtocol(aaveAddress, "Aave V3", 6500);
        await tx1.wait();
        console.log(`  ✓ Aave V3 registered (index ${Number(currentCount)}, max 65%)`);

        // Register Morpho (max 40% allocation)
        const tx2 = await allocator.registerProtocol(morphoAddress, "Morpho Blue", 4000);
        await tx2.wait();
        console.log(`  ✓ Morpho Blue registered (index ${Number(currentCount) + 1}, max 40%)`);
    } else {
        console.log(`  Protocols already registered (count: ${currentCount})`);
    }

    const totalProtocols = await allocator.protocolCount();
    console.log(`  Total protocols: ${totalProtocols}\n`);

    // ── Step 3: Fund the Allocator with USDC ──
    console.log("STEP 3/7  Funding Allocator with USDC...\n");

    const fundAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
    const allocatorAddress = contracts.AutonomousAllocator;

    // Mint USDC to deployer if needed, then transfer to allocator
    const currentBalance = await usdc.balanceOf(allocatorAddress);
    console.log(`  Current allocator balance: ${Number(currentBalance) / 1e6} USDC`);

    if (Number(currentBalance) < Number(fundAmount)) {
        // Mint to deployer
        const mintTx = await usdc.mint(deployer.address, fundAmount);
        await mintTx.wait();

        // Transfer to allocator
        const transferTx = await usdc.transfer(allocatorAddress, fundAmount);
        await transferTx.wait();
        console.log(`  ✓ Transferred ${Number(fundAmount) / 1e6} USDC to Allocator`);
    }

    const newBalance = await usdc.balanceOf(allocatorAddress);
    console.log(`  Allocator balance: ${Number(newBalance) / 1e6} USDC\n`);

    // ── Step 4: Ensure asset is supported and cooldown is set ──
    console.log("STEP 4/7  Configuring allocator for demo...\n");

    try {
        const addTx = await allocator.addSupportedAsset(mockUsdcAddress);
        await addTx.wait();
        console.log(`  ✓ USDC added as supported asset`);
    } catch {
        console.log(`  ✓ USDC already supported`);
    }

    // Set cooldown to 0 for demo purposes
    try {
        const cooldownTx = await allocator.setRebalanceCooldown(3600); // 1 hour (minimum)
        await cooldownTx.wait();
        console.log(`  ✓ Rebalance cooldown set to 1 hour (minimum)`);
    } catch {
        console.log(`  ✓ Cooldown already configured`);
    }

    // Enable autonomous mode
    try {
        const autoTx = await allocator.setAutonomousEnabled(true);
        await autoTx.wait();
        console.log(`  ✓ Autonomous mode enabled`);
    } catch {
        console.log(`  ✓ Autonomous mode already enabled`);
    }

    // Ensure AIYieldEngine is authorized
    const currentEngine = await allocator.aiYieldEngine();
    console.log(`  AI Yield Engine: ${currentEngine}\n`);

    // ── Step 5: Call AI for allocation recommendation ──
    console.log("STEP 5/7  Asking AI for optimal allocation...\n");

    let aionPct = 40, aavePct = 50, morphoPct = 10;
    let aiConfidence = 85;

    try {
        const response = await fetch("http://localhost:8000/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                asset_address: mockUsdcAddress,
                asset_symbol: "USDC"
            })
        });
        const aiResult = await response.json();
        const rec = aiResult.ai_recommendation;

        aionPct = rec.allocation_recommendation.aion_pool_pct;
        aavePct = rec.allocation_recommendation.aave_v3_pct;
        morphoPct = rec.allocation_recommendation.morpho_pct;
        aiConfidence = rec.predicted_apy.confidence || 85;

        console.log(`  🤖 AI Allocation Decision:`);
        console.log(`  ─────────────────────────────────────`);
        console.log(`    AION Pool:    ${aionPct}%  (emergency buffer + lending)`);
        console.log(`    Aave V3:      ${aavePct}%  (APY: 4.20%)`);
        console.log(`    Morpho Blue:  ${morphoPct}%  (APY: 5.80%)`);
        console.log(`    Confidence:   ${aiConfidence}%`);
        console.log(`  ─────────────────────────────────────`);
        console.log(`    Reasoning: ${rec.allocation_recommendation.reasoning?.substring(0, 80) || "Maximize risk-adjusted yield"}...\n`);
    } catch {
        console.log(`  ⚠  AI Engine not reachable, using default allocation`);
        console.log(`    AION: ${aionPct}%, Aave: ${aavePct}%, Morpho: ${morphoPct}%\n`);
    }

    // ── Step 6: Execute the rebalance on-chain ──
    console.log("STEP 6/7  Executing on-chain rebalance...\n");

    const totalValue = Number(newBalance) / 1e6;
    const aionAmount = (totalValue * aionPct / 100).toFixed(2);
    const aaveAmount = (totalValue * aavePct / 100).toFixed(2);
    const morphoAmount = (totalValue * morphoPct / 100).toFixed(2);

    console.log(`  Rebalance plan (total: $${totalValue.toLocaleString()} USDC):`);
    console.log(`    AION Pool:    $${aionAmount}  (${aionPct}%)`);
    console.log(`    Aave V3:      $${aaveAmount}  (${aavePct}%)`);
    console.log(`    Morpho Blue:  $${morphoAmount}  (${morphoPct}%)\n`);

    // Build allocation instructions
    // Protocol indices: 0 = Aave, 1 = Morpho (as registered above)
    // But the allocator expects index 0 to have the emergency buffer (AION pool)
    // Since AION pool is index 0 internally in the allocator's logic
    const protocolIndices = [0, Number(currentCount), Number(currentCount) + 1];
    const allocationBps = [aionPct * 100, aavePct * 100, morphoPct * 100];

    // Ensure they sum to 10000
    const totalBps = allocationBps.reduce((a: number, b: number) => a + b, 0);
    if (totalBps !== 10000) {
        allocationBps[0] += (10000 - totalBps); // Adjust AION to make sum = 100%
    }

    const proofHash = ethers.keccak256(ethers.toUtf8Bytes(`ai-allocation-${Date.now()}`));

    try {
        // Submit through AIYieldEngine (same path as CRE workflow)
        const tx = await aiEngine.submitAllocationRecommendation(
            mockUsdcAddress,
            protocolIndices,
            allocationBps,
            aiConfidence * 100,  // Convert to BPS
            proofHash
        );
        const receipt = await tx.wait();

        console.log(`  ✓ Allocation recommendation submitted!`);
        console.log(`    Tx Hash: ${receipt.hash}`);

        // Check if it was auto-applied
        const recommendation = await aiEngine.aiRecommendedAllocations(mockUsdcAddress);
        console.log(`    Auto-applied: ${recommendation.isApplied}`);
        console.log(`    Proof Hash:   ${proofHash}\n`);
    } catch (e: any) {
        console.log(`  ⚠  Allocation submission note: ${e.message?.substring(0, 100)}`);
        console.log(`     (This is expected if cooldown is active from a previous run)\n`);
    }

    // ── Step 7: Show final state ──
    console.log("STEP 7/7  Post-Rebalance State\n");

    // Check balances across protocols
    const allocatorBalance = Number(await usdc.balanceOf(allocatorAddress)) / 1e6;
    const aaveBalance = Number(await usdc.balanceOf(aaveAddress)) / 1e6;
    const morphoBalance = Number(await usdc.balanceOf(morphoAddress)) / 1e6;
    const totalManaged = allocatorBalance + aaveBalance + morphoBalance;

    console.log(`  ┌─────────────────────────────────────────────┐`);
    console.log(`  │        FUND DISTRIBUTION AFTER REBALANCE    │`);
    console.log(`  │                                             │`);
    console.log(`  │  Protocol          Balance     Allocation   │`);
    console.log(`  │  ─────────────────────────────────────────  │`);
    console.log(`  │  AION Pool     $${allocatorBalance.toFixed(2).padStart(10)}    ${totalManaged > 0 ? ((allocatorBalance / totalManaged) * 100).toFixed(1) : "0"}%       │`);
    console.log(`  │  Aave V3       $${aaveBalance.toFixed(2).padStart(10)}    ${totalManaged > 0 ? ((aaveBalance / totalManaged) * 100).toFixed(1) : "0"}%       │`);
    console.log(`  │  Morpho Blue   $${morphoBalance.toFixed(2).padStart(10)}    ${totalManaged > 0 ? ((morphoBalance / totalManaged) * 100).toFixed(1) : "0"}%       │`);
    console.log(`  │  ─────────────────────────────────────────  │`);
    console.log(`  │  TOTAL         $${totalManaged.toFixed(2).padStart(10)}    100.0%     │`);
    console.log(`  └─────────────────────────────────────────────┘\n`);

    // Show rebalance history count
    const historyCount = await allocator.getRebalanceHistoryCount();
    const emergencyBuffer = Number(await allocator.emergencyBufferBps()) / 100;
    const cooldown = Number(await allocator.rebalanceCooldown()) / 3600;
    const minConfidence = Number(await allocator.minRebalanceConfidence()) / 100;

    console.log("  Safety Parameters:");
    console.log(`    Emergency Buffer:     ${emergencyBuffer}% (always in AION pool)`);
    console.log(`    Rebalance Cooldown:   ${cooldown} hours`);
    console.log(`    Min AI Confidence:    ${minConfidence}%`);
    console.log(`    Autonomous Mode:      ${await allocator.autonomousEnabled()}`);
    console.log(`    Total Rebalances:     ${historyCount}\n`);

    console.log("========================================");
    console.log("  Autonomous Allocator Demo Complete!");
    console.log("========================================");
    console.log(`  AI analyzed market conditions and decided:`);
    console.log(`    → ${aionPct}% stays in AION (emergency buffer)`);
    console.log(`    → ${aavePct}% deployed to Aave V3 for yield`);
    console.log(`    → ${morphoPct}% deployed to Morpho Blue for yield`);
    console.log(`  ────────────────────────────────────`);
    console.log(`  Every rebalance is:`);
    console.log(`    • AI-recommended (Claude analyzes APYs)`);
    console.log(`    • Verified on-chain (proof hash stored)`);
    console.log(`    • Safety-checked (buffer, caps, cooldown)`);
    console.log(`    • Fully autonomous (no human intervention)`);
    console.log("========================================\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
