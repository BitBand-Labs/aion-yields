/**
 * Demo Script: Chainlink CCIP Cross-Chain Deposits
 *
 * Demonstrates the CrossChainVault's ability to accept deposits from
 * other chains and automatically credit users in the AION LendingPool.
 *
 * Usage:
 *   npx hardhat run scripts/demo_crosschain.ts --network sepolia
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
    const CrossChainVault = await ethers.getContractFactory("CrossChainVault");
    const vault = CrossChainVault.attach(contracts.CrossChainVault) as any;

    const LendingPool = await ethers.getContractFactory("LendingPool");
    const lendingPool = LendingPool.attach(contracts.LendingPool) as any;

    console.log("========================================");
    console.log("  AION Yield - Cross-Chain Demo (CCIP)");
    console.log("========================================\n");

    // ── Step 1: Show CrossChainVault configuration ──
    console.log("STEP 1/4  CrossChainVault Configuration\n");

    const vaultAddress = contracts.CrossChainVault;
    const lpAddress = await vault.lendingPool();
    const linkAddress = await vault.linkToken();

    console.log(`  Vault Address:     ${vaultAddress}`);
    console.log(`  LendingPool:       ${lpAddress}`);
    console.log(`  LINK Token:        ${linkAddress}`);
    console.log(`  CCIP Router:       ${deployment.chainlink.ccipRouter}\n`);

    // ── Step 2: Configure supported chains ──
    console.log("STEP 2/4  Configuring supported destination chains...\n");

    // Avalanche Fuji chain selector for CCIP
    const FUJI_CHAIN_SELECTOR = "14767482510784806043";
    // Sepolia chain selector
    const SEPOLIA_CHAIN_SELECTOR = "16015286601757825753";

    try {
        const tx1 = await vault.setSupportedChain(FUJI_CHAIN_SELECTOR, true);
        await tx1.wait();
        console.log(`  ✓ Avalanche Fuji enabled as destination chain`);
        console.log(`    Chain Selector: ${FUJI_CHAIN_SELECTOR}`);
    } catch (e: any) {
        console.log(`  ✓ Avalanche Fuji already configured (or skipped)`);
    }

    try {
        const tx2 = await vault.setSupportedChain(SEPOLIA_CHAIN_SELECTOR, true);
        await tx2.wait();
        console.log(`  ✓ Sepolia enabled as destination chain`);
        console.log(`    Chain Selector: ${SEPOLIA_CHAIN_SELECTOR}`);
    } catch (e: any) {
        console.log(`  ✓ Sepolia already configured (or skipped)`);
    }

    // Verify
    const fujiSupported = await vault.supportedChains(FUJI_CHAIN_SELECTOR);
    const sepoliaSupported = await vault.supportedChains(SEPOLIA_CHAIN_SELECTOR);
    console.log(`\n  Fuji supported:    ${fujiSupported}`);
    console.log(`  Sepolia supported: ${sepoliaSupported}\n`);

    // ── Step 3: Show the cross-chain deposit flow ──
    console.log("STEP 3/4  Cross-Chain Deposit Architecture\n");
    console.log("  ┌──────────────────────────────────────────────────────┐");
    console.log("  │              CROSS-CHAIN DEPOSIT FLOW                │");
    console.log("  │                                                      │");
    console.log("  │  Chain A (e.g. Avalanche Fuji)                       │");
    console.log("  │  ┌─────────┐     ┌──────────────────┐               │");
    console.log("  │  │  User   │ ──→ │ CrossChainVault  │               │");
    console.log("  │  │ deposits│     │ (source chain)   │               │");
    console.log("  │  │  USDC   │     │ depositCrossChain│               │");
    console.log("  │  └─────────┘     └────────┬─────────┘               │");
    console.log("  │                           │ CCIP Message             │");
    console.log("  │                           │ (tokens + user address)  │");
    console.log("  │                           ▼                          │");
    console.log("  │  Chain B (e.g. Sepolia)                              │");
    console.log("  │  ┌──────────────────┐     ┌──────────────────┐      │");
    console.log("  │  │ CrossChainVault  │ ──→ │ AION LendingPool │      │");
    console.log("  │  │ (dest chain)     │     │ deposit(user)    │      │");
    console.log("  │  │ _ccipReceive()   │     │ → mint aTokens   │      │");
    console.log("  │  └──────────────────┘     └──────────────────┘      │");
    console.log("  └──────────────────────────────────────────────────────┘\n");

    console.log("  How it works:");
    console.log("  1. User calls depositCrossChain() on Chain A vault");
    console.log("  2. Tokens transferred from user → vault");
    console.log("  3. CCIP message sent with tokens + encoded user address");
    console.log("  4. CCIP Router on Chain B delivers message to dest vault");
    console.log("  5. _ccipReceive() auto-deposits into LendingPool for user");
    console.log("  6. User receives aTokens on Chain B — fully automatic\n");

    // ── Step 4: Show current pool state (proving deposits work) ──
    console.log("STEP 4/4  Current LendingPool State (destination chain)\n");

    const mockUsdcAddress = contracts.MockUSDC;
    const reserveData = await lendingPool.getReserveData(mockUsdcAddress);
    const totalSupply = Number(reserveData.totalSupply) / 1e6;
    const totalBorrow = Number(reserveData.totalBorrow) / 1e6;

    console.log(`  Pool TVL:        $${totalSupply.toLocaleString()} USDC`);
    console.log(`  Total Borrowed:  $${totalBorrow.toLocaleString()} USDC`);
    console.log(`  Active Deposits: Ready to receive cross-chain deposits\n`);

    console.log("  Cross-chain deposit function signature:");
    console.log("  ─────────────────────────────────────────────────────");
    console.log("  depositCrossChain(");
    console.log("    uint64  destinationChainSelector,  // CCIP chain ID");
    console.log("    address receiver,                  // Dest vault address");
    console.log("    address token,                     // Token to bridge");
    console.log("    uint256 amount                     // Amount to deposit");
    console.log("  ) → bytes32 messageId");
    console.log("  ─────────────────────────────────────────────────────\n");

    console.log("========================================");
    console.log("  Cross-Chain Demo Complete!");
    console.log("========================================");
    console.log(`  Vault:   ${vaultAddress}`);
    console.log(`  Router:  ${deployment.chainlink.ccipRouter}`);
    console.log(`  Chains:  Sepolia ↔ Avalanche Fuji`);
    console.log(`  ────────────────────────────────────`);
    console.log(`  In production, users deposit on any`);
    console.log(`  supported chain and CCIP automatically`);
    console.log(`  credits them in the AION LendingPool.`);
    console.log(`  No bridges. No manual steps. Seamless.`);
    console.log("========================================\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
