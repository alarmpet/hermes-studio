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


def close_frame(downloaded):
    import pandas as pd

    if downloaded is None or downloaded.empty:
        return pd.DataFrame()
    if isinstance(downloaded.columns, pd.MultiIndex):
        if "Close" in downloaded.columns.get_level_values(-1):
            return downloaded.xs("Close", axis=1, level=-1, drop_level=True)
        if "Close" in downloaded.columns.get_level_values(0):
            return downloaded["Close"]
    if "Close" in downloaded.columns:
        return downloaded[["Close"]]
    return pd.DataFrame()


def main() -> None:
    parser = argparse.ArgumentParser(description="Find KRX stocks reclaiming a target price after staying below it")
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--years", type=int, default=3)
    parser.add_argument("--target", type=float, default=10000.0)
    parser.add_argument("--recent-days", type=int, default=31)
    parser.add_argument("--near-pct", type=float, default=0.08)
    parser.add_argument("--chunk-size", type=int, default=100)
    parser.add_argument("--max-codes", type=int, default=0)
    parser.add_argument("--out-dir", default=str(ROOT / "outputs" / f"krx-target-reclaim-{datetime.now().strftime('%Y%m%d-%H%M%S')}"))
    args = parser.parse_args()

    ensure_package("finance-datareader", "FinanceDataReader")
    ensure_package("yfinance")

    import FinanceDataReader as fdr
    import pandas as pd
    import yfinance as yf

    today = date.today()
    start = today - timedelta(days=365 * args.years + args.recent_days + 14)
    recent_cutoff = pd.Timestamp(today - timedelta(days=args.recent_days))
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
    print(json.dumps({"phase": "download_close", "tickers": len(tickers), "chunks": total_chunks}, ensure_ascii=False), file=sys.stderr)

    lower = args.target * (1.0 - args.near_pct)
    upper = args.target * (1.0 + args.near_pct)
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
            closes = close_frame(data)
            for ticker in chunk:
                if ticker not in closes.columns:
                    continue
                series = closes[ticker].dropna()
                series = series[series > 0]
                if len(series) < 60:
                    continue
                historical = series[series.index < recent_cutoff]
                recent = series[series.index >= recent_cutoff]
                if historical.empty or recent.empty:
                    continue

                historical_max = float(historical.max())
                if historical_max >= args.target:
                    continue

                latest_date = pd.Timestamp(series.index[-1]).date()
                latest_close = float(series.iloc[-1])
                if not (lower <= latest_close <= upper):
                    continue

                recent_near = recent[(recent >= lower) & (recent <= upper)]
                if recent_near.empty:
                    continue

                first_near_date = pd.Timestamp(recent_near.index[0]).date()
                first_near_close = float(recent_near.iloc[0])
                distance_pct = abs(latest_close - args.target) / args.target * 100.0
                info = meta[ticker]
                rows.append({
                    "rank": 0,
                    "code": info["code"],
                    "name": info["name"],
                    "market": info["market"],
                    "ticker": ticker,
                    "latest_date": str(latest_date),
                    "latest_close": round(latest_close, 2),
                    "target_price": round(args.target, 2),
                    "distance_to_target_pct": round(distance_pct, 4),
                    "historical_max_before_recent": round(historical_max, 2),
                    "historical_period_end": str(pd.Timestamp(historical.index[-1]).date()),
                    "recent_days": args.recent_days,
                    "near_pct": args.near_pct,
                    "first_recent_near_date": str(first_near_date),
                    "first_recent_near_close": round(first_near_close, 2),
                })
        except Exception as exc:
            failed_chunks += 1
            print(json.dumps({"phase": "chunk_failed", "chunk": chunk_index, "error": str(exc)[:300]}, ensure_ascii=False), file=sys.stderr)
        print(json.dumps({"phase": "download_progress", "chunk": chunk_index, "chunks": total_chunks, "rows": len(rows)}, ensure_ascii=False), file=sys.stderr)

    rows.sort(key=lambda item: (item["distance_to_target_pct"], -item["latest_close"]))
    top = rows[:args.top]
    for index, item in enumerate(top, 1):
        item["rank"] = index

    result = {
        "ok": bool(top),
        "source": "FinanceDataReader KRX listing + yfinance grouped downloads",
        "method": f"Before the last {args.recent_days} days, all closes stayed below {args.target}; latest close is within +/-{args.near_pct * 100:.1f}% of {args.target}.",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "out_dir": str(out_dir),
        "target_price": round(args.target, 2),
        "recent_days": args.recent_days,
        "near_pct": args.near_pct,
        "universe_count": len(tickers),
        "ranked_count": len(rows),
        "failed_chunks": failed_chunks,
        "top": top,
    }
    (out_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
