#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass


ROOT = Path("C:/Users/amd/hermes")


def ensure_package(name: str, import_name: str | None = None):
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


def chunked(items: list, size: int):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def safe_name(value: str) -> str:
    text = re.sub(r"[^\w가-힣.-]+", "_", str(value), flags=re.UNICODE).strip("_")
    return text[:80] or "stock"


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


def ohlcv_frame(downloaded):
    import pandas as pd

    if downloaded is None or downloaded.empty:
        return pd.DataFrame()
    df = downloaded.copy()
    if isinstance(df.columns, pd.MultiIndex):
        # Single ticker downloads sometimes still return a ticker level.
        if len(set(df.columns.get_level_values(0))) == 1:
            df.columns = df.columns.get_level_values(1)
        elif len(set(df.columns.get_level_values(1))) == 1:
            df.columns = df.columns.get_level_values(0)
    wanted = [col for col in ["Open", "High", "Low", "Close", "Volume"] if col in df.columns]
    return df[wanted].dropna(subset=["Open", "High", "Low", "Close"]) if wanted else pd.DataFrame()


def first_and_last_valid(series):
    s = series.dropna()
    s = s[s > 0]
    if len(s) < 2:
        return None
    return s.index[0], float(s.iloc[0]), s.index[-1], float(s.iloc[-1])


def build_chart(ticker: str, code: str, name: str, out_dir: Path, end: date) -> str:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import mplfinance as mpf
    import yfinance as yf

    try:
        plt.rcParams["font.family"] = "Malgun Gothic"
    except Exception:
        pass
    plt.rcParams["axes.unicode_minus"] = False

    start = end - timedelta(days=365 * 3 + 30)
    data = yf.download(
        ticker,
        start=start.isoformat(),
        end=(end + timedelta(days=1)).isoformat(),
        progress=False,
        auto_adjust=False,
        threads=False,
    )
    df = ohlcv_frame(data)
    if df.empty:
        raise RuntimeError(f"no chart data for {ticker}")
    df = df.tail(760)
    title = f"{name} ({code}) - 3Y Daily"
    output = out_dir / f"{code}_{safe_name(name)}_3y_daily.png"
    style = mpf.make_mpf_style(base_mpf_style="yahoo", rc={"font.family": "Malgun Gothic"})
    mpf.plot(
        df,
        type="candle",
        volume="Volume" in df.columns,
        style=style,
        title=title,
        ylabel="Price",
        ylabel_lower="Volume",
        figsize=(10, 7),
        warn_too_much_data=1000,
        tight_layout=True,
        savefig=dict(fname=str(output), dpi=150, bbox_inches="tight"),
    )
    return str(output)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--year", type=int, default=2026)
    parser.add_argument("--out-dir", default=str(ROOT / "outputs" / f"krx-ytd-top10-{datetime.now().strftime('%Y%m%d-%H%M%S')}"))
    parser.add_argument("--chunk-size", type=int, default=120)
    parser.add_argument("--max-codes", type=int, default=0)
    args = parser.parse_args()

    ensure_package("finance-datareader", "FinanceDataReader")
    ensure_package("yfinance")
    ensure_package("mplfinance")

    import FinanceDataReader as fdr
    import pandas as pd
    import yfinance as yf

    today = date.today()
    start_date = date(args.year, 1, 1)
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
    rows = []
    failed_chunks = 0
    total_chunks = math.ceil(len(tickers) / max(1, args.chunk_size))
    print(json.dumps({"phase": "download_ytd", "tickers": len(tickers), "chunks": total_chunks}, ensure_ascii=False), file=sys.stderr)

    for chunk_index, chunk in enumerate(chunked(tickers, args.chunk_size), 1):
        try:
            data = yf.download(
                chunk,
                start=start_date.isoformat(),
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
                found = first_and_last_valid(closes[ticker])
                if not found:
                    continue
                first_dt, first_close, last_dt, last_close = found
                if first_close <= 0:
                    continue
                ytd = (last_close / first_close - 1.0) * 100.0
                info = meta[ticker]
                rows.append({
                    "rank": 0,
                    "code": info["code"],
                    "name": info["name"],
                    "market": info["market"],
                    "ticker": ticker,
                    "first_date": str(pd.Timestamp(first_dt).date()),
                    "latest_date": str(pd.Timestamp(last_dt).date()),
                    "first_close": round(first_close, 2),
                    "latest_close": round(last_close, 2),
                    "ytd_return_pct": round(ytd, 2),
                })
        except Exception as exc:
            failed_chunks += 1
            print(json.dumps({"phase": "chunk_failed", "chunk": chunk_index, "error": str(exc)[:300]}, ensure_ascii=False), file=sys.stderr)
        print(json.dumps({"phase": "download_progress", "chunk": chunk_index, "chunks": total_chunks, "rows": len(rows)}, ensure_ascii=False), file=sys.stderr)

    rows.sort(key=lambda item: item["ytd_return_pct"], reverse=True)
    top = rows[:args.top]
    for index, item in enumerate(top, 1):
        item["rank"] = index

    print(json.dumps({"phase": "charting", "count": len(top)}, ensure_ascii=False), file=sys.stderr)
    chart_errors = []
    for item in top:
        try:
            item["chart_path"] = build_chart(item["ticker"], item["code"], item["name"], out_dir, today)
        except Exception as exc:
            item["chart_error"] = str(exc)
            chart_errors.append({"code": item["code"], "name": item["name"], "error": str(exc)})

    result = {
        "ok": bool(top),
        "source": "FinanceDataReader KRX listing + yfinance grouped downloads",
        "method": "YTD return = latest close / first valid close since 2026-01-01 - 1",
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "out_dir": str(out_dir),
        "universe_count": len(tickers),
        "ranked_count": len(rows),
        "failed_chunks": failed_chunks,
        "top": top,
        "chart_errors": chart_errors,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
