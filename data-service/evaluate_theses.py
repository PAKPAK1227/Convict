import os
import time
from dotenv import load_dotenv
from supabase import create_client
from main import get_fundamentals

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)

fundamentals_cache = {}


def get_cached_fundamentals(ticker):
    if ticker not in fundamentals_cache:
        fundamentals_cache[ticker] = get_fundamentals(ticker)
        time.sleep(1.2)
    return fundamentals_cache[ticker]


def evaluate_all_metrics():
    metrics_response = supabase.table("metrics").select("*, theses(id, ticker)").execute()
    metrics = metrics_response.data

    thesis_statuses = {}

    for metric in metrics:
        thesis_id = metric["theses"]["id"]
        ticker = metric["theses"]["ticker"]
        metric_name = metric["metric_name"].strip().lower().replace(" ", "_")
        target_value = metric["target_value"]

        fundamentals = get_cached_fundamentals(ticker)

        metric_map = {
            "pe_ratio": fundamentals["pe_ratio"],
            "revenue_growth": fundamentals["revenue_growth"],
            "profit_margin": fundamentals["profit_margin"],
        }

        current_value = metric_map.get(metric_name)

        if current_value is None:
            print(f"Skipping {ticker} — unknown metric '{metric_name}'")
            continue

        if metric_name == "pe_ratio":
            metric_ok = current_value <= target_value
        else:
            metric_ok = current_value >= target_value

        supabase.table("metrics").update({
            "current_value": current_value,
        }).eq("id", metric["id"]).execute()

        print(f"Updated {ticker} — {metric_name}: target {target_value}, current {current_value}")

        if thesis_id not in thesis_statuses:
            thesis_statuses[thesis_id] = True
        if not metric_ok:
            thesis_statuses[thesis_id] = False

    for thesis_id, all_ok in thesis_statuses.items():
        new_status = "On Track" if all_ok else "Watch"
        supabase.table("theses").update({
            "status": new_status,
        }).eq("id", thesis_id).execute()
        print(f"Thesis {thesis_id} set to {new_status}")


if __name__ == "__main__":
    evaluate_all_metrics()