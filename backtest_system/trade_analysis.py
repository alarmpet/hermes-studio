from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, Iterable, List
import csv

from .data import load_csv_bars
from .models import Bar


def _parse_iso_ts(value: str) -> datetime:
    return datetime.fromisoformat(value.strip())


def _read_trade_rows(path: Path) -> List[dict[str, str]]:
    with path.open("r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _write_trade_rows(path: Path, rows: List[dict[str, str]]) -> None:
    if not rows:
        return
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def _ema(values: List[float], window: int) -> List[float]:
    if not values:
        return []
    alpha = 2.0 / (window + 1.0)
    current = values[0]
    result = [current]
    for value in values[1:]:
        current = (value * alpha) + (current * (1.0 - alpha))
        result.append(current)
    return result


def _atr(bars: List[Bar], window: int = 14) -> List[float]:
    if not bars:
        return []
    true_ranges: List[float] = []
    prev_close = bars[0].close
    for bar in bars:
        true_range = max(
            bar.high - bar.low,
            abs(bar.high - prev_close),
            abs(bar.low - prev_close),
        )
        true_ranges.append(true_range)
        prev_close = bar.close
    atr_values: List[float] = []
    running_sum = 0.0
    for index, tr in enumerate(true_ranges):
        running_sum += tr
        if index >= window:
            running_sum -= true_ranges[index - window]
        length = min(index + 1, window)
        atr_values.append(running_sum / max(length, 1))
    return atr_values


def _percentile_rank(values: Iterable[float], current: float) -> float:
    sample = [value for value in values if value > 0.0]
    if not sample:
        return 0.0
    below_or_equal = sum(1 for value in sample if value <= current)
    return below_or_equal / len(sample)


def _format_float(value: float) -> str:
    return f"{value:.6f}"


def _build_feature_map(bars: List[Bar]) -> Dict[datetime, dict[str, float | str]]:
    closes = [bar.close for bar in bars]
    ema20 = _ema(closes, 20)
    ema50 = _ema(closes, 50)
    atr14 = _atr(bars, 14)
    features: Dict[datetime, dict[str, float | str]] = {}
    for index, bar in enumerate(bars):
        prev_bars = bars[max(0, index - 20) : index]
        recent_high = max((item.high for item in prev_bars), default=bar.high)
        recent_low = min((item.low for item in prev_bars), default=bar.low)
        ema_slope = 0.0
        if index > 0 and ema20[index - 1] != 0:
            ema_slope = (ema20[index] - ema20[index - 1]) / ema20[index - 1]
        atr_pctile = _percentile_rank(atr14[max(0, index - 99) : index + 1], atr14[index])
        trend_ratio = 0.0 if ema50[index] == 0 else abs((ema20[index] / ema50[index]) - 1.0)
        features[bar.ts] = {
            "entry_ema_slope": ema_slope,
            "trend_bias": "상향" if ema20[index] >= ema50[index] else "하향",
            "ATR_pctile": atr_pctile,
            "vol_regime": "고변동" if atr_pctile >= 0.5 else "저변동",
            "market_regime": "추세" if trend_ratio >= 0.01 else "횡보",
            "recent_high": recent_high,
            "recent_low": recent_low,
        }
    return features


def enrich_trade_rows(rows: List[dict[str, str]], bars: List[Bar]) -> List[dict[str, str]]:
    features = _build_feature_map(bars)
    enriched: List[dict[str, str]] = []
    for row in rows:
        entry_ts = _parse_iso_ts(row["entry_ts"])
        feature = features.get(entry_ts)
        if feature is None:
            raise KeyError(f"entry timestamp not found in source bars: {entry_ts.isoformat()}")
        entry_price = float(row["entry_price"])
        side = row["side"].strip().upper()
        if side == "LONG":
            breakout_strength = max(0.0, (entry_price - float(feature["recent_high"])) / max(float(feature["recent_high"]), 1e-12))
        else:
            breakout_strength = max(0.0, (float(feature["recent_low"]) - entry_price) / max(float(feature["recent_low"]), 1e-12))
        net_pnl = float(row["net_pnl"])
        pnl_bucket = "수익" if net_pnl > 0 else "손실" if net_pnl < 0 else "보합"
        enriched.append(
            {
                **row,
                "entry_ema_slope": _format_float(float(feature["entry_ema_slope"])),
                "trend_bias": str(feature["trend_bias"]),
                "ATR_pctile": _format_float(float(feature["ATR_pctile"])),
                "breakout_strength": _format_float(breakout_strength),
                "vol_regime": str(feature["vol_regime"]),
                "market_regime": str(feature["market_regime"]),
                "pnl_bucket": pnl_bucket,
            }
        )
    return enriched


def build_condition_table(rows: List[dict[str, str]]) -> List[dict[str, float | int | str]]:
    grouped: dict[tuple[str, str], list[float]] = defaultdict(list)
    for row in rows:
        grouped[(row["vol_regime"], row["market_regime"])].append(float(row["net_pnl"]))

    table: List[dict[str, float | int | str]] = []
    for (vol_regime, market_regime), pnls in sorted(grouped.items()):
        trade_count = len(pnls)
        win_count = sum(1 for pnl in pnls if pnl > 0)
        loss_count = sum(1 for pnl in pnls if pnl < 0)
        avg_win = sum(pnl for pnl in pnls if pnl > 0) / win_count if win_count else 0.0
        avg_loss = sum(pnl for pnl in pnls if pnl < 0) / loss_count if loss_count else 0.0
        gross_profit = sum(pnl for pnl in pnls if pnl > 0)
        gross_loss = abs(sum(pnl for pnl in pnls if pnl < 0))
        table.append(
            {
                "vol_regime": vol_regime,
                "market_regime": market_regime,
                "trade_count": trade_count,
                "win_count": win_count,
                "loss_count": loss_count,
                "win_rate": win_count / trade_count if trade_count else 0.0,
                "expectancy": sum(pnls) / trade_count if trade_count else 0.0,
                "avg_win": avg_win,
                "avg_loss": avg_loss,
                "total_pnl": sum(pnls),
                "profit_factor": (gross_profit / gross_loss) if gross_loss > 0 else 0.0,
            }
        )
    return table


def build_pnl_bucket_table(rows: List[dict[str, str]]) -> List[dict[str, float | int | str]]:
    grouped: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    for row in rows:
        grouped[(row["pnl_bucket"], row["vol_regime"], row["market_regime"])].append(float(row["net_pnl"]))

    table: List[dict[str, float | int | str]] = []
    for (pnl_bucket, vol_regime, market_regime), pnls in sorted(grouped.items()):
        trade_count = len(pnls)
        table.append(
            {
                "pnl_bucket": pnl_bucket,
                "vol_regime": vol_regime,
                "market_regime": market_regime,
                "trade_count": trade_count,
                "avg_pnl": sum(pnls) / trade_count if trade_count else 0.0,
                "total_pnl": sum(pnls),
            }
        )
    return table


def _render_markdown_table(rows: List[dict[str, float | int | str]], columns: List[str]) -> str:
    header = "| " + " | ".join(columns) + " |"
    divider = "| " + " | ".join(["---"] * len(columns)) + " |"
    body = []
    for row in rows:
        values = []
        for column in columns:
            value = row[column]
            if isinstance(value, float):
                values.append(f"{value:.4f}")
            else:
                values.append(str(value))
        body.append("| " + " | ".join(values) + " |")
    return "\n".join([header, divider, *body]) + "\n"


def export_trade_analysis(report_dir: str, market_csv_path: str | None = None) -> dict[str, Path]:
    report_path = Path(report_dir)
    trades_path = report_path / "trades.csv"
    if market_csv_path is None:
        candidates = sorted(
            path for path in report_path.parent.glob("*.csv") if path.name != "equity_curve.csv"
        )
        market_candidates = [path for path in candidates if "_linear_" in path.name or path.name.endswith(".csv")]
        if not market_candidates:
            raise FileNotFoundError(f"market csv not found near report directory: {report_path}")
        market_csv = market_candidates[0]
    else:
        market_csv = Path(market_csv_path)

    rows = _read_trade_rows(trades_path)
    if not rows:
        raise ValueError(f"no trades found in {trades_path}")
    symbol = rows[0]["symbol"]
    bars = load_csv_bars(str(market_csv), symbol)
    enriched = enrich_trade_rows(rows, bars)
    condition_table = build_condition_table(enriched)
    pnl_bucket_table = build_pnl_bucket_table(enriched)

    _write_trade_rows(trades_path, enriched)

    condition_csv_path = report_path / "condition_comparison.csv"
    with condition_csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(condition_table[0].keys()))
        writer.writeheader()
        writer.writerows(condition_table)

    pnl_bucket_csv_path = report_path / "pnl_bucket_comparison.csv"
    with pnl_bucket_csv_path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(pnl_bucket_table[0].keys()))
        writer.writeheader()
        writer.writerows(pnl_bucket_table)

    markdown_lines = [
        "# Trade Condition Analysis",
        "",
        "## Regime Comparison",
        "",
        _render_markdown_table(
            condition_table,
            [
                "vol_regime",
                "market_regime",
                "trade_count",
                "win_count",
                "loss_count",
                "win_rate",
                "expectancy",
                "avg_win",
                "avg_loss",
                "total_pnl",
                "profit_factor",
            ],
        ).rstrip(),
        "",
        "## Profit/Loss Split",
        "",
        _render_markdown_table(
            pnl_bucket_table,
            ["pnl_bucket", "vol_regime", "market_regime", "trade_count", "avg_pnl", "total_pnl"],
        ).rstrip(),
        "",
    ]
    markdown_path = report_path / "trade_condition_analysis.md"
    markdown_path.write_text("\n".join(markdown_lines), encoding="utf-8")

    return {
        "trades_csv": trades_path,
        "market_csv": market_csv,
        "condition_csv": condition_csv_path,
        "pnl_bucket_csv": pnl_bucket_csv_path,
        "markdown": markdown_path,
    }
