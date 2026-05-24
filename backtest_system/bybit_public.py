from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List
import csv
import json
from urllib.parse import urlencode
from urllib.request import urlopen


BYBIT_MAINNET_BASE_URL = "https://api.bybit.com"


@dataclass
class BybitKlineFetchSpec:
    symbol: str = "BTCUSDT"
    category: str = "linear"
    interval: str = "60"
    limit: int = 100
    end: int | None = None
    base_url: str = BYBIT_MAINNET_BASE_URL


def fetch_market_klines(spec: BybitKlineFetchSpec) -> list[list[str]]:
    params = {
        "category": spec.category,
        "symbol": spec.symbol,
        "interval": spec.interval,
        "limit": spec.limit,
    }
    if spec.end is not None:
        params["end"] = spec.end
    query = urlencode(params)
    url = f"{spec.base_url}/v5/market/kline?{query}"
    with urlopen(url, timeout=20) as response:
        payload = json.loads(response.read().decode("utf-8"))
    if payload.get("retCode") != 0:
        raise RuntimeError(f"Bybit API error: {payload.get('retCode')} {payload.get('retMsg')}")
    rows = payload.get("result", {}).get("list", [])
    if not rows:
        raise ValueError("Bybit returned no kline rows")
    return rows


def fetch_market_klines_up_to(spec: BybitKlineFetchSpec) -> list[list[str]]:
    remaining = spec.limit
    if remaining <= 0:
        raise ValueError("limit must be positive")

    all_rows: list[list[str]] = []
    end = spec.end

    while remaining > 0:
        page_limit = min(remaining, 1000)
        page_rows = fetch_market_klines(
            BybitKlineFetchSpec(
                symbol=spec.symbol,
                category=spec.category,
                interval=spec.interval,
                limit=page_limit,
                end=end,
                base_url=spec.base_url,
            )
        )
        all_rows.extend(page_rows)
        remaining -= len(page_rows)
        if len(page_rows) < page_limit:
            break

        oldest_start = min(int(row[0]) for row in page_rows)
        next_end = oldest_start - 1
        if end is not None and next_end >= end:
            break
        end = next_end

    return all_rows[: spec.limit]


def kline_rows_to_csv_rows(rows: Iterable[Iterable[str]]) -> List[dict[str, str]]:
    normalized: List[dict[str, str]] = []
    for row in reversed(list(rows)):
        start_at, open_price, high_price, low_price, close_price, volume, turnover = row
        normalized.append(
            {
                "start_at": str(start_at),
                "open_price": str(open_price),
                "high_price": str(high_price),
                "low_price": str(low_price),
                "close_price": str(close_price),
                "volume": str(volume),
                "turnover": str(turnover),
            }
        )
    return normalized


def write_kline_csv(path: Path, rows: Iterable[dict[str, str]]) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "start_at",
                "open_price",
                "high_price",
                "low_price",
                "close_price",
                "volume",
                "turnover",
            ],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow(row)
    return path
