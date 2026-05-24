import argparse
import json
import re
from datetime import date, datetime, timedelta
from pathlib import Path

import matplotlib.pyplot as plt
import mplfinance as mpf
import pandas as pd
import yfinance as yf

try:
    import FinanceDataReader as fdr
except Exception:
    fdr = None

_MARKET_CACHE = None


def market_suffix(market: str) -> str:
    market = (market or "").upper()
    if market in {"KOSDAQ", "KONEX"}:
        return ".KQ"
    return ".KS"


def infer_market(code: str, fallback: str = "KOSPI") -> str:
    global _MARKET_CACHE
    if _MARKET_CACHE is None:
        _MARKET_CACHE = {}
        if fdr is not None:
            try:
                listing = fdr.StockListing("KRX")
                for _, row in listing.iterrows():
                    symbol = str(row.get("Code") or row.get("Symbol") or "").zfill(6)
                    market = str(row.get("Market") or "").upper()
                    if symbol:
                        _MARKET_CACHE[symbol] = market
            except Exception:
                _MARKET_CACHE = {}
    return _MARKET_CACHE.get(str(code).zfill(6), fallback)


def safe_name(name: str) -> str:
    return re.sub(r"[^0-9A-Za-z가-힣._-]+", "_", name).strip("_") or "chart"


def normalize_ohlcv(data: pd.DataFrame) -> pd.DataFrame:
    if isinstance(data.columns, pd.MultiIndex):
        data.columns = data.columns.get_level_values(0)
    rename = {column: str(column).title() for column in data.columns}
    data = data.rename(columns=rename)
    required = ["Open", "High", "Low", "Close"]
    if not all(column in data.columns for column in required):
        return pd.DataFrame()
    columns = required + (["Volume"] if "Volume" in data.columns else [])
    return data[columns].dropna(subset=required)


def parse_price_range(text: str) -> tuple[float | None, float | None]:
    raw = re.sub(r"[*`,]", "", text or "")
    nums = re.findall(r"([0-9]+(?:\.[0-9]+)?)\s*(만)?", raw)
    values = []
    for number, man in nums:
        value = float(number)
        if man:
            value *= 10000
        values.append(value)
    if len(values) >= 2:
        return values[0], values[1]
    if len(values) == 1:
        value = values[0]
        return value * 0.95, value * 1.05
    return None, None


def parse_window(text: str) -> tuple[datetime | None, datetime | None]:
    raw = text or ""
    matches = re.findall(r"2026년\s*([0-9]{1,2})월\s*(초|중순|말|초순)?", raw)
    if not matches:
        return None, None
    month = int(matches[-1][0])
    qualifier = matches[-1][1]
    if "말" in raw and len(matches) == 1:
        start_day, end_day = 20, 28
    elif "초~중순" in raw or "초-중순" in raw:
        start_day, end_day = 1, 20
    elif qualifier in {"초", "초순"}:
        start_day, end_day = 1, 10
    elif qualifier == "중순":
        start_day, end_day = 10, 20
    elif qualifier == "말":
        start_day, end_day = 20, 28
    else:
        start_day, end_day = 1, 28

    if "~" in raw and len(matches) >= 2:
        first_month = int(matches[0][0])
        second_month = int(matches[-1][0])
        start = datetime(2026, first_month, 20 if "말" in raw.split("~", 1)[0] else 1)
        end = datetime(2026, second_month, 10 if "초" in raw.split("~", 1)[-1] else 28)
        return start, end

    return datetime(2026, month, start_day), datetime(2026, month, end_day)


def generate_chart(spec: dict, out_dir: Path) -> dict:
    name = spec["name"]
    code = spec["code"]
    market = spec.get("market") or infer_market(code)
    ticker = f"{code}{market_suffix(market)}"
    end = date.today()
    start = end - timedelta(days=365 * 3 + 30)
    data = yf.download(
        ticker,
        start=start.isoformat(),
        end=(end + timedelta(days=1)).isoformat(),
        progress=False,
        auto_adjust=False,
        threads=False,
    )
    df = normalize_ohlcv(data)
    if df.empty:
        raise RuntimeError(f"no chart data for {name} {code}")
    df = df.tail(760)

    low, high = parse_price_range(spec.get("price_range", ""))
    window_start, window_end = parse_window(" ".join([spec.get("first_point", ""), spec.get("second_point", "")]))

    try:
        plt.rcParams["font.family"] = "Malgun Gothic"
        plt.rcParams["axes.unicode_minus"] = False
    except Exception:
        pass

    style = mpf.make_mpf_style(base_mpf_style="yahoo", rc={"font.family": "Malgun Gothic"})
    fig, axes = mpf.plot(
        df,
        type="candle",
        volume="Volume" in df.columns,
        style=style,
        title=f"{name} ({code}) - Buy Timing Marked",
        ylabel="Price",
        ylabel_lower="Volume",
        figsize=(12, 8),
        tight_layout=True,
        warn_too_much_data=1000,
        returnfig=True,
    )
    ax = axes[0]
    if low and high:
        ax.axhspan(low, high, color="#2fb344", alpha=0.18)
        ax.axhline(low, color="#2fb344", linewidth=1.1, linestyle="--")
        ax.axhline(high, color="#2fb344", linewidth=1.1, linestyle="--")
        ax.text(
            0.01,
            0.94,
            f"Buy zone: {low:,.0f} ~ {high:,.0f}",
            transform=ax.transAxes,
            fontsize=10,
            color="#0b7a2a",
            bbox=dict(facecolor="white", alpha=0.78, edgecolor="#2fb344"),
        )
    if window_start and window_end:
        ax.axvspan(window_start, window_end, color="#1c7ed6", alpha=0.10)
        ax.text(
            0.01,
            0.88,
            f"Timing: {window_start:%Y-%m-%d} ~ {window_end:%Y-%m-%d}",
            transform=ax.transAxes,
            fontsize=10,
            color="#12508f",
            bbox=dict(facecolor="white", alpha=0.78, edgecolor="#1c7ed6"),
        )
    signal = spec.get("signal") or ""
    if signal:
        ax.text(
            0.01,
            0.82,
            f"Signal: {signal[:64]}",
            transform=ax.transAxes,
            fontsize=9,
            color="#333333",
            bbox=dict(facecolor="white", alpha=0.72, edgecolor="#aaaaaa"),
        )

    output = out_dir / f"{code}_{safe_name(name)}_buy_timing_marked.png"
    fig.savefig(output, dpi=150, bbox_inches="tight")
    plt.close(fig)
    return {**spec, "path": str(output), "ok": True}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--specs-json")
    parser.add_argument("--specs-file")
    parser.add_argument("--out-dir", required=True)
    args = parser.parse_args()

    if args.specs_file:
        specs = json.loads(Path(args.specs_file).read_text(encoding="utf-8"))
    elif args.specs_json:
        specs = json.loads(args.specs_json)
    else:
        raise SystemExit("--specs-json or --specs-file is required")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for spec in specs:
        try:
            results.append(generate_chart(spec, out_dir))
        except Exception as exc:
            results.append({**spec, "ok": False, "error": str(exc)})
    print(json.dumps({"ok": any(item.get("ok") for item in results), "items": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
