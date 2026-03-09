/**
 * Demo Script: Avalanche Teleporter Cross-Chain Deposits
 *
 * Demonstrates the CrossChainVault's ability to accept deposits from
 * other chains using Avalanche Warp Messaging (Teleporter) and
 * automatically credit users in the AION LendingPool.
 *
 * Usage:
 *   npx hardhat run scripts/demo_crosschain.ts --network avalancheFuji
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
    console.log("  AION Yield - Cross-Chain Demo");
    console.log("  (Avalanche Teleporter / Warp Messaging)");
    console.log("========================================\n");

    // ── Step 1: Show CrossChainVault configuration ──
    console.log("STEP 1/4  CrossChainVault Configuration\n");

    const vaultAddress = contracts.CrossChainVault;
    const lpAddress = await vault.lendingPool();
    const teleporterAddr = await vault.teleporterMessenger();

    console.log(`  Vault Address:     ${vaultAddress}`);
    console.log(`  LendingPool:       ${lpAddress}`);
    console.log(`  Teleporter:        ${teleporterAddr}\n`);

    // ── Step 2: Show cross-chain deposit flow ──
    console.log("STEP 2/4  Cross-Chain Deposit Architecture\n");
    console.log("  ┌──────────────────────────────────────────────────────┐");
    console.log("  │          CROSS-CHAIN DEPOSIT FLOW (Teleporter)      │");
    console.log("  │                                                      │");
    console.log("  │  Chain A (e.g. Avalanche C-Chain)                    │");
    console.log("  │  ┌─────────┐     ┌──────────────────┐               │");
    console.log("  │  │  User   │ ──→ │ CrossChainVault  │               │");
    console.log("  │  │ deposits│     │ (source chain)   │               │");
    console.log("  │  │  USDC   │     │ depositCrossChain│               │");
    console.log("  │  └─────────┘     └────────┬─────────┘               │");
    console.log("  │                           │ Teleporter Message       │");
    console.log("  │                           │ (Avalanche Warp Msg)     │");
    console.log("  │                           ▼                          │");
    console.log("  │  Chain B (e.g. Avalanche Subnet)                     │");
    console.log("  │  ┌──────────────────┐     ┌──────────────────┐      │");
    console.log("  │  │ CrossChainVault  │ ──→ │ AION LendingPool │      │");
    console.log("  │  │ (dest chain)     │     │ deposit(user)    │      │");
    console.log("  │  │ receiveTeleporter│     │ → mint aTokens   │      │");
    console.log("  │  └──────────────────┘     └──────────────────┘      │");
    console.log("  └──────────────────────────────────────────────────────┘\n");

    console.log("  How it works:");
    console.log("  1. User calls depositCrossChain() on Chain A vault");
    console.log("  2. Tokens locked in vault, Teleporter message sent");
    console.log("  3. Avalanche Warp Messaging relays via BLS signatures");
    console.log("  4. Teleporter delivers message to dest vault");
    console.log("  5. receiveTeleporterMessage() auto-deposits into LendingPool");
    console.log("  6. User receives aTokens on Chain B — fully automatic\n");

    // ── Step 3: Show current pool state ──
    console.log("STEP 3/4  Current LendingPool State\n");

    const mockUsdcAddress = contracts.MockUSDC;
    const reserveData = await lendingPool.getReserveData(mockUsdcAddress);
    const totalSupply = Number(reserveData.totalSupply) / 1e6;
    const totalBorrow = Number(reserveData.totalBorrow) / 1e6;

    console.log(`  Pool TVL:        $${totalSupply.toLocaleString()} USDC`);
    console.log(`  Total Borrowed:  $${totalBorrow.toLocaleString()} USDC`);
    console.log(`  Active Deposits: Ready to receive cross-chain deposits\n`);

    // ── Step 4: Show function signature ──
    console.log("STEP 4/4  Function Signatures\n");
    console.log("  depositCrossChain(");
    console.log("    bytes32 destinationBlockchainID,  // Avalanche blockchain ID");
    console.log("    address receiver,                 // Dest vault address");
    console.log("    address token,                    // Token to lock");
    console.log("    uint256 amount                    // Amount to deposit");
    console.log("  ) → bytes32 messageId\n");

    console.log("========================================");
    console.log("  Cross-Chain Demo Complete!");
    console.log("========================================");
    console.log(`  Vault:       ${vaultAddress}`);
    console.log(`  Teleporter:  ${teleporterAddr}`);
    console.log(`  ────────────────────────────────────`);
    console.log(`  No LINK fees needed!`);
    console.log(`  Uses Avalanche Warp Messaging (AWM)`);
    console.log(`  Sub-second finality via BLS sigs.`);
    console.log("========================================\n");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
