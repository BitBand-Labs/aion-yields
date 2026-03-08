/**
 * Demo Script: x402 Machine-to-Machine AI Payments
 *
 * Demonstrates the HTTP 402 payment protocol for autonomous AI agent payments:
 * 1. Register AI providers with pricing
 * 2. Deposit USDC into escrow
 * 3. Process inference payments (yield prediction, risk assessment)
 * 4. Show batch payments
 * 5. Show revenue distribution to AI agents
 *
 * Usage:
 *   npx hardhat run scripts/demo_x402.ts --network sepolia
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
    const X402 = await ethers.getContractFactory("X402PaymentGateway");
    const gateway = X402.attach(contracts.X402PaymentGateway) as any;

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    const usdc = MockUSDC.attach(contracts.MockUSDC) as any;

    const AIRevenueDistributor = await ethers.getContractFactory("AIRevenueDistributor");
    const distributor = AIRevenueDistributor.attach(contracts.AIRevenueDistributor) as any;

    console.log("========================================");
    console.log("  AION Yield - x402 Payment Demo");
    console.log("  (Machine-to-Machine AI Payments)");
    console.log("========================================\n");

    // ── Step 1: Show the x402 architecture ──
    console.log("STEP 1/6  x402 Payment Architecture\n");
    console.log("  ┌──────────────────────────────────────────────────────┐");
    console.log("  │                  x402 PAYMENT FLOW                   │");
    console.log("  │                                                      │");
    console.log("  │  ┌───────────┐   HTTP Request   ┌───────────────┐   │");
    console.log("  │  │  AION     │ ───────────────→  │  AI Agent     │   │");
    console.log("  │  │  Protocol │                   │  (Provider)   │   │");
    console.log("  │  └─────┬─────┘   HTTP 402        └───────┬───────┘   │");
    console.log("  │        │    ←── Payment Required ──       │          │");
    console.log("  │        │                                  │          │");
    console.log("  │        ▼                                  ▼          │");
    console.log("  │  ┌──────────────────────────────────────────────┐    │");
    console.log("  │  │          X402PaymentGateway                  │    │");
    console.log("  │  │                                              │    │");
    console.log("  │  │  Escrow → Auto-deduct → Pay Provider        │    │");
    console.log("  │  │           (1% protocol fee)                  │    │");
    console.log("  │  └────────────────────┬─────────────────────────┘    │");
    console.log("  │                       │                              │");
    console.log("  │                       ▼                              │");
    console.log("  │  ┌──────────────────────────────────────────────┐    │");
    console.log("  │  │        AIRevenueDistributor                  │    │");
    console.log("  │  │                                              │    │");
    console.log("  │  │  70% Agent Share │ 15% Top Bonus             │    │");
    console.log("  │  │  10% Community   │  5% Protocol Reserve      │    │");
    console.log("  │  └──────────────────────────────────────────────┘    │");
    console.log("  └──────────────────────────────────────────────────────┘\n");

    // ── Step 2: Register AI Providers ──
    console.log("STEP 2/6  Registering AI service providers...\n");

    // Create mock provider addresses (using deterministic addresses)
    const provider1 = ethers.Wallet.createRandom().address; // Sigma-7 (yield optimizer)
    const provider2 = ethers.Wallet.createRandom().address; // Guardian-3 (risk assessor)
    const provider3 = ethers.Wallet.createRandom().address; // Oracle-9 (market analyzer)

    const priceYield = ethers.parseUnits("0.50", 6);    // $0.50 per yield prediction
    const priceRisk = ethers.parseUnits("0.25", 6);     // $0.25 per risk assessment
    const priceMarket = ethers.parseUnits("1.00", 6);   // $1.00 per market analysis

    const tx1 = await gateway.registerProvider(provider1, priceYield);
    await tx1.wait();
    console.log(`  ✓ Sigma-7 (Yield Optimizer)`);
    console.log(`    Address: ${provider1}`);
    console.log(`    Price:   $0.50 per inference\n`);

    const tx2 = await gateway.registerProvider(provider2, priceRisk);
    await tx2.wait();
    console.log(`  ✓ Guardian-3 (Risk Assessor)`);
    console.log(`    Address: ${provider2}`);
    console.log(`    Price:   $0.25 per inference\n`);

    const tx3 = await gateway.registerProvider(provider3, priceMarket);
    await tx3.wait();
    console.log(`  ✓ Oracle-9 (Market Analyzer)`);
    console.log(`    Address: ${provider3}`);
    console.log(`    Price:   $1.00 per inference\n`);

    // ── Step 3: Deposit USDC into escrow ──
    console.log("STEP 3/6  Depositing USDC into payment escrow...\n");

    const escrowAmount = ethers.parseUnits("100", 6); // $100 USDC

    // Mint USDC
    const mintTx = await usdc.mint(deployer.address, escrowAmount);
    await mintTx.wait();

    // Approve gateway
    const approveTx = await usdc.approve(contracts.X402PaymentGateway, escrowAmount);
    await approveTx.wait();

    // Deposit
    const depositTx = await gateway.deposit(escrowAmount);
    await depositTx.wait();

    const balance = await gateway.getEscrowBalance(deployer.address);
    console.log(`  ✓ Deposited $100.00 USDC into escrow`);
    console.log(`  Escrow Balance: $${(Number(balance) / 1e6).toFixed(2)} USDC\n`);

    // ── Step 4: Process inference payments ──
    console.log("STEP 4/6  Processing AI inference payments...\n");

    // Payment 1: Yield Prediction
    const reqId1 = ethers.keccak256(ethers.toUtf8Bytes(`yield-pred-${Date.now()}`));
    const payTx1 = await gateway.processInferencePayment(
        reqId1,
        deployer.address,
        provider1,
        "yield_prediction"
    );
    const payReceipt1 = await payTx1.wait();
    console.log(`  💰 Payment 1: Yield Prediction`);
    console.log(`     Provider: Sigma-7`);
    console.log(`     Amount:   $0.50 (fee: $0.005)`);
    console.log(`     Tx:       ${payReceipt1.hash}\n`);

    // Payment 2: Risk Assessment
    const reqId2 = ethers.keccak256(ethers.toUtf8Bytes(`risk-assess-${Date.now()}`));
    const payTx2 = await gateway.processInferencePayment(
        reqId2,
        deployer.address,
        provider2,
        "risk_assessment"
    );
    const payReceipt2 = await payTx2.wait();
    console.log(`  💰 Payment 2: Risk Assessment`);
    console.log(`     Provider: Guardian-3`);
    console.log(`     Amount:   $0.25 (fee: $0.0025)`);
    console.log(`     Tx:       ${payReceipt2.hash}\n`);

    // Payment 3: Market Analysis
    const reqId3 = ethers.keccak256(ethers.toUtf8Bytes(`market-analysis-${Date.now()}`));
    const payTx3 = await gateway.processInferencePayment(
        reqId3,
        deployer.address,
        provider3,
        "market_analysis"
    );
    const payReceipt3 = await payTx3.wait();
    console.log(`  💰 Payment 3: Market Analysis`);
    console.log(`     Provider: Oracle-9`);
    console.log(`     Amount:   $1.00 (fee: $0.01)`);
    console.log(`     Tx:       ${payReceipt3.hash}\n`);

    // ── Step 5: Batch payment demo ──
    console.log("STEP 5/6  Batch payment processing (gas efficient)...\n");

    const batchReqIds = [
        ethers.keccak256(ethers.toUtf8Bytes(`batch-1-${Date.now()}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`batch-2-${Date.now()}`)),
        ethers.keccak256(ethers.toUtf8Bytes(`batch-3-${Date.now()}`)),
    ];
    const batchPayers = [deployer.address, deployer.address, deployer.address];
    const batchProviders = [provider1, provider2, provider1];

    const batchTx = await gateway.batchProcessPayments(
        batchReqIds,
        batchPayers,
        batchProviders
    );
    const batchReceipt = await batchTx.wait();
    console.log(`  ✓ Batch: 3 payments processed in 1 transaction`);
    console.log(`    - Sigma-7:    $0.50 (yield prediction)`);
    console.log(`    - Guardian-3: $0.25 (risk assessment)`);
    console.log(`    - Sigma-7:    $0.50 (yield prediction)`);
    console.log(`    Total:        $1.25`);
    console.log(`    Tx:           ${batchReceipt.hash}\n`);

    // ── Step 6: Show payment statistics ──
    console.log("STEP 6/6  Payment Statistics\n");

    const totalPaid = await gateway.totalPayments();
    const totalVolume = await gateway.totalPaymentVolume();
    const remainingEscrow = await gateway.getEscrowBalance(deployer.address);
    const protocolFee = await gateway.protocolFee();

    const provider1Balance = Number(await usdc.balanceOf(provider1)) / 1e6;
    const provider2Balance = Number(await usdc.balanceOf(provider2)) / 1e6;
    const provider3Balance = Number(await usdc.balanceOf(provider3)) / 1e6;

    console.log(`  ┌─────────────────────────────────────────────┐`);
    console.log(`  │           PAYMENT SUMMARY                   │`);
    console.log(`  │                                             │`);
    console.log(`  │  Total Payments:     ${String(totalPaid).padStart(6)}               │`);
    console.log(`  │  Total Volume:       $${(Number(totalVolume) / 1e6).toFixed(2).padStart(8)}           │`);
    console.log(`  │  Protocol Fee:       ${Number(protocolFee) / 100}%                 │`);
    console.log(`  │  Escrow Remaining:   $${(Number(remainingEscrow) / 1e6).toFixed(2).padStart(8)}           │`);
    console.log(`  │                                             │`);
    console.log(`  │  PROVIDER EARNINGS:                         │`);
    console.log(`  │  Sigma-7:       $${provider1Balance.toFixed(2).padStart(8)}  (yield)        │`);
    console.log(`  │  Guardian-3:    $${provider2Balance.toFixed(2).padStart(8)}  (risk)         │`);
    console.log(`  │  Oracle-9:      $${provider3Balance.toFixed(2).padStart(8)}  (market)       │`);
    console.log(`  └─────────────────────────────────────────────┘\n`);

    // Revenue distribution info
    const currentEpoch = await distributor.currentEpoch();
    const agentSharePct = Number(await distributor.agentShare()) / 100;
    const bonusPct = Number(await distributor.topAgentBonus()) / 100;
    const communityPct = Number(await distributor.communityShare()) / 100;
    const reservePct = Number(await distributor.protocolReserve()) / 100;

    console.log("  Revenue Distribution Schedule:");
    console.log(`    Current Epoch:    ${currentEpoch}`);
    console.log(`    Agent Share:      ${agentSharePct}%`);
    console.log(`    Top Agent Bonus:  ${bonusPct}%`);
    console.log(`    Community Pool:   ${communityPct}%`);
    console.log(`    Protocol Reserve: ${reservePct}%\n`);

    console.log("========================================");
    console.log("  x402 Payment Demo Complete!");
    console.log("========================================");
    console.log(`  AI agents earned revenue for:`);
    console.log(`    • Yield predictions      ($0.50/ea)`);
    console.log(`    • Risk assessments        ($0.25/ea)`);
    console.log(`    • Market analysis         ($1.00/ea)`);
    console.log(`  ────────────────────────────────────`);
    console.log(`  x402 enables:`);
    console.log(`    • Autonomous agent payments`);
    console.log(`    • Per-inference micropayments`);
    console.log(`    • Escrow-based auto-settlement`);
    console.log(`    • Batch processing for gas savings`);
    console.log(`    • Revenue distribution to top agents`);
    console.log("========================================\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
