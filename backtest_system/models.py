from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Callable, Dict, List, Optional


@dataclass
class Bar:
    symbol: str
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    funding_rate: float = 0.0


@dataclass
class PatternSignal:
    symbol: str
    ts: datetime
    name: str
    side: str  # LONG, SHORT
    confidence: float
    strength: float
    payload: Dict
    tags: List[str]

    def to_dict(self) -> Dict:
        return {
            "symbol": self.symbol,
            "ts": self.ts.isoformat(),
            "name": self.name,
            "side": self.side,
            "confidence": self.confidence,
            "strength": self.strength,
            "payload": self.payload,
            "tags": self.tags,
        }


@dataclass
class Position:
    symbol: str
    qty: float
    avg_price: float
    leverage: float
    margin: float
    opened_ts: datetime
    unrealized_pnl: float = 0.0


@dataclass
class ExecutionOrder:
    symbol: str
    side: str
    qty: float
    price: float
    ts: datetime
    reason: str


@dataclass
class PortfolioState:
    cash: float
    equity: float
    used_margin: float
    positions: Dict[str, Position]
    equity_curve: List[float]
    order_log: List[ExecutionOrder]


@dataclass
class SignalAdapterInput:
    symbol: str
    history: List[Bar]
    raw_signals: List[PatternSignal]
    current_position_side: Optional[str] = None
    last_decision_ts: Optional[datetime] = None


@dataclass
class SignalAdapterOutput:
    action: str  # LONG, SHORT, HOLD
    chosen_signal: Optional[PatternSignal]
    raw_signals: List[PatternSignal]
    reasons: List[str]


@dataclass
class BacktestConfig:
    initial_cash: float = 10000.0
    fee_rate: float = 0.00055
    cooldown_bars: int = 3
    timeframe_minutes: int = 60
    min_confidence: float = 0.75
    funding_rate_interval_hours: int = 8
    position_size: float = 1.0
    allow_flip: bool = False
    signal_exit_after_bars: int = 2


@dataclass
class TradeEvent:
    symbol: str
    side: str
    entry_ts: datetime
    exit_ts: datetime
    entry_price: float
    exit_price: float
    qty: float
    gross_pnl: float
    fee_paid: float
    funding_paid: float
    net_pnl: float
    bars_held: int
    reason: str


@dataclass
class EquityPoint:
    ts: datetime
    equity: float


@dataclass
class BacktestSummary:
    initial_cash: float
    ending_equity: float
    total_pnl: float
    total_return: float
    max_drawdown: float
    trade_count: int
    win_rate: float
    long_trades: int
    short_trades: int
    sharpe_ratio: float
    sortino_ratio: float
    calmar_ratio: float


@dataclass
class BacktestReport:
    summary: BacktestSummary
    trades: List[TradeEvent]
    equity_curve: List[EquityPoint]


SignalFunction = Callable[[str, List[Bar]], List[PatternSignal]]
