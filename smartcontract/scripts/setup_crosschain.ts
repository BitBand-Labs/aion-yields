/**
 * Configure CrossChainVault on both chains to support cross-chain deposits.
 *
 *   npx hardhat run scripts/setup_crosschain.ts --network sepolia
 *   npx hardhat run scripts/setup_crosschain.ts --network avalancheFuji
 */
import { network } from "hardhat";
import * as fs from "fs";

// CCIP chain selectors (official Chainlink)
const SEPOLIA_SELECTOR = "16015286601757825753";
const FUJI_SELECTOR = "14767482510784806043";

async function main() {
    const connection = await network.connect();
    const { ethers } = connection as any;
    const networkName = (connection as any).networkName as string;

    const [deployer] = await ethers.getSigners();
    console.log(`\nConfiguring CrossChainVault on ${networkName} with deployer: ${deployer.address}\n`);

    const sepoliaDeployment = JSON.parse(fs.readFileSync("./deployments/sepolia.json", "utf8"));
    const fujiDeployment = JSON.parse(fs.readFileSync("./deployments/avalancheFuji.json", "utf8"));

    const VAULT_ABI = [
        "function setSupportedChain(uint64 chainSelector, bool supported) external",
        "function setRemoteVault(uint64 chainSelector, address vault) external",
        "function supportedChains(uint64) view returns (bool)",
        "function remoteVaults(uint64) view returns (address)",
        "function owner() view returns (address)",
    ];

    if (networkName === "sepolia") {
        const vault = new ethers.Contract(sepoliaDeployment.contracts.CrossChainVault, VAULT_ABI, deployer);
        console.log(`CrossChainVault: ${sepoliaDeployment.contracts.CrossChainVault}`);
        console.log(`Owner: ${await vault.owner()}`);

        // Enable Fuji as supported destination
        const supported = await vault.supportedChains(FUJI_SELECTOR);
        console.log(`Fuji already supported: ${supported}`);
        if (!supported) {
            console.log("Setting Fuji as supported chain...");
            const tx = await vault.setSupportedChain(FUJI_SELECTOR, true);
            await tx.wait();
            console.log(`  TX: ${tx.hash}`);
        }

        // Set remote vault
        const remote = await vault.remoteVaults(FUJI_SELECTOR);
        const expected = fujiDeployment.contracts.CrossChainVault;
        console.log(`Remote vault for Fuji: ${remote}`);
        if (remote.toLowerCase() !== expected.toLowerCase()) {
            console.log(`Setting remote vault to ${expected}...`);
            const tx = await vault.setRemoteVault(FUJI_SELECTOR, expected);
            await tx.wait();
            console.log(`  TX: ${tx.hash}`);
        }

        console.log("\nSepolia CrossChainVault configured!");

    } else {
        // avalancheFuji
        const vault = new ethers.Contract(fujiDeployment.contracts.CrossChainVault, VAULT_ABI, deployer);
        console.log(`CrossChainVault: ${fujiDeployment.contracts.CrossChainVault}`);
        console.log(`Owner: ${await vault.owner()}`);

        // Enable Sepolia as supported destination
        const supported = await vault.supportedChains(SEPOLIA_SELECTOR);
        console.log(`Sepolia already supported: ${supported}`);
        if (!supported) {
            console.log("Setting Sepolia as supported chain...");
            const tx = await vault.setSupportedChain(SEPOLIA_SELECTOR, true);
            await tx.wait();
            console.log(`  TX: ${tx.hash}`);
        }

        // Set remote vault
        const remote = await vault.remoteVaults(SEPOLIA_SELECTOR);
        const expected = sepoliaDeployment.contracts.CrossChainVault;
        console.log(`Remote vault for Sepolia: ${remote}`);
        if (remote.toLowerCase() !== expected.toLowerCase()) {
            console.log(`Setting remote vault to ${expected}...`);
            const tx = await vault.setRemoteVault(SEPOLIA_SELECTOR, expected);
            await tx.wait();
            console.log(`  TX: ${tx.hash}`);
        }

        console.log("\nFuji CrossChainVault configured!");
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
