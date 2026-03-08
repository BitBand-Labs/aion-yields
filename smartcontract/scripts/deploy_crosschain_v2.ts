/**
 * Redeploy CrossChainVault with message-only CCIP (no token bridging).
 * Then configure supported chains, remote vaults, and token mappings.
 *
 *   npx hardhat run scripts/deploy_crosschain_v2.ts --network sepolia
 *   npx hardhat run scripts/deploy_crosschain_v2.ts --network avalancheFuji
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
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`\n========================================`);
    console.log(`  Redeploy CrossChainVault on ${networkName}`);
    console.log(`========================================`);
    console.log(`Deployer: ${deployer.address}`);
    console.log(`Balance:  ${ethers.formatEther(balance)} ETH\n`);

    // Load deployments
    const sepoliaDeploy = JSON.parse(fs.readFileSync("./deployments/sepolia.json", "utf8"));
    const fujiDeploy = JSON.parse(fs.readFileSync("./deployments/avalancheFuji.json", "utf8"));

    const isSepoliaNetwork = networkName === "sepolia";
    const localDeploy = isSepoliaNetwork ? sepoliaDeploy : fujiDeploy;
    const remoteDeploy = isSepoliaNetwork ? fujiDeploy : sepoliaDeploy;
    const localChainlink = localDeploy.chainlink;

    // 1. Deploy new CrossChainVault
    console.log("1. Deploying CrossChainVault...");
    const CrossChainVault = await ethers.getContractFactory("CrossChainVault");
    const vault = await CrossChainVault.deploy(
        localChainlink.ccipRouter,
        localChainlink.linkToken,
        localDeploy.contracts.LendingPool,
        deployer.address
    );
    await vault.waitForDeployment();
    const vaultAddr = await vault.getAddress();
    console.log(`   CrossChainVault: ${vaultAddr}`);

    // 2. Set supported destination chain
    const destSelector = isSepoliaNetwork ? FUJI_SELECTOR : SEPOLIA_SELECTOR;
    const destName = isSepoliaNetwork ? "Fuji" : "Sepolia";
    console.log(`\n2. Setting ${destName} as supported chain...`);
    let tx = await vault.setSupportedChain(destSelector, true);
    await tx.wait();
    console.log("   Done");

    // 3. Set remote vault (use OLD remote vault address for now - will update after both deploys)
    // We'll set it to a placeholder and update later
    console.log(`\n3. Remote vault will be set after both chains are deployed.`);

    // 4. Set token mapping: remote MockUSDC => local MockUSDC
    const remoteUSDC = remoteDeploy.contracts.MockUSDC;
    const localUSDC = localDeploy.contracts.MockUSDC;
    const remoteSelector = isSepoliaNetwork ? FUJI_SELECTOR : SEPOLIA_SELECTOR;
    console.log(`\n4. Setting token mapping: remote USDC (${remoteUSDC}) => local USDC (${localUSDC})...`);
    tx = await vault.setTokenMapping(remoteSelector, remoteUSDC, localUSDC);
    await tx.wait();
    console.log("   Done");

    // 5. Transfer LINK to new vault (transfer from deployer)
    console.log(`\n5. Checking deployer LINK balance...`);
    const linkToken = new ethers.Contract(
        localChainlink.linkToken,
        ["function balanceOf(address) view returns (uint256)", "function transfer(address,uint256) returns (bool)"],
        deployer
    );
    const linkBal = await linkToken.balanceOf(deployer.address);
    console.log(`   Deployer LINK: ${ethers.formatEther(linkBal)}`);

    // Also check if old vault has LINK we can recover
    const oldVaultAddr = localDeploy.contracts.CrossChainVault;
    const oldVault = new ethers.Contract(oldVaultAddr, [
        "function withdrawToken(address,uint256) external",
        "function owner() view returns (address)",
    ], deployer);
    const oldVaultLink = await linkToken.balanceOf(oldVaultAddr);
    console.log(`   Old vault LINK: ${ethers.formatEther(oldVaultLink)}`);

    if (oldVaultLink > 0n) {
        console.log("   Recovering LINK from old vault...");
        try {
            tx = await oldVault.withdrawToken(localChainlink.linkToken, oldVaultLink);
            await tx.wait();
            console.log("   Recovered!");
        } catch (e: any) {
            console.log(`   Could not recover: ${e.message?.slice(0, 80)}`);
        }
    }

    // Send 2 LINK to new vault (or whatever we have, up to 2)
    const updatedLinkBal = await linkToken.balanceOf(deployer.address);
    const sendAmount = updatedLinkBal > ethers.parseEther("2") ? ethers.parseEther("2") : updatedLinkBal;
    if (sendAmount > 0n) {
        console.log(`   Sending ${ethers.formatEther(sendAmount)} LINK to new vault...`);
        tx = await linkToken.transfer(vaultAddr, sendAmount);
        await tx.wait();
        console.log("   Done");
    }

    // 6. Update deployment file
    localDeploy.contracts.CrossChainVault = vaultAddr;
    const deployPath = `./deployments/${networkName}.json`;
    fs.writeFileSync(deployPath, JSON.stringify(localDeploy, null, 2));
    console.log(`\n6. Updated ${deployPath}`);

    console.log(`\n========================================`);
    console.log(`  CrossChainVault deployed: ${vaultAddr}`);
    console.log(`========================================`);
    console.log(`\nAfter deploying on BOTH chains, run setup_crosschain_v2.ts to wire remote vaults.`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
