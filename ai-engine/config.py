import os
from dotenv import load_dotenv

load_dotenv()

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
SEPOLIA_RPC_URL = os.getenv("SEPOLIA_RPC_URL", "https://eth-sepolia.g.alchemy.com/v2/demo")
AVAX_FUJI_RPC_URL = os.getenv("AVAX_FUJI_RPC_URL", "https://api.avax-test.network/ext/bc/C/rpc")

LENDING_POOL_ADDRESS = os.getenv("LENDING_POOL_ADDRESS", "0x87Ff17e9A8f23D02E87d6E87B5631A7eE08C0248")
AI_YIELD_ENGINE_ADDRESS = os.getenv("AI_YIELD_ENGINE_ADDRESS", "0x77F1FCEcCB6C186C3df22F3E7f7586D51E40bfF2")
PRICE_ORACLE_ADDRESS = os.getenv("PRICE_ORACLE_ADDRESS", "0xdBF02AeBf96D1C3E8B4E35f61C27A37cc6f601e4")

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8000"))

# Claude model
CLAUDE_MODEL = "claude-sonnet-4-20250514"
