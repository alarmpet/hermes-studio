from __future__ import annotations

from math import sqrt
from statistics import mean, pstdev
from typing import List

from .models import BacktestSummary, EquityPoint, TradeEvent


def _max_drawdown(initial_cash: float, equity_curve: List[EquityPoint]) -> float:
    peak = initial_cash
    max_drawdown = 0.0
    for point in equity_curve:
        peak = max(peak, point.equity)
        if peak > 0:
            max_drawdown = max(max_drawdown, (peak - point.equity) / peak)
    return max_drawdown


def _period_returns(equity_curve: List[EquityPoint]) -> List[float]:
    returns: List[float] = []
    for prev, current in zip(equity_curve, equity_curve[1:]):
        if prev.equity <= 0:
            continue
        returns.append((current.equity / prev.equity) - 1.0)
    return returns


def _annualization_factor(timeframe_minutes: int) -> float:
    periods_per_year = (60 / max(timeframe_minutes, 1)) * 24 * 365
    return sqrt(periods_per_year)


def _sharpe_ratio(returns: List[float], timeframe_minutes: int) -> float:
    if len(returns) < 2:
        return 0.0
    volatility = pstdev(returns)
    if volatility == 0:
        return 0.0
    return (mean(returns) / volatility) * _annualization_factor(timeframe_minutes)


def _sortino_ratio(returns: List[float], timeframe_minutes: int) -> float:
    downside = [ret for ret in returns if ret < 0]
    if len(downside) < 2:
        return 0.0
    downside_deviation = pstdev(downside)
    if downside_deviation == 0:
        return 0.0
    return (mean(returns) / downside_deviation) * _annualization_factor(timeframe_minutes)


def _calmar_ratio(
    initial_cash: float,
    ending_equity: float,
    max_drawdown: float,
    periods: int,
    timeframe_minutes: int,
) -> float:
    if max_drawdown <= 0 or periods <= 0 or initial_cash <= 0 or ending_equity <= 0:
        return 0.0
    periods_per_year = (60 / max(timeframe_minutes, 1)) * 24 * 365
    annualized_return = (ending_equity / initial_cash) ** (periods_per_year / periods) - 1.0
    return annualized_return / max_drawdown


def build_summary(
    initial_cash: float,
    ending_equity: float,
    trades: List[TradeEvent],
    equity_curve: List[EquityPoint],
    timeframe_minutes: int,
) -> BacktestSummary:
    max_drawdown = _max_drawdown(initial_cash, equity_curve)
    wins = sum(1 for trade in trades if trade.net_pnl > 0)
    long_trades = sum(1 for trade in trades if trade.side == "LONG")
    short_trades = sum(1 for trade in trades if trade.side == "SHORT")
    total_return = ((ending_equity / initial_cash) - 1.0) if initial_cash > 0 else 0.0
    returns = _period_returns(equity_curve)

    return BacktestSummary(
        initial_cash=initial_cash,
        ending_equity=ending_equity,
        total_pnl=ending_equity - initial_cash,
        total_return=total_return,
        max_drawdown=max_drawdown,
        trade_count=len(trades),
        win_rate=(wins / len(trades)) if trades else 0.0,
        long_trades=long_trades,
        short_trades=short_trades,
        sharpe_ratio=_sharpe_ratio(returns, timeframe_minutes),
        sortino_ratio=_sortino_ratio(returns, timeframe_minutes),
        calmar_ratio=_calmar_ratio(
            initial_cash=initial_cash,
            ending_equity=ending_equity,
            max_drawdown=max_drawdown,
            periods=max(len(returns), 1),
            timeframe_minutes=timeframe_minutes,
        ),
    )


def analyze_loss_streaks(trades: List[TradeEvent], top_n: int = 3) -> List[dict]:
    streaks: List[dict] = []
    current: List[TradeEvent] = []

    def flush() -> None:
        if not current:
            return
        streaks.append(
            {
                "start_ts": current[0].entry_ts.isoformat(),
                "end_ts": current[-1].exit_ts.isoformat(),
                "trade_count": len(current),
                "long_trades": sum(1 for trade in current if trade.side == "LONG"),
                "short_trades": sum(1 for trade in current if trade.side == "SHORT"),
                "total_net_pnl": sum(trade.net_pnl for trade in current),
                "avg_bars_held": sum(trade.bars_held for trade in current) / len(current),
                "reasons": sorted({trade.reason for trade in current}),
            }
        )
        current.clear()

    for trade in trades:
        if trade.net_pnl < 0:
            current.append(trade)
        else:
            flush()
    flush()

    streaks.sort(key=lambda item: item["total_net_pnl"])
    return streaks[:top_n]
