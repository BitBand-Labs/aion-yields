import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    const lendingPoolAddress = "PASTE_LENDING_POOL_ADDRESS_HERE";
    const underlyingAssetAddress = "PASTE_TOKEN_ADDRESS_HERE"; // e.g. WETH or USDC
    const assetName = "AION WETH";
    const assetSymbol = "aWETH";
    const debtSymbol = "debtWETH";
    const decimals = 18;

    const initialOwner = deployer.address;

    // 1. Deploy AToken
    const AToken = await ethers.getContractFactory("AToken");
    const aToken = await AToken.deploy(
        assetName,
        assetSymbol,
        underlyingAssetAddress,
        lendingPoolAddress,
        initialOwner
    );
    await aToken.waitForDeployment();
    console.log(`${assetSymbol} deployed to:`, await aToken.getAddress());

    // 2. Deploy VariableDebtToken
    const VariableDebtToken = await ethers.getContractFactory("VariableDebtToken");
    const debtToken = await VariableDebtToken.deploy(
        `AION Variable Debt ${assetSymbol}`,
        debtSymbol,
        underlyingAssetAddress,
        lendingPoolAddress,
        initialOwner
    );
    await debtToken.waitForDeployment();
    console.log(`${debtSymbol} deployed to:`, await debtToken.getAddress());

    // 3. Initialize Reserve in LendingPool
    const LendingPool = await ethers.getContractFactory("LendingPool");
    const lendingPool = LendingPool.attach(lendingPoolAddress) as any;

    console.log("Initializing reserve in LendingPool...");
    
    // address asset,
    // address aTokenAddress,
    // address debtTokenAddress,
    // address priceFeed,
    // uint16 reserveFactor (percentage factor: 10000 = 100%, 2000 = 20%)
    // uint16 ltv (e.g. 7500 = 75%)
    // uint16 liquidationThreshold (e.g. 8000 = 80%)
    // uint16 liquidationBonus (e.g. 10500 = 105%, meaning 5% bonus)
    // uint8 decimals
    const tx = await lendingPool.initReserve(
        underlyingAssetAddress,
        await aToken.getAddress(),
        await debtToken.getAddress(),
        "0x0000000000000000000000000000000000000000", // PlaceHolder for PriceFeed
        2000, 
        7500, 
        8000, 
        10500, 
        decimals
    );
    await tx.wait();
    console.log("Reserve initialized!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
