/**
 * Wire remote vaults after both CrossChainVault contracts are deployed.
 * Uses Avalanche Teleporter blockchain IDs (bytes32) instead of CCIP selectors.
 *
 *   npx hardhat run scripts/setup_crosschain_v2.ts --network sepolia
 *   npx hardhat run scripts/setup_crosschain_v2.ts --network avalancheFuji
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
    console.log(`\nWiring CrossChainVault on ${networkName} (Teleporter)\n`);

    const sepoliaDeploy = JSON.parse(fs.readFileSync("./deployments/sepolia.json", "utf8"));
    const fujiDeploy = JSON.parse(fs.readFileSync("./deployments/avalancheFuji.json", "utf8"));

    const VAULT_ABI = [
        "function setRemoteVault(bytes32,address) external",
        "function remoteVaults(bytes32) view returns (address)",
    ];

    if (networkName === "sepolia") {
        const vault = new ethers.Contract(sepoliaDeploy.contracts.CrossChainVault, VAULT_ABI, deployer);
        const fujiVault = fujiDeploy.contracts.CrossChainVault;
        console.log(`Setting remote vault for Fuji to ${fujiVault}...`);
        const tx = await vault.setRemoteVault(FUJI_BLOCKCHAIN_ID, fujiVault);
        await tx.wait();
        console.log(`Done: ${tx.hash}`);
    } else {
        const vault = new ethers.Contract(fujiDeploy.contracts.CrossChainVault, VAULT_ABI, deployer);
        const sepoliaVault = sepoliaDeploy.contracts.CrossChainVault;
        console.log(`Setting remote vault for Sepolia to ${sepoliaVault}...`);
        const tx = await vault.setRemoteVault(SEPOLIA_BLOCKCHAIN_ID, sepoliaVault);
        await tx.wait();
        console.log(`Done: ${tx.hash}`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
