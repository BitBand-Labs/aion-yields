"""On-chain data reader for AION Yield protocol (multi-chain)."""

import json
import httpx
from web3 import Web3
from config import get_chain_config

# Minimal ABIs for reading on-chain data
LENDING_POOL_ABI = json.loads("""[
  {"inputs":[{"name":"asset","type":"address"}],"name":"getReserveData","outputs":[{"components":[
    {"name":"aTokenAddress","type":"address"},
    {"name":"variableDebtTokenAddress","type":"address"},
    {"name":"interestRateStrategyAddress","type":"address"},
    {"name":"chainlinkPriceFeed","type":"address"},
    {"name":"liquidityIndex","type":"uint128"},
    {"name":"variableBorrowIndex","type":"uint128"},
    {"name":"currentLiquidityRate","type":"uint128"},
    {"name":"currentVariableBorrowRate","type":"uint128"},
    {"name":"lastUpdateTimestamp","type":"uint40"},
    {"name":"reserveFactor","type":"uint16"},
    {"name":"liquidationThreshold","type":"uint16"},
    {"name":"liquidationBonus","type":"uint16"},
    {"name":"ltv","type":"uint16"},
    {"name":"totalSupply","type":"uint256"},
    {"name":"totalBorrow","type":"uint256"},
    {"name":"totalSupplyScaled","type":"uint256"},
    {"name":"totalBorrowScaled","type":"uint256"},
    {"name":"isActive","type":"bool"},
    {"name":"isFrozen","type":"bool"},
    {"name":"borrowingEnabled","type":"bool"},
    {"name":"decimals","type":"uint8"}
  ],"name":"","type":"tuple"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"getReservesCount","outputs":[{"name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"name":"","type":"uint256"}],"name":"reservesList","outputs":[{"name":"","type":"address"}],"stateMutability":"view","type":"function"}
]""")

PRICE_ORACLE_ABI = json.loads("""[
  {"inputs":[{"name":"asset","type":"address"}],"name":"getAssetPrice","outputs":[{"name":"price","type":"uint256"},{"name":"isValid","type":"bool"}],"stateMutability":"view","type":"function"}
]""")

RAY = 10**27


def get_web3(chain: str = "sepolia") -> Web3:
    cfg = get_chain_config(chain)
    return Web3(Web3.HTTPProvider(cfg["rpc_url"]))


def get_reserve_data(asset_address: str, chain: str = "sepolia") -> dict:
    """Fetch reserve data for a specific asset from the LendingPool."""
    cfg = get_chain_config(chain)
    w3 = get_web3(chain)
    pool = w3.eth.contract(
        address=Web3.to_checksum_address(cfg["lending_pool"]),
        abi=LENDING_POOL_ABI,
    )
    try:
        data = pool.functions.getReserveData(
            Web3.to_checksum_address(asset_address)
        ).call()

        total_supply = data[13]
        total_borrow = data[14]
        liquidity_rate = data[6]
        borrow_rate = data[7]

        return {
            "chain": chain,
            "asset": asset_address,
            "totalSupply": str(total_supply),
            "totalBorrow": str(total_borrow),
            "liquidityRate": str(liquidity_rate),
            "variableBorrowRate": str(borrow_rate),
            "liquidityIndex": str(data[4]),
            "variableBorrowIndex": str(data[5]),
            "lastUpdateTimestamp": data[8],
            "supplyAPY": round(liquidity_rate * 100 / RAY, 4),
            "borrowAPY": round(borrow_rate * 100 / RAY, 4),
            "utilizationRate": round(
                total_borrow / total_supply * 100, 2
            ) if total_supply > 0 else 0,
            "reserveFactor": data[9],
            "ltv": data[12],
            "liquidationThreshold": data[10],
            "decimals": data[20],
            "isActive": data[17],
        }
    except Exception as e:
        return {"error": str(e), "asset": asset_address, "chain": chain}


def get_asset_price(asset_address: str, chain: str = "sepolia") -> dict:
    """Fetch asset price from ChainlinkPriceOracle."""
    cfg = get_chain_config(chain)
    w3 = get_web3(chain)
    oracle = w3.eth.contract(
        address=Web3.to_checksum_address(cfg["price_oracle"]),
        abi=PRICE_ORACLE_ABI,
    )
    try:
        price, is_valid = oracle.functions.getAssetPrice(
            Web3.to_checksum_address(asset_address)
        ).call()
        return {
            "chain": chain,
            "asset": asset_address,
            "price_usd": price / 1e8,
            "is_valid": is_valid,
        }
    except Exception as e:
        return {"error": str(e), "asset": asset_address, "chain": chain}


async def fetch_external_apys() -> dict:
    """Fetch current APYs from Aave V3 and other protocols via public APIs."""
    results = {"aave_v3": {}, "compound": {}}

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.get("https://yields.llama.fi/pools")
            if resp.status_code == 200:
                pools = resp.json().get("data", [])
                for pool in pools:
                    if pool.get("project") == "aave-v3" and pool.get("chain") == "Ethereum":
                        symbol = pool.get("symbol", "")
                        results["aave_v3"][symbol] = {
                            "apy": pool.get("apy", 0),
                            "tvl": pool.get("tvlUsd", 0),
                            "apyBase": pool.get("apyBase", 0),
                        }
                    if pool.get("project") == "compound-v3" and pool.get("chain") == "Ethereum":
                        symbol = pool.get("symbol", "")
                        results["compound"][symbol] = {
                            "apy": pool.get("apy", 0),
                            "tvl": pool.get("tvlUsd", 0),
                        }
        except Exception:
            pass

    return results
