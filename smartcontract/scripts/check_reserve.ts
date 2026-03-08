import { ethers } from "ethers";

async function main() {
  const provider = new ethers.JsonRpcProvider(
    "https://eth-sepolia.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY
  );
  
  const poolAbi = ["function getReserveData(address asset) view returns (tuple(address aTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, address chainlinkPriceFeed, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint40 lastUpdateTimestamp, uint16 reserveFactor, uint16 liquidationThreshold, uint16 liquidationBonus, uint16 ltv, uint256 totalSupply, uint256 totalBorrow, uint256 totalSupplyScaled, uint256 totalBorrowScaled, bool isActive, bool isFrozen, bool borrowingEnabled))"];
  const erc20Abi = ["function balanceOf(address) view returns (uint256)"];
  
  const pool = new ethers.Contract("0x87Ff17e9A8f23D02E87d6E87B5631A7eE08C0248", poolAbi, provider);
  const data = await pool.getReserveData("0x331cB2F787b2DC57855Bb30B51bE09aEF53e84C0");
  
  console.log("aTokenAddress:", data.aTokenAddress);
  console.log("debtTokenAddress:", data.variableDebtTokenAddress);
  console.log("currentLiquidityRate:", data.currentLiquidityRate.toString());
  console.log("currentVariableBorrowRate:", data.currentVariableBorrowRate.toString());
  console.log("totalSupply:", data.totalSupply.toString());
  console.log("totalBorrow:", data.totalBorrow.toString());
  
  const user = "0x564c1B82eDf628af1a464A28270a066D8Cb81838";
  const aToken = new ethers.Contract(data.aTokenAddress, erc20Abi, provider);
  const debtToken = new ethers.Contract(data.variableDebtTokenAddress, erc20Abi, provider);
  console.log("User aToken balance:", (await aToken.balanceOf(user)).toString());
  console.log("User debtToken balance:", (await debtToken.balanceOf(user)).toString());
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
