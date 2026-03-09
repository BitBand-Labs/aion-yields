/**
 * Mint MockUSDC to the Fuji CrossChainVault so it can fulfill CCIP deposits.
 *
 *   npx hardhat run scripts/fund_fuji_vault.ts --network avalancheFuji
 */
import { network } from "hardhat";
import * as fs from "fs";

async function main() {
    const connection = await network.connect();
    const { ethers } = connection as any;

    const [deployer] = await ethers.getSigners();
    const fuji = JSON.parse(fs.readFileSync("./deployments/avalancheFuji.json", "utf8"));

    const usdc = new ethers.Contract(fuji.contracts.MockUSDC, [
        "function mint(address,uint256)",
        "function balanceOf(address) view returns (uint256)",
    ], deployer);

    const vault = fuji.contracts.CrossChainVault;
    console.log(`\nVault: ${vault}`);

    const balBefore = await usdc.balanceOf(vault);
    console.log(`Current USDC balance: ${ethers.formatUnits(balBefore, 6)}`);

    const amount = ethers.parseUnits("100000", 6); // 100k USDC
    console.log("Minting 100,000 USDC to vault...");
    const tx = await usdc.mint(vault, amount);
    await tx.wait();
    console.log(`TX: ${tx.hash}`);

    const balAfter = await usdc.balanceOf(vault);
    console.log(`New USDC balance: ${ethers.formatUnits(balAfter, 6)}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
