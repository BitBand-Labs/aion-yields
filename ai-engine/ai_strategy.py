"""AI Strategy Engine powered by Anthropic Claude.

Analyzes on-chain data and external DeFi market conditions
to produce optimal rate and allocation recommendations for AION Yield.
"""

import json
import anthropic
from config import ANTHROPIC_API_KEY, CLAUDE_MODEL

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

SYSTEM_PROMPT = """You are the AION Yield AI Strategy Engine - an expert DeFi yield optimizer.

Your job is to analyze lending protocol data and external market conditions, then produce
actionable recommendations for interest rate parameters and cross-protocol liquidity allocation.

You work with these parameters (all in RAY precision = 1e27, but you should reason in percentages):
- baseRate: The minimum borrow rate at 0% utilization
- rateSlope1: Rate increase per unit of utilization below the optimal point
- rateSlope2: Steep rate increase per unit above the optimal point (penalty zone)
- optimalUtilization: The utilization target where slope changes (kink point)

Your goals:
1. Keep utilization near the optimal point (typically 75-85%)
2. Ensure competitive supply APYs to attract liquidity
3. Penalize excessive borrowing with steep slope2
4. Recommend cross-protocol allocation to maximize risk-adjusted yield

Output ONLY valid JSON matching the requested schema. No markdown, no explanation outside JSON."""


async def analyze_and_recommend(
    reserve_data: dict,
    asset_price: dict,
    external_apys: dict,
    asset_symbol: str = "USDC",
) -> dict:
    """Use Claude to analyze market conditions and produce recommendations."""

    user_prompt = f"""Analyze the following DeFi market data and produce optimal rate recommendations.

## AION Protocol Reserve Data ({asset_symbol}):
{json.dumps(reserve_data, indent=2)}

## Asset Price:
{json.dumps(asset_price, indent=2)}

## External Protocol APYs (for competitive analysis):
{json.dumps(external_apys, indent=2)}

## Task:
Produce a JSON response with this exact schema:
{{
  "analysis": {{
    "current_utilization": <number, percentage>,
    "market_assessment": "<brief assessment of current conditions>",
    "competitive_position": "<how AION compares to Aave/Compound>",
    "risk_level": "<low|medium|high>",
    "risk_factors": ["<factor1>", "<factor2>"]
  }},
  "rate_recommendation": {{
    "baseRate": <number, as percentage e.g. 2.0 for 2%>,
    "rateSlope1": <number, as percentage>,
    "rateSlope2": <number, as percentage>,
    "optimalUtilization": <number, as percentage e.g. 80 for 80%>,
    "reasoning": "<why these rates>"
  }},
  "allocation_recommendation": {{
    "aion_pool_pct": <number, percentage to keep in AION pool>,
    "aave_v3_pct": <number, percentage to route to Aave V3>,
    "morpho_pct": <number, percentage to route to Morpho>,
    "reasoning": "<why this allocation>"
  }},
  "predicted_apy": {{
    "supply_apy": <number, projected supply APY after changes>,
    "borrow_apy": <number, projected borrow APY after changes>,
    "confidence": <number, 0-100>
  }}
}}"""

    message = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=2000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    # Parse the response
    response_text = message.content[0].text.strip()

    # Handle potential markdown wrapping
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        response_text = "\n".join(lines[1:-1])

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        return {
            "error": "Failed to parse AI response",
            "raw_response": response_text,
        }


async def predict_yield(
    reserve_data: dict,
    external_apys: dict,
    timeframe_seconds: int = 1,
) -> dict:
    """Use Claude to predict yield trends over a timeframe."""

    user_prompt = f"""Based on the following DeFi data, predict yield trends for the next {timeframe_seconds} seconds (real-time micro-prediction).

## Current Reserve Data:
{json.dumps(reserve_data, indent=2)}

## External Market APYs:
{json.dumps(external_apys, indent=2)}

Respond with JSON:
{{
  "predicted_supply_apy": <number>,
  "predicted_borrow_apy": <number>,
  "trend": "<increasing|stable|decreasing>",
  "confidence": <number, 0-100>,
  "factors": ["<key factor 1>", "<key factor 2>", "<key factor 3>"],
  "recommendation": "<brief actionable recommendation>"
}}"""

    message = client.messages.create(
        model=CLAUDE_MODEL,
        max_tokens=1000,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )

    response_text = message.content[0].text.strip()
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        response_text = "\n".join(lines[1:-1])

    try:
        return json.loads(response_text)
    except json.JSONDecodeError:
        return {"error": "Failed to parse AI response", "raw_response": response_text}
