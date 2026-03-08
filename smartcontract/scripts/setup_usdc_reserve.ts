/**
 * Setup USDC Reserve - Complete bootstrapping script
 *
 * This script:
 * 1. Deploys AToken and VariableDebtToken for USDC
 * 2. Sets up a mock price feed for USDC ($1.00)
 * 3. Initializes the USDC reserve in the LendingPool
 * 4. Mints 100,000 test USDC to the deployer
 *
 * Usage:
 *   npx hardhat run scripts/setup_usdc_reserve.ts --network sepolia
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

    // Load deployment addresses
    const deploymentPath = `./deployments/${networkName}.json`;
    if (!fs.existsSync(deploymentPath)) {
        throw new Error(`No deployment file found at ${deploymentPath}. Deploy core contracts first.`);
    }
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    const contracts = deployment.contracts;

    const lendingPoolAddress = contracts.LendingPool;
    const mockUsdcAddress = contracts.MockUSDC;
    const priceOracleAddress = contracts.ChainlinkPriceOracle;

    console.log(`  LendingPool:  ${lendingPoolAddress}`);
    console.log(`  MockUSDC:     ${mockUsdcAddress}`);
    console.log(`  PriceOracle:  ${priceOracleAddress}\n`);

    // ── Step 1: Deploy Mock Price Feed for USDC ($1.00 = 1e8) ──
    console.log("1/5  Deploying MockChainlinkAggregator for USDC ($1.00)...");
    const MockAggregator = await ethers.getContractFactory("MockChainlinkAggregator");
    const usdcPriceFeed = await MockAggregator.deploy(
        100000000,      // $1.00 in 8-decimal format (int256 initialAnswer)
        8               // decimals (uint8)
    );
    await usdcPriceFeed.waitForDeployment();
    const priceFeedAddress = await usdcPriceFeed.getAddress();
    console.log(`     -> USDC Price Feed: ${priceFeedAddress}`);

    // ── Step 2: Register price feed in ChainlinkPriceOracle ──
    console.log("2/5  Registering USDC price feed in oracle...");
    const PriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle");
    const oracle = PriceOracle.attach(priceOracleAddress) as any;
    const setPriceTx = await oracle.setPriceFeed(
        mockUsdcAddress,
        priceFeedAddress,       // primary feed
        ethers.ZeroAddress,     // no fallback
        3600,                   // 1 hour max staleness
        8                       // feed decimals
    );
    await setPriceTx.wait();
    console.log("     -> Price feed registered");

    // ── Step 3: Deploy AToken for USDC ──
    console.log("3/5  Deploying AToken (aUSDC)...");
    const AToken = await ethers.getContractFactory("AToken");
    const aToken = await AToken.deploy(
        "AION USDC",
        "aUSDC",
        mockUsdcAddress,
        lendingPoolAddress,
        deployer.address
    );
    await aToken.waitForDeployment();
    const aTokenAddress = await aToken.getAddress();
    console.log(`     -> aUSDC: ${aTokenAddress}`);

    // ── Step 4: Deploy VariableDebtToken for USDC ──
    console.log("4/5  Deploying VariableDebtToken (debtUSDC)...");
    const VariableDebtToken = await ethers.getContractFactory("VariableDebtToken");
    const debtToken = await VariableDebtToken.deploy(
        "AION Variable Debt USDC",
        "debtUSDC",
        mockUsdcAddress,
        lendingPoolAddress,
        deployer.address
    );
    await debtToken.waitForDeployment();
    const debtTokenAddress = await debtToken.getAddress();
    console.log(`     -> debtUSDC: ${debtTokenAddress}`);

    // ── Step 5: Initialize Reserve in LendingPool ──
    console.log("5/5  Initializing USDC reserve in LendingPool...");
    const LendingPool = await ethers.getContractFactory("LendingPool");
    const lendingPool = LendingPool.attach(lendingPoolAddress) as any;

    const initTx = await lendingPool.initReserve(
        mockUsdcAddress,        // asset
        aTokenAddress,          // aToken
        debtTokenAddress,       // debtToken
        priceFeedAddress,       // price feed
        2000,                   // reserveFactor: 20%
        7500,                   // ltv: 75%
        8500,                   // liquidationThreshold: 85%
        10500,                  // liquidationBonus: 105% (5% bonus)
        6                       // decimals (USDC = 6)
    );
    await initTx.wait();
    console.log("     -> USDC reserve initialized!");

    // ── Step 6: Mint USDC to deployer, extra wallet ──
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const usdc = MockERC20.attach(mockUsdcAddress) as any;

    const extraWallet = "0x564c1B82eDf628af1a464A28270a066D8Cb81838";

    // Mint 500,000 to deployer (for seeding pool + personal use)
    console.log("\n6/8  Minting USDC...");
    const deployerMint = ethers.parseUnits("500000", 6);
    await (await usdc.mint(deployer.address, deployerMint)).wait();
    console.log(`     -> 500,000 USDC to deployer ${deployer.address}`);

    // Mint 100,000 to extra wallet
    const extraMint = ethers.parseUnits("100000", 6);
    await (await usdc.mint(extraWallet, extraMint)).wait();
    console.log(`     -> 100,000 USDC to ${extraWallet}`);

    // ── Step 7: Seed the pool - Deposit 250,000 USDC for TVL ──
    console.log("\n7/8  Seeding LendingPool with 250,000 USDC deposit (TVL)...");
    const depositAmount = ethers.parseUnits("250000", 6);

    // Approve LendingPool to spend deployer's USDC
    const approveTx = await usdc.approve(lendingPoolAddress, depositAmount);
    await approveTx.wait();
    console.log("     -> Approved LendingPool to spend USDC");

    // Deposit into pool
    const depositTx = await lendingPool.deposit(mockUsdcAddress, depositAmount, deployer.address);
    await depositTx.wait();
    console.log("     -> Deposited 250,000 USDC into pool (TVL: $250,000)");

    // ── Step 8: Borrow 75,000 USDC to create ~30% utilization ──
    console.log("\n8/8  Borrowing 75,000 USDC to create utilization...");
    const borrowAmount = ethers.parseUnits("75000", 6);
    const borrowTx = await lendingPool.borrow(mockUsdcAddress, borrowAmount, deployer.address);
    await borrowTx.wait();
    console.log("     -> Borrowed 75,000 USDC (Utilization: ~30%)");

    // ── Save updated deployment ──
    contracts.USDCPriceFeed = priceFeedAddress;
    contracts.aUSDC = aTokenAddress;
    contracts.debtUSDC = debtTokenAddress;
    deployment.contracts = contracts;
    fs.writeFileSync(deploymentPath, JSON.stringify(deployment, null, 2));
    console.log(`\n  Deployment file updated: ${deploymentPath}`);

    // ── Summary ──
    console.log(`\n========================================`);
    console.log(`  USDC Reserve Setup Complete!`);
    console.log(`========================================`);
    console.log(`  MockUSDC:       ${mockUsdcAddress}`);
    console.log(`  Price Feed:     ${priceFeedAddress}`);
    console.log(`  aUSDC:          ${aTokenAddress}`);
    console.log(`  debtUSDC:       ${debtTokenAddress}`);
    console.log(`  ────────────────────────────────────`);
    console.log(`  Pool TVL:       $250,000 USDC`);
    console.log(`  Total Borrowed: $75,000 USDC`);
    console.log(`  Utilization:    ~30%`);
    console.log(`  ────────────────────────────────────`);
    console.log(`  Deployer USDC:  ~250,000 (500k minted - 250k deposited + 75k borrowed)`);
    console.log(`  Extra Wallet:   100,000 USDC`);
    console.log(`  (${extraWallet})`);
    console.log(`========================================\n`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
