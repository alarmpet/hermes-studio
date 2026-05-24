from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List
import csv

from .models import Bar


def _parse_dt(value: str) -> datetime:
    value = value.strip()
    if value.isdigit():
        raw = int(value)
        if raw >= 10**12:
            return datetime.fromtimestamp(raw / 1000, tz=timezone.utc).replace(tzinfo=None)
        if raw >= 10**9:
            return datetime.fromtimestamp(raw, tz=timezone.utc).replace(tzinfo=None)
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            pass
    raise ValueError(f"invalid datetime: {value}")


def _get_first(row: dict[str, str], *names: str, default: str | None = None) -> str | None:
    for name in names:
        value = row.get(name)
        if value not in (None, ""):
            return value
    return default


def load_csv_bars(path: str, symbol: str) -> List[Bar]:
    bars: List[Bar] = []
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"data file not found: {path}")

    with p.open("r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ts = _get_first(row, "ts", "timestamp", "open_time", "start_at", "time")
            open_price = _get_first(row, "open", "open_price")
            high_price = _get_first(row, "high", "high_price")
            low_price = _get_first(row, "low", "low_price")
            close_price = _get_first(row, "close", "close_price")
            funding_rate = _get_first(row, "funding_rate", "funding", default="0.0")
            if ts is None or open_price is None or high_price is None or low_price is None or close_price is None:
                raise KeyError(
                    "csv must include timestamp/open/high/low/close columns; "
                    "supported aliases: ts|timestamp|open_time|start_at|time and "
                    "open|open_price, high|high_price, low|low_price, close|close_price"
                )
            bars.append(
                Bar(
                    symbol=symbol,
                    ts=_parse_dt(ts),
                    open=float(open_price),
                    high=float(high_price),
                    low=float(low_price),
                    close=float(close_price),
                    volume=float(row.get("volume", 0.0)),
                    funding_rate=float(funding_rate or 0.0),
                )
            )
    bars.sort(key=lambda b: b.ts)
    return bars


def load_multi_symbol_data(
    base_path: str, symbols: List[str], ext: str = ".csv"
) -> Dict[str, List[Bar]]:
    result: Dict[str, List[Bar]] = defaultdict(list)
    base = Path(base_path)
    for symbol in symbols:
        path = base / f"{symbol}{ext}"
        result[symbol] = load_csv_bars(str(path), symbol)
    return dict(result)
