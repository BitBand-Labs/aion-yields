"""Kite chain x402 payment interceptor for AION Yield AI engine.

Implements the HTTP 402 Payment Required flow for AI inference micropayments:
  1. AI engine is about to call Claude (Anthropic API)
  2. pay_for_inference() sends a small KITE payment on-chain to the inference provider
  3. The returned tx hash serves as on-chain attestation: "this AI call was paid for"
  4. The payment proof is included in the API response for auditability

Kite Testnet:
  Chain ID : 2368
  RPC      : https://rpc.testnet.gokite.ai
  Explorer : https://testnet.kitescan.ai
  Token    : KITE (native, ETH-equivalent)
"""

import json
import os
import time
from typing import Optional

from web3 import Web3
from web3.exceptions import TransactionNotFound

from config import (
    KITE_RPC_URL,
    KITE_CHAIN_ID,
    KITE_PRIVATE_KEY,
    KITE_AGENT_ADDRESS,
    KITE_INFERENCE_PROVIDER,
    KITE_INFERENCE_PRICE_ETH,
)

# ── Constants ──────────────────────────────────────────────────────────────────

MAX_KITE_PER_TX = 0.2       # hard cap per transaction (KITE)
MAX_KITE_PER_SESSION = 1.0  # hard cap for the running process lifetime (KITE)

_session_spent: float = 0.0  # cumulative KITE spent this session


# ── Wallet Loading ─────────────────────────────────────────────────────────────

def _load_wallet() -> tuple[str, str]:
    """Return (address, private_key) from env-vars or kite_wallet.json fallback."""
    address = KITE_AGENT_ADDRESS
    private_key = KITE_PRIVATE_KEY

    if not address or not private_key:
        wallet_path = os.path.join(os.path.dirname(__file__), "kite_wallet.json")
        try:
            with open(wallet_path) as f:
                wallet = json.load(f)
            address = wallet.get("address", "")
            private_key = wallet.get("private_key", "")
        except (FileNotFoundError, json.JSONDecodeError):
            pass

    return address, private_key


# ── Core Payment ───────────────────────────────────────────────────────────────

def pay_for_inference(action_type: str = "ai_inference") -> dict:
    """Send a KITE micropayment for one AI inference call.

    Returns a payment-proof dict:
    {
        "paid":        True | False,
        "tx_hash":     "0x..." | None,
        "amount_kite": 0.001,
        "from":        "0x...",
        "to":          "0x...",
        "chain_id":    2368,
        "explorer_url": "https://testnet.kitescan.ai/tx/0x...",
        "action_type": "ai_inference",
        "timestamp":   1234567890,
        "error":       None | "<reason>"
    }
    """
    global _session_spent

    amount_kite = KITE_INFERENCE_PRICE_ETH
    timestamp = int(time.time())

    base_result = {
        "paid": False,
        "tx_hash": None,
        "amount_kite": amount_kite,
        "from": None,
        "to": KITE_INFERENCE_PROVIDER,
        "chain_id": KITE_CHAIN_ID,
        "explorer_url": None,
        "action_type": action_type,
        "timestamp": timestamp,
        "error": None,
    }

    # Spending-limit guards
    if amount_kite > MAX_KITE_PER_TX:
        base_result["error"] = f"Amount {amount_kite} KITE exceeds per-tx limit {MAX_KITE_PER_TX}"
        return base_result

    if _session_spent + amount_kite > MAX_KITE_PER_SESSION:
        base_result["error"] = (
            f"Session spend limit reached ({_session_spent:.4f}/{MAX_KITE_PER_SESSION} KITE)"
        )
        return base_result

    address, private_key = _load_wallet()
    if not address or not private_key:
        base_result["error"] = "Kite wallet not configured (set KITE_PRIVATE_KEY / KITE_AGENT_ADDRESS)"
        return base_result

    base_result["from"] = address

    try:
        w3 = Web3(Web3.HTTPProvider(KITE_RPC_URL, request_kwargs={"timeout": 10}))

        if not w3.is_connected():
            base_result["error"] = f"Cannot connect to Kite RPC: {KITE_RPC_URL}"
            return base_result

        nonce = w3.eth.get_transaction_count(address)
        gas_price = w3.eth.gas_price

        tx = {
            "chainId": KITE_CHAIN_ID,
            "to": Web3.to_checksum_address(KITE_INFERENCE_PROVIDER),
            "value": w3.to_wei(amount_kite, "ether"),
            "gas": 21000,
            "gasPrice": gas_price,
            "nonce": nonce,
            "data": b"",  # plain ETH transfer; no contract call needed
        }

        signed = w3.eth.account.sign_transaction(tx, private_key)
        tx_hash = w3.eth.send_raw_transaction(signed.raw_transaction)
        tx_hash_hex = tx_hash.hex()

        # Wait for confirmation (up to 15s)
        receipt = None
        for _ in range(15):
            try:
                receipt = w3.eth.get_transaction_receipt(tx_hash)
                if receipt:
                    break
            except TransactionNotFound:
                pass
            time.sleep(1)

        if receipt and receipt.status == 1:
            _session_spent += amount_kite
            explorer_url = f"https://testnet.kitescan.ai/tx/{tx_hash_hex}"
            base_result.update({
                "paid": True,
                "tx_hash": tx_hash_hex,
                "explorer_url": explorer_url,
            })
        else:
            base_result["error"] = "Transaction sent but not confirmed (or reverted)"
            base_result["tx_hash"] = tx_hash_hex

    except Exception as exc:
        base_result["error"] = str(exc)

    return base_result


def get_session_spend() -> dict:
    """Return how much KITE has been spent this session."""
    return {
        "session_spent_kite": _session_spent,
        "session_limit_kite": MAX_KITE_PER_SESSION,
        "remaining_kite": max(0.0, MAX_KITE_PER_SESSION - _session_spent),
    }
