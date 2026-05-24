from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class ExchangeConfig:
    symbol_universe: List[str]
    linear: bool = True
    maker_fee: float = 0.0002
    taker_fee: float = 0.00055
    funding_enabled: bool = True
    initial_margin_rate: float = 0.1


@dataclass
class StrategyConfig:
    name: str = "multi_agent_pattern"
    min_confidence: float = 0.58
    max_position_per_symbol_pct: float = 0.35
    max_gross_exposure_pct: float = 0.9
    target_leverage: float = 10.0
    stop_atr_pct: float = 0.025
    take_profit_rr: float = 2.0
    max_drawdown_daily: float = 0.08
    cooldown_bars: int = 3


@dataclass
class BacktestConfig:
    exchange: ExchangeConfig
    strategy: StrategyConfig
    data_path: str = "data"
    initial_equity: float = 10_000.0
    contract_size: float = 1.0
    allow_short: bool = True
    allow_long: bool = True
