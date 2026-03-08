/**
 * Wire remote vaults after both CrossChainVault V2 contracts are deployed.
 *
 *   npx hardhat run scripts/setup_crosschain_v2.ts --network sepolia
 *   npx hardhat run scripts/setup_crosschain_v2.ts --network avalancheFuji
 */
import { network } from "hardhat";
import * as fs from "fs";

const SEPOLIA_SELECTOR = "16015286601757825753";
const FUJI_SELECTOR = "14767482510784806043";

async function main() {
    const connection = await network.connect();
    const { ethers } = connection as any;
    const networkName = (connection as any).networkName as string;

    const [deployer] = await ethers.getSigners();
    console.log(`\nWiring CrossChainVault on ${networkName}\n`);

    const sepoliaDeploy = JSON.parse(fs.readFileSync("./deployments/sepolia.json", "utf8"));
    const fujiDeploy = JSON.parse(fs.readFileSync("./deployments/avalancheFuji.json", "utf8"));

    const VAULT_ABI = [
        "function setRemoteVault(uint64,address) external",
        "function remoteVaults(uint64) view returns (address)",
    ];

    if (networkName === "sepolia") {
        const vault = new ethers.Contract(sepoliaDeploy.contracts.CrossChainVault, VAULT_ABI, deployer);
        const fujiVault = fujiDeploy.contracts.CrossChainVault;
        console.log(`Setting remote vault for Fuji to ${fujiVault}...`);
        const tx = await vault.setRemoteVault(FUJI_SELECTOR, fujiVault);
        await tx.wait();
        console.log(`Done: ${tx.hash}`);
    } else {
        const vault = new ethers.Contract(fujiDeploy.contracts.CrossChainVault, VAULT_ABI, deployer);
        const sepoliaVault = sepoliaDeploy.contracts.CrossChainVault;
        console.log(`Setting remote vault for Sepolia to ${sepoliaVault}...`);
        const tx = await vault.setRemoteVault(SEPOLIA_SELECTOR, sepoliaVault);
        await tx.wait();
        console.log(`Done: ${tx.hash}`);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
