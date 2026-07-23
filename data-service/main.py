from fastapi import FastAPI
import requests
import os
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

FINNHUB_API_KEY = os.getenv("FINNHUB_API_KEY")

@app.get("/quote/{ticker}")
def get_quote(ticker: str):
    url = f"https://finnhub.io/api/v1/quote?symbol={ticker}&token={FINNHUB_API_KEY}"
    response = requests.get(url)
    data = response.json()
    return data

@app.get("/fundamentals/{ticker}")
def get_fundamentals(ticker: str):
    url = f"https://finnhub.io/api/v1/stock/metric?symbol={ticker}&metric=all&token={FINNHUB_API_KEY}"
    response = requests.get(url)
    data = response.json()

    metrics = data.get("metric", {})

    return {
        "ticker": ticker.upper(),
        "pe_ratio": metrics.get("peNormalizedAnnual"),
        "revenue_growth": metrics.get("revenueGrowthTTMYoy"),
        "profit_margin": metrics.get("netProfitMarginTTM"),
        "52_week_high": metrics.get("52WeekHigh"),
        "52_week_low": metrics.get("52WeekLow"),
    }

@app.get("/evaluate/{ticker}/{metric_name}/{target_value}")
def evaluate_metric(ticker: str, metric_name: str, target_value: float):
    fundamentals = get_fundamentals(ticker)

    metric_map = {
        "pe_ratio": fundamentals["pe_ratio"],
        "revenue_growth": fundamentals["revenue_growth"],
        "profit_margin": fundamentals["profit_margin"],
    }

    current_value = metric_map.get(metric_name)

    if current_value is None:
        return {"status": "Unknown", "current_value": None}

    if metric_name == "pe_ratio":
        status = "On Track" if current_value <= target_value else "Watch"
    else:
        status = "On Track" if current_value >= target_value else "Watch"

    return {
        "ticker": ticker.upper(),
        "metric_name": metric_name,
        "target_value": target_value,
        "current_value": current_value,
        "status": status,
    }