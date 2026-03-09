import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SEPOLIA_RPC_URL = os.getenv("SEPOLIA_RPC_URL", "https://eth-sepolia.g.alchemy.com/v2/demo")
AVAX_FUJI_RPC_URL = os.getenv("AVAX_FUJI_RPC_URL", "https://api.avax-test.network/ext/bc/C/rpc")

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Claude model
CLAUDE_MODEL = "claude-sonnet-4-20250514"

# Per-chain contract addresses
CHAIN_CONFIG = {
    "sepolia": {
        "rpc_url": SEPOLIA_RPC_URL,
        "lending_pool": "0x87Ff17e9A8f23D02E87d6E87B5631A7eE08C0248",
        "price_oracle": "0xdBF02AeBf96D1C3E8B4E35f61C27A37cc6f601e4",
        "ai_yield_engine": "0x4a8Ec2D9655600bc5d5D3460e8680251C839E61D",
        "mock_usdc": "0x331cB2F787b2DC57855Bb30B51bE09aEF53e84C0",
    },
    "fuji": {
        "rpc_url": AVAX_FUJI_RPC_URL,
        "lending_pool": "0x3547aD159ACAf2660bc5E26E682899D11826c068",
        "price_oracle": "0xbf8528f513111b8352cdc649A5C9031a83dB3e20",
        "ai_yield_engine": "0x104895cc071Fb53ba9d4851c0fe1B896dCEB558A",
        "mock_usdc": "0xa35C19170526eB8764a995fb5298eD1156B1b379",
    },
}

def get_chain_config(chain: str) -> dict:
    """Get config for a chain. Defaults to sepolia if unknown."""
    return CHAIN_CONFIG.get(chain, CHAIN_CONFIG["sepolia"])
