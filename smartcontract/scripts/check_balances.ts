import { ethers } from "ethers";

async function main() {
  const provider = new ethers.JsonRpcProvider("https://eth-sepolia.g.alchemy.com/v2/" + process.env.ALCHEMY_API_KEY);
  const erc20Abi = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)"];
  
  const aToken = new ethers.Contract("0x552f1A08DfF1bd434178789e1D0C5Ff0f618F086", erc20Abi, provider);
  const debtToken = new ethers.Contract("0x6f591160B1F53CbB5d6D7BA9386E7cD0c2879725", erc20Abi, provider);

  console.log("aToken totalSupply:", (await aToken.totalSupply()).toString());
  console.log("debtToken totalSupply:", (await debtToken.totalSupply()).toString());
  
  // Check deployer
  const deployer = "0x564c1B82eDf628af1a464A28270a066D8Cb81838";
  console.log("Deployer aToken:", (await aToken.balanceOf(deployer)).toString());
  console.log("Deployer debtToken:", (await debtToken.balanceOf(deployer)).toString());
  
  // Check the LendingPool contract itself (it holds the aTokens in some designs)
  const pool = "0x87Ff17e9A8f23D02E87d6E87B5631A7eE08C0248";
  console.log("Pool aToken:", (await aToken.balanceOf(pool)).toString());
  console.log("Pool debtToken:", (await debtToken.balanceOf(pool)).toString());
}
main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
