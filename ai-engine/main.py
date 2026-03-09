"""AION Yield AI Strategy Engine - FastAPI Server (Multi-Chain).

Endpoints:
  GET  /health                          - Health check
  GET  /reserve/{asset}?chain=sepolia   - Fetch on-chain reserve data
  GET  /price/{asset}?chain=sepolia     - Fetch asset price
  GET  /external-apys                   - Fetch external protocol APYs
  POST /analyze                         - AI-powered rate & allocation analysis
  POST /predict                         - AI-powered yield prediction

Supported chains: sepolia, fuji
"""

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional

from config import HOST, PORT, ANTHROPIC_API_KEY, CHAIN_CONFIG, get_chain_config
from chain_reader import get_reserve_data, get_asset_price, fetch_external_apys
from ai_strategy import analyze_and_recommend, predict_yield

app = FastAPI(
    title="AION Yield AI Strategy Engine",
    description="AI-powered DeFi yield optimization using Anthropic Claude (Sepolia + Avalanche Fuji)",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "https://aionyield.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def resolve_asset(asset_address: str | None, chain: str) -> str:
    """Return the asset address, falling back to MockUSDC if empty or invalid."""
    if asset_address and asset_address.startswith("0x") and len(asset_address) == 42:
        return asset_address
    return get_chain_config(chain)["mock_usdc"]


# ── Request Models ──


class AnalyzeRequest(BaseModel):
    asset_address: Optional[str] = Field(default=None, description="ERC-20 token address. Leave empty to use MockUSDC for the selected chain.")
    asset_symbol: str = "USDC"
    chain: str = Field(default="fuji", description="Chain: sepolia or fuji")


class PredictRequest(BaseModel):
    asset_address: Optional[str] = Field(default=None, description="ERC-20 token address. Leave empty to use MockUSDC for the selected chain.")
    timeframe_seconds: int = Field(default=1, description="Prediction window in seconds")
    chain: str = Field(default="fuji", description="Chain: sepolia or fuji")


# ── Endpoints ──


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "ai_configured": bool(ANTHROPIC_API_KEY),
        "service": "AION Yield AI Strategy Engine",
        "supported_chains": list(CHAIN_CONFIG.keys()),
    }


@app.get("/reserve/{asset_address}")
async def get_reserve(
    asset_address: str,
    chain: str = Query(default="sepolia", description="Chain: sepolia or fuji"),
):
    """Fetch on-chain reserve data for an asset."""
    data = get_reserve_data(asset_address, chain=chain)
    if "error" in data:
        raise HTTPException(status_code=500, detail=data["error"])
    return data


@app.get("/price/{asset_address}")
async def get_price(
    asset_address: str,
    chain: str = Query(default="sepolia", description="Chain: sepolia or fuji"),
):
    """Fetch asset price from ChainlinkPriceOracle."""
    data = get_asset_price(asset_address, chain=chain)
    if "error" in data:
        raise HTTPException(status_code=500, detail=data["error"])
    return data


@app.get("/external-apys")
async def external_apys():
    """Fetch APYs from external protocols (Aave V3, Compound)."""
    return await fetch_external_apys()


@app.post("/analyze")
async def analyze(request: AnalyzeRequest):
    """AI-powered analysis: reads on-chain data, fetches external APYs,
    and uses Claude to produce rate + allocation recommendations."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="Anthropic API key not configured")

    asset = resolve_asset(request.asset_address, request.chain)

    reserve_data = get_reserve_data(asset, chain=request.chain)
    if "error" in reserve_data:
        raise HTTPException(status_code=500, detail=f"Chain read error: {reserve_data['error']}")

    price_data = get_asset_price(asset, chain=request.chain)
    external = await fetch_external_apys()

    result = await analyze_and_recommend(
        reserve_data=reserve_data,
        asset_price=price_data,
        external_apys=external,
        asset_symbol=request.asset_symbol,
    )

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "chain": request.chain,
        "input": {
            "reserve": reserve_data,
            "price": price_data,
        },
        "ai_recommendation": result,
    }


@app.post("/predict")
async def predict(request: PredictRequest):
    """AI-powered yield prediction over a timeframe."""
    if not ANTHROPIC_API_KEY:
        raise HTTPException(status_code=503, detail="Anthropic API key not configured")

    asset = resolve_asset(request.asset_address, request.chain)

    reserve_data = get_reserve_data(asset, chain=request.chain)
    if "error" in reserve_data:
        raise HTTPException(status_code=500, detail=f"Chain read error: {reserve_data['error']}")

    external = await fetch_external_apys()

    result = await predict_yield(
        reserve_data=reserve_data,
        external_apys=external,
        timeframe_seconds=request.timeframe_seconds,
    )

    if "error" in result:
        raise HTTPException(status_code=500, detail=result["error"])

    return {
        "chain": request.chain,
        "input": {"reserve": reserve_data},
        "prediction": result,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)
