#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass

ROOT = Path("C:/Users/amd/hermes")


def ensure_package(name: str, import_name: str | None = None) -> None:
    import importlib.util
    import subprocess

    module = import_name or name
    if importlib.util.find_spec(module):
        return
    subprocess.check_call([sys.executable, "-m", "pip", "install", name, "-q"])


def suffix_for_market(market: str) -> str | None:
    value = str(market or "").upper()
    if value == "KOSPI":
        return ".KS"
    if value in {"KOSDAQ", "KONEX"}:
        return ".KQ"
    return None


def chunked(items: list[str], size: int):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def field_frame(downloaded, field: str):
    import pandas as pd

    if downloaded is None or downloaded.empty:
        return pd.DataFrame()
    if isinstance(downloaded.columns, pd.MultiIndex):
        if field in downloaded.columns.get_level_values(-1):
            return downloaded.xs(field, axis=1, level=-1, drop_level=True)
        if field in downloaded.columns.get_level_values(0):
            return downloaded[field]
    if field in downloaded.columns:
        return downloaded[[field]]
    return pd.DataFrame()


def main() -> None:
    parser = argparse.ArgumentParser(description="Find KRX stocks closest to their 3-year high")
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--years", type=int, default=3)
    parser.add_argument("--target", type=float, default=10000.0)
    parser.add_argument("--require-below", type=float, default=None)
    parser.add_argument("--recent-days", type=int, default=30)
    parser.add_argument("--near-pct", type=float, default=0.05)
    parser.add_argument("--chunk-size", type=int, default=100)
    parser.add_argument("--max-codes", type=int, default=0)
    parser.add_argument("--out-dir", default=str(ROOT / "outputs" / f"krx-near-3y-high-{datetime.now().strftime('%Y%m%d-%H%M%S')}"))
    args = parser.parse_args()

    ensure_package("finance-datareader", "FinanceDataReader")
    ensure_package("yfinance")

    import FinanceDataReader as fdr
    import pandas as pd
    import yfinance as yf

    today = date.today()
    start = today - timedelta(days=365 * args.years + 14)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(json.dumps({"phase": "listing", "source": "FinanceDataReader.StockListing(KRX)"}, ensure_ascii=False), file=sys.stderr)
    listing = fdr.StockListing("KRX")
    listing = listing.dropna(subset=["Code", "Name"]).copy()
    listing["Code"] = listing["Code"].astype(str).str.zfill(6)
    listing["Suffix"] = listing.get("Market", "").map(suffix_for_market)
    listing = listing.dropna(subset=["Suffix"])
    listing["YFTicker"] = listing["Code"] + listing["Suffix"]
    listing = listing.drop_duplicates(subset=["Code"])
    if args.max_codes > 0:
        listing = listing.head(args.max_codes)

    meta = {row.YFTicker: {"code": row.Code, "name": row.Name, "market": row.Market} for row in listing.itertuples()}
    tickers = list(meta)
    rows: list[dict] = []
    failed_chunks = 0
    total_chunks = math.ceil(len(tickers) / max(1, args.chunk_size))
    print(json.dumps({"phase": "download_3y", "tickers": len(tickers), "chunks": total_chunks}, ensure_ascii=False), file=sys.stderr)

    for chunk_index, chunk in enumerate(chunked(tickers, args.chunk_size), 1):
        try:
            data = yf.download(
                chunk,
                start=start.isoformat(),
                end=(today + timedelta(days=1)).isoformat(),
                progress=False,
                group_by="ticker",
                auto_adjust=False,
                threads=True,
            )
            closes = field_frame(data, "Close")
            highs = field_frame(data, "High")
            for ticker in chunk:
                if ticker not in closes.columns or ticker not in highs.columns:
                    continue
                close_series = closes[ticker].dropna()
                high_series = highs[ticker].dropna()
                close_series = close_series[close_series > 0]
                high_series = high_series[high_series > 0]
                if close_series.empty or high_series.empty:
                    continue
                latest_dt = pd.Timestamp(close_series.index[-1]).date()
                latest_close = float(close_series.iloc[-1])
                if args.require_below is not None and high_series.max() >= args.require_below:
                    continue
                low_value = float(high_series.min())
                if low_value <= 0:
                    continue

                recent_cutoff = pd.Timestamp(datetime.now().date() - timedelta(days=args.recent_days))
                recent_series = close_series[close_series.index >= recent_cutoff]
                if recent_series.empty:
                    continue

                recent_near = recent_series[
                    (recent_series >= args.target * (1 - args.near_pct))
                    & (recent_series <= args.target * (1 + args.near_pct))
                ]
                if recent_near.empty:
                    continue

                gap_abs = abs(latest_close - args.target)
                if args.target <= 0:
                    continue
                distance_pct = (gap_abs / args.target) * 100.0
                recent_gap = abs(float(recent_near.iloc[-1]) - args.target)
                recent_distance_pct = (recent_gap / args.target) * 100.0
                info = meta[ticker]
                rows.append({
                    "rank": 0,
                    "code": info["code"],
                    "name": info["name"],
                    "market": info["market"],
                    "ticker": ticker,
                    "latest_date": str(latest_dt),
                    "latest_close": round(latest_close, 2),
                    "three_year_min": round(float(low_value), 2),
                    "target_price": round(args.target, 2),
                    "distance_to_target_pct": round(distance_pct, 4),
                    "distance_to_high_pct": round(distance_pct, 4),
                    "recent_days": args.recent_days,
                    "near_pct": args.near_pct,
                    "recent_close_near_target_pct": round(recent_distance_pct, 4),
                })
        except Exception as exc:
            failed_chunks += 1
            print(json.dumps({"phase": "chunk_failed", "chunk": chunk_index, "error": str(exc)[:300]}, ensure_ascii=False), file=sys.stderr)
        print(json.dumps({"phase": "download_progress", "chunk": chunk_index, "chunks": total_chunks, "rows": len(rows)}, ensure_ascii=False), file=sys.stderr)

    rows.sort(key=lambda item: (item["distance_to_target_pct"], abs(args.target - item["latest_close"])))
    top = rows[:args.top]
    for index, item in enumerate(top, 1):
        item["rank"] = index

    result = {
        "ok": bool(top),
        "source": "FinanceDataReader KRX listing + yfinance grouped downloads",
        "method": f"latest close proximity to {args.target} with 3-year max {('strictly ' + 'below ' + str(args.require_below)) if args.require_below is not None else 'filtered by max rule'}",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "out_dir": str(out_dir),
        "universe_count": len(tickers),
        "ranked_count": len(rows),
        "failed_chunks": failed_chunks,
        "top": top,
    }
    (out_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
