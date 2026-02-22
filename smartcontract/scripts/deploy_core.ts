import { ethers } from "hardhat";

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    const initialOwner = deployer.address;
    const treasury = deployer.address; // In production, this should be a DAO or multisig

    // 1. Deploy MathUtils and DataTypes (if they were contracts/libraries that need linking, 
    // but looking at LendingPool.sol they seem to be internal or already handled)
    
    // 2. Deploy InterestRateModel
    // constructor(uint256 baseRate, uint256 kink, uint256 multiplier, uint256 jumpMultiplier, address initialOwner)
    const InterestRateModel = await ethers.getContractFactory("InterestRateModel");
    const interestRateModel = await InterestRateModel.deploy(
        "0",                  // 0% base rate
        "800000000000000000000000000", // 80% kink (RAY)
        "40000000000000000000000000",  // 4% multiplier
        "2000000000000000000000000000", // 200% jump multiplier
        initialOwner
    );
    await interestRateModel.waitForDeployment();
    console.log("InterestRateModel deployed to:", await interestRateModel.getAddress());

    // 3. Deploy LendingPool
    const LendingPool = await ethers.getContractFactory("LendingPool");
    const lendingPool = await LendingPool.deploy(
        initialOwner,
        await interestRateModel.getAddress(),
        treasury
    );
    await lendingPool.waitForDeployment();
    console.log("LendingPool deployed to:", await lendingPool.getAddress());

    // 4. Deploy ChainlinkPriceOracle
    const ChainlinkPriceOracle = await ethers.getContractFactory("ChainlinkPriceOracle");
    const oracle = await ChainlinkPriceOracle.deploy(initialOwner);
    await oracle.waitForDeployment();
    console.log("ChainlinkPriceOracle deployed to:", await oracle.getAddress());

    // 5. Deploy LiquidationAutomation
    const LiquidationAutomation = await ethers.getContractFactory("LiquidationAutomation");
    const automation = await LiquidationAutomation.deploy(
        initialOwner,
        await lendingPool.getAddress()
    );
    await automation.waitForDeployment();
    console.log("LiquidationAutomation deployed to:", await automation.getAddress());

    // 6. Deploy AIYieldEngine
    const AIYieldEngine = await ethers.getContractFactory("AIYieldEngine");
    const aiEngine = await AIYieldEngine.deploy(
        initialOwner,
        await lendingPool.getAddress()
    );
    await aiEngine.waitForDeployment();
    console.log("AIYieldEngine deployed to:", await aiEngine.getAddress());

    // 7. Deploy CrossChainVault
    // constructor(address router, address link, address lendingPool_, address initialOwner)
    // Note: These addresses are chain-specific. Below are placeholders for Base Sepolia (example)
    const routerAddress = "0xD327405835C91D50d5c218145020836163E28Cc8"; // Example router
    const linkAddress = "0xE4aB69C613f3d603af3619b0343ef79577821b3E";   // Example link
    
    const CrossChainVault = await ethers.getContractFactory("CrossChainVault");
    const ccVault = await CrossChainVault.deploy(
        routerAddress,
        linkAddress,
        await lendingPool.getAddress(),
        initialOwner
    );
    await ccVault.waitForDeployment();
    console.log("CrossChainVault deployed to:", await ccVault.getAddress());

    console.log("All core contracts deployed successfully!");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
