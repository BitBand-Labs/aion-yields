/**
 * Seed Pool - Enable collateral + borrow to create utilization
 * Run AFTER setup_usdc_reserve.ts has completed steps 1-7
 *
 * Usage:
 *   npx hardhat run scripts/seed_pool.ts --network sepolia
 *   npx hardhat run scripts/seed_pool.ts --network avalancheFuji
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

    const lendingPoolAddress = contracts.LendingPool;
    const mockUsdcAddress = contracts.MockUSDC;

    const LendingPool = await ethers.getContractFactory("LendingPool");
    const lendingPool = LendingPool.attach(lendingPoolAddress) as any;

    // Step 1: Enable USDC as collateral
    console.log("1/2  Enabling USDC deposit as collateral...");
    const colTx = await lendingPool.setUserUseReserveAsCollateral(mockUsdcAddress, true);
    await colTx.wait();
    console.log("     -> Collateral enabled");

    // Step 2: Borrow 50,000 USDC (~20% utilization, safe within 75% LTV)
    // With 250k collateral at 75% LTV = 187.5k max borrow
    // 50k borrow = well within limits
    console.log("2/2  Borrowing 50,000 USDC to create utilization...");
    const borrowAmount = ethers.parseUnits("50000", 6);
    const borrowTx = await lendingPool.borrow(mockUsdcAddress, borrowAmount, deployer.address);
    await borrowTx.wait();
    console.log("     -> Borrowed 50,000 USDC");

    // Check final state
    const reserveData = await lendingPool.getReserveData(mockUsdcAddress);
    const totalSupply = Number(reserveData.totalSupply) / 1e6;
    const totalBorrow = Number(reserveData.totalBorrow) / 1e6;
    const utilization = totalSupply > 0 ? (totalBorrow / totalSupply * 100).toFixed(1) : "0";

    const hf = await lendingPool.getHealthFactor(deployer.address);
    const healthFactor = Number(hf) / 1e18;

    console.log(`\n========================================`);
    console.log(`  Pool Seeded on ${networkName}!`);
    console.log(`========================================`);
    console.log(`  Total Supply:   ${totalSupply.toLocaleString()} USDC ($${totalSupply.toLocaleString()})`);
    console.log(`  Total Borrowed: ${totalBorrow.toLocaleString()} USDC ($${totalBorrow.toLocaleString()})`);
    console.log(`  Utilization:    ${utilization}%`);
    console.log(`  Health Factor:  ${healthFactor.toFixed(2)}`);
    console.log(`========================================\n`);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
