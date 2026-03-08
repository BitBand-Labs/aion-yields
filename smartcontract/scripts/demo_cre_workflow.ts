/**
 * Demo Script: Chainlink CRE Workflow - End-to-End
 *
 * This script demonstrates the full CRE (Compute Runtime Environment) flow:
 * 1. Register a YIELD_ALLOCATION workflow
 * 2. Execute Pre-Hook (gather on-chain data)
 * 3. Call Python AI engine for recommendation
 * 4. Execute Post-Hook (apply AI result on-chain)
 *
 * Usage:
 *   npx hardhat run scripts/demo_cre_workflow.ts --network sepolia
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
    const CREHook = await ethers.getContractFactory("CREExecutionHook");
    const creHook = CREHook.attach(contracts.CREExecutionHook) as any;

    const AIYieldEngine = await ethers.getContractFactory("AIYieldEngine");
    const aiEngine = AIYieldEngine.attach(contracts.AIYieldEngine) as any;

    const LendingPool = await ethers.getContractFactory("LendingPool");
    const lendingPool = LendingPool.attach(contracts.LendingPool) as any;

    console.log("========================================");
    console.log("  AION Yield - CRE Workflow Demo");
    console.log("========================================\n");

    // ── Step 1: Register Workflows ──
    console.log("STEP 1/5  Registering CRE workflows...\n");

    // WorkflowType enum: 0=AI_RATE_ADJUSTMENT, 1=LIQUIDATION_SCAN,
    // 2=CROSS_CHAIN_REBALANCE, 3=RISK_MONITORING, 4=YIELD_ALLOCATION

    const tx1 = await creHook.registerWorkflow(
        4,  // YIELD_ALLOCATION
        0,  // 0 min interval for demo (normally 3600+)
        "AI-powered cross-protocol yield allocation (Aave, Morpho, AION)"
    );
    const receipt1 = await tx1.wait();
    const event1 = receipt1.logs.find((l: any) => l.fragment?.name === "WorkflowRegistered");
    const yieldWorkflowId = event1?.args?.[0] || receipt1.logs[0]?.topics[1];
    console.log(`  ✓ YIELD_ALLOCATION workflow registered`);
    console.log(`    Workflow ID: ${yieldWorkflowId}\n`);

    const tx2 = await creHook.registerWorkflow(
        0,  // AI_RATE_ADJUSTMENT
        0,  // 0 min interval for demo
        "AI-driven interest rate curve optimization"
    );
    const receipt2 = await tx2.wait();
    const event2 = receipt2.logs.find((l: any) => l.fragment?.name === "WorkflowRegistered");
    const rateWorkflowId = event2?.args?.[0] || receipt2.logs[0]?.topics[1];
    console.log(`  ✓ AI_RATE_ADJUSTMENT workflow registered`);
    console.log(`    Workflow ID: ${rateWorkflowId}\n`);

    // ── Step 2: Show current pool state ──
    console.log("STEP 2/5  Current pool state (before AI optimization)...\n");

    const mockUsdcAddress = contracts.MockUSDC;
    const reserveData = await lendingPool.getReserveData(mockUsdcAddress);
    const totalSupply = Number(reserveData.totalSupply) / 1e6;
    const totalBorrow = Number(reserveData.totalBorrow) / 1e6;
    const utilization = totalSupply > 0 ? (totalBorrow / totalSupply * 100).toFixed(1) : "0";
    const supplyRate = Number(reserveData.currentLiquidityRate) / 1e27 * 100;
    const borrowRate = Number(reserveData.currentVariableBorrowRate) / 1e27 * 100;

    console.log(`  Pool TVL:       $${totalSupply.toLocaleString()} USDC`);
    console.log(`  Total Borrowed: $${totalBorrow.toLocaleString()} USDC`);
    console.log(`  Utilization:    ${utilization}%`);
    console.log(`  Supply APY:     ${supplyRate.toFixed(4)}%`);
    console.log(`  Borrow APY:     ${borrowRate.toFixed(4)}%\n`);

    // ── Step 3: Execute Pre-Hook (gather on-chain data) ──
    console.log("STEP 3/5  Executing CRE Pre-Hook (gathering on-chain data)...\n");

    const preHookTx = await creHook.executePreHook(yieldWorkflowId);
    const preHookReceipt = await preHookTx.wait();

    // Get executionId from event
    const preHookEvent = preHookReceipt.logs.find((l: any) => l.fragment?.name === "PreHookExecuted");
    const executionId = preHookEvent?.args?.[0] || preHookReceipt.logs[0]?.topics[1];
    console.log(`  ✓ Pre-Hook executed!`);
    console.log(`    Execution ID: ${executionId}`);
    console.log(`    Data gathered: pool state, rates, utilization, timestamps`);
    console.log(`    → This data is sent to off-chain AI model via Chainlink Functions\n`);

    // ── Step 4: Simulate AI analysis (in production: Chainlink Functions) ──
    console.log("STEP 4/5  AI Engine analyzing data (simulating Chainlink Functions callback)...\n");

    // In production, Chainlink Functions would call our Python AI engine.
    // For demo, we call it directly and show the result.
    console.log(`  📡 Calling AI Engine at http://localhost:8000/analyze ...`);

    let aiResult;
    try {
        const response = await fetch("http://localhost:8000/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                asset_address: mockUsdcAddress,
                asset_symbol: "USDC"
            })
        });
        aiResult = await response.json();

        const rec = aiResult.ai_recommendation;
        console.log(`\n  🤖 AI Recommendation:`);
        console.log(`  ─────────────────────────────────────`);
        console.log(`  Market Assessment: ${rec.analysis.market_assessment.substring(0, 80)}...`);
        console.log(`  Risk Level:        ${rec.analysis.risk_level}`);
        console.log(`  ─────────────────────────────────────`);
        console.log(`  Rate Optimization:`);
        console.log(`    Base Rate:          ${rec.rate_recommendation.baseRate}%`);
        console.log(`    Slope 1:            ${rec.rate_recommendation.rateSlope1}%`);
        console.log(`    Slope 2:            ${rec.rate_recommendation.rateSlope2}%`);
        console.log(`    Optimal Utilization:${rec.rate_recommendation.optimalUtilization}%`);
        console.log(`  ─────────────────────────────────────`);
        console.log(`  Yield Allocation:`);
        console.log(`    AION Pool:  ${rec.allocation_recommendation.aion_pool_pct}%`);
        console.log(`    Aave V3:    ${rec.allocation_recommendation.aave_v3_pct}%`);
        console.log(`    Morpho:     ${rec.allocation_recommendation.morpho_pct}%`);
        console.log(`  ─────────────────────────────────────`);
        console.log(`  Predicted Supply APY: ${rec.predicted_apy.supply_apy}%`);
        console.log(`  Predicted Borrow APY: ${rec.predicted_apy.borrow_apy}%\n`);
    } catch (e) {
        console.log(`  ⚠  AI Engine not reachable (is it running on port 8000?)`);
        console.log(`     Using fallback recommendation for demo...\n`);
        aiResult = null;
    }

    // ── Step 5: Execute Post-Hook (apply AI results on-chain) ──
    console.log("STEP 5/5  Executing CRE Post-Hook (applying AI results on-chain)...\n");

    // Encode the allocation result as the post-hook data
    // Format: (asset, protocolIndices[], allocationBps[], confidence, proofHash)
    const aionPct = aiResult?.ai_recommendation?.allocation_recommendation?.aion_pool_pct || 40;
    const aavePct = aiResult?.ai_recommendation?.allocation_recommendation?.aave_v3_pct || 50;
    const morphoPct = aiResult?.ai_recommendation?.allocation_recommendation?.morpho_pct || 10;

    const postHookData = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256[]", "uint256[]", "uint256", "bytes32"],
        [
            mockUsdcAddress,
            [0, 1, 2],  // Protocol indices: 0=AION, 1=Aave, 2=Morpho
            [aionPct * 100, aavePct * 100, morphoPct * 100],  // BPS
            8500,  // 85% confidence
            ethers.keccak256(ethers.toUtf8Bytes("ai-recommendation-proof"))
        ]
    );

    const postHookTx = await creHook.executePostHook(executionId, postHookData);
    await postHookTx.wait();

    // Check execution status
    const execution = await creHook.getExecution(executionId);
    const statusMap = ["NONE", "PRE_HOOK_EXECUTED", "PROCESSING", "POST_HOOK_EXECUTED", "COMPLETED", "FAILED"];
    const statusStr = statusMap[Number(execution.status)] || "UNKNOWN";

    console.log(`  ✓ Post-Hook executed!`);
    console.log(`    Execution Status: ${statusStr}`);
    console.log(`    Duration: ${Number(execution.endTime) - Number(execution.startTime)}s\n`);

    // ── Summary ──
    const totalExec = await creHook.totalExecutions();
    const workflowCount = await creHook.getWorkflowCount();

    console.log("========================================");
    console.log("  CRE Workflow Demo Complete!");
    console.log("========================================");
    console.log(`  Workflows Registered:  ${workflowCount}`);
    console.log(`  Total Executions:      ${totalExec}`);
    console.log(`  Last Status:           ${statusStr}`);
    console.log(`  ────────────────────────────────────`);
    console.log(`  Flow: Trigger → Pre-Hook → AI Analysis → Post-Hook → Applied`);
    console.log(`  ────────────────────────────────────`);
    console.log(`  In production, this entire flow is automated by:`);
    console.log(`    • Chainlink Automation (trigger)`);
    console.log(`    • Chainlink Functions (off-chain AI)`);
    console.log(`    • CRE orchestrating the full pipeline`);
    console.log("========================================\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
