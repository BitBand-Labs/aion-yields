/**
 * Redeploy CrossChainVault with Avalanche Teleporter (Warp Messaging).
 * No LINK token needed — uses native Avalanche ICM.
 *
 *   npx hardhat run scripts/deploy_crosschain_v2.ts --network sepolia
 *   npx hardhat run scripts/deploy_crosschain_v2.ts --network avalancheFuji
 */
import { network } from "hardhat";
import * as fs from "fs";

// Avalanche blockchain IDs (bytes32)
// C-Chain Fuji testnet blockchain ID
const FUJI_BLOCKCHAIN_ID = "0x7fc93d85c6d62c5b2ac0b519c87010ea5294012d1e407030d6acd0021cac10d5";
// Ethereum Sepolia (used as identifier, not a real Avalanche L1)
const SEPOLIA_BLOCKCHAIN_ID = "0x" + Buffer.from("ethereum-sepolia").toString("hex").padEnd(64, "0");

// Teleporter Messenger addresses on testnets
const TELEPORTER_ADDRESSES: Record<string, string> = {
    avalancheFuji: "0x253b2784c75e510dD0fF1da844684a1aC0aa5fcf", // Teleporter on Fuji
    sepolia: "0x0000000000000000000000000000000000000000", // Placeholder — Teleporter is Avalanche-native
};

async function main() {
    const connection = await network.connect();
    const { ethers } = connection as any;
    const networkName = (connection as any).networkName as string;

    const [deployer] = await ethers.getSigners();
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`\n========================================`);
    console.log(`  Redeploy CrossChainVault on ${networkName}`);
    console.log(`  (Avalanche Teleporter / Warp Messaging)`);
    console.log(`========================================`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance:  ${ethers.formatEther(balance)} ETH/AVAX\n`);

    // Load deployments
    const sepoliaDeploy = JSON.parse(fs.readFileSync("./deployments/sepolia.json", "utf8"));
    const fujiDeploy = JSON.parse(fs.readFileSync("./deployments/avalancheFuji.json", "utf8"));

    const isSepoliaNetwork = networkName === "sepolia";
    const localDeploy = isSepoliaNetwork ? sepoliaDeploy : fujiDeploy;
    const remoteDeploy = isSepoliaNetwork ? fujiDeploy : sepoliaDeploy;

    const teleporterAddr = TELEPORTER_ADDRESSES[networkName] || ethers.ZeroAddress;

    // 1. Deploy new CrossChainVault (no LINK needed with Teleporter)
    console.log("1. Deploying CrossChainVault...");
    const CrossChainVault = await ethers.getContractFactory("CrossChainVault");
    const vault = await CrossChainVault.deploy(
        teleporterAddr,
        localDeploy.contracts.LendingPool,
        deployer.address
    );
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    console.log(`   CrossChainVault: ${vaultAddr}`);

    // 2. Set supported destination chain
    const destBlockchainID = isSepoliaNetwork ? FUJI_BLOCKCHAIN_ID : SEPOLIA_BLOCKCHAIN_ID;
    const destName = isSepoliaNetwork ? "Fuji" : "Sepolia";
    console.log(`\n2. Setting ${destName} as supported chain...`);
    let tx = await vault.setSupportedChain(destBlockchainID, true);
    await tx.wait();
    console.log("   Done");

    // 3. Remote vault will be set after both chains are deployed
    console.log(`\n3. Remote vault will be set after both chains are deployed.`);

    // 4. Set token mapping: remote MockUSDC => local MockUSDC
    const remoteUSDC = remoteDeploy.contracts.MockUSDC;
    const localUSDC = localDeploy.contracts.MockUSDC;
    const remoteBlockchainID = isSepoliaNetwork ? FUJI_BLOCKCHAIN_ID : SEPOLIA_BLOCKCHAIN_ID;
    console.log(`\n4. Setting token mapping: remote USDC (${remoteUSDC}) => local USDC (${localUSDC})...`);
    tx = await vault.setTokenMapping(remoteBlockchainID, remoteUSDC, localUSDC);
    await tx.wait();
    console.log("   Done");

    // 5. Fund vault with USDC for cross-chain deposits (destination side)
    console.log(`\n5. No LINK needed — Teleporter uses native Avalanche Warp Messaging.`);

    // 6. Update deployment file
    localDeploy.contracts.CrossChainVault = vaultAddr;
    // Store teleporter address in chainlink section (rename to teleporter)
    localDeploy.teleporter = {
        messengerAddress: teleporterAddr,
        blockchainID: isSepoliaNetwork ? SEPOLIA_BLOCKCHAIN_ID : FUJI_BLOCKCHAIN_ID,
    };
    const deployPath = `./deployments/${networkName}.json`;
    fs.writeFileSync(deployPath, JSON.stringify(localDeploy, null, 2));
    console.log(`\n6. Updated ${deployPath}`);

    console.log(`\n========================================`);
    console.log(`  CrossChainVault deployed: ${vaultAddr}`);
    console.log(`  Using Avalanche Teleporter (no LINK fees)`);
    console.log(`========================================`);
    console.log(`\nAfter deploying on BOTH chains, run setup_crosschain_v2.ts to wire remote vaults.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
