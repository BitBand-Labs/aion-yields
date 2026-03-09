/**
 * Configure CrossChainVault on both chains to support cross-chain deposits.
 * Uses Avalanche Teleporter (Warp Messaging) with bytes32 blockchain IDs.
 *
 *   npx hardhat run scripts/setup_crosschain.ts --network sepolia
 *   npx hardhat run scripts/setup_crosschain.ts --network avalancheFuji
 */
import { network } from "hardhat";
import * as fs from "fs";

// Avalanche blockchain IDs (bytes32)
const FUJI_BLOCKCHAIN_ID = "0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5";
const SEPOLIA_BLOCKCHAIN_ID = "0x" + Buffer.from("ethereum-sepolia").toString("hex").padEnd(64, "0");

async function main() {
    const connection = await network.connect();
    const { ethers } = connection as any;
    const networkName = (connection as any).networkName as string;

    const [deployer] = await ethers.getSigners();
    console.log(`\nConfiguring CrossChainVault on ${networkName} with deployer: ${deployer.address}\n`);

    const sepoliaDeployment = JSON.parse(fs.readFileSync("./deployments/sepolia.json", "utf8"));
    const fujiDeployment = JSON.parse(fs.readFileSync("./deployments/avalancheFuji.json", "utf8"));

    const VAULT_ABI = [
        "function setSupportedChain(bytes32 blockchainID, bool supported) external",
        "function setRemoteVault(bytes32 blockchainID, address vault) external",
        "function supportedChains(bytes32) view returns (bool)",
        "function remoteVaults(bytes32) view returns (address)",
        "function owner() view returns (address)",
    ];

    if (networkName === "sepolia") {
        const vault = new ethers.Contract(sepoliaDeployment.contracts.CrossChainVault, VAULT_ABI, deployer);
        console.log(`CrossChainVault: ${sepoliaDeployment.contracts.CrossChainVault}`);
        console.log(`Owner: ${await vault.owner()}`);

        // Enable Fuji as supported destination
        const supported = await vault.supportedChains(FUJI_BLOCKCHAIN_ID);
        console.log(`Fuji already supported: ${supported}`);
        if (!supported) {
            console.log("Setting Fuji as supported chain...");
            const tx = await vault.setSupportedChain(FUJI_BLOCKCHAIN_ID, true);
            await tx.wait();
            console.log(`  TX: ${tx.hash}`);
        }

        // Set remote vault
        const remote = await vault.remoteVaults(FUJI_BLOCKCHAIN_ID);
        const expected = fujiDeployment.contracts.CrossChainVault;
        console.log(`Remote vault for Fuji: ${remote}`);
        if (remote.toLowerCase() !== expected.toLowerCase()) {
            console.log(`Setting remote vault to ${expected}...`);
            const tx = await vault.setRemoteVault(FUJI_BLOCKCHAIN_ID, expected);
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
        const supported = await vault.supportedChains(SEPOLIA_BLOCKCHAIN_ID);
        console.log(`Sepolia already supported: ${supported}`);
        if (!supported) {
            console.log("Setting Sepolia as supported chain...");
            const tx = await vault.setSupportedChain(SEPOLIA_BLOCKCHAIN_ID, true);
            await tx.wait();
            console.log(`  TX: ${tx.hash}`);
        }

        // Set remote vault
        const remote = await vault.remoteVaults(SEPOLIA_BLOCKCHAIN_ID);
        const expected = sepoliaDeployment.contracts.CrossChainVault;
        console.log(`Remote vault for Sepolia: ${remote}`);
        if (remote.toLowerCase() !== expected.toLowerCase()) {
            console.log(`Setting remote vault to ${expected}...`);
            const tx = await vault.setRemoteVault(SEPOLIA_BLOCKCHAIN_ID, expected);
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
