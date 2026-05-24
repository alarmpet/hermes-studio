from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import List

from .data import load_csv_bars
from .models import Bar


@dataclass
class LinearMarketSpec:
    symbol: str
    csv_path: str
    contract_size: float = 1.0
    fee_rate: float = 0.00055
    default_funding_rate: float = 0.0


def resolve_linear_csv_path(csv_path: str, symbol: str) -> str:
    path = Path(csv_path)
    if path.is_dir():
        return str(path / f"{symbol}.csv")
    return str(path)


def load_linear_bars(spec: LinearMarketSpec) -> List[Bar]:
    bars = load_csv_bars(resolve_linear_csv_path(spec.csv_path, spec.symbol), spec.symbol)
    normalized: List[Bar] = []
    for bar in bars:
        normalized.append(
            Bar(
                symbol=spec.symbol,
                ts=bar.ts,
                open=bar.open,
                high=bar.high,
                low=bar.low,
                close=bar.close,
                volume=bar.volume,
                funding_rate=bar.funding_rate if bar.funding_rate else spec.default_funding_rate,
            )
        )
    return normalized
