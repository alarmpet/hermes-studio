from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

from .models import (
    BacktestConfig,
    BacktestReport,
    Bar,
    EquityPoint,
    PatternSignal,
    SignalAdapterInput,
    SignalFunction,
    TradeEvent,
)
from .metrics import build_summary
from .signal_adapter import adapt_signals


@dataclass
class _OpenPosition:
    symbol: str
    side: str
    entry_ts: object
    entry_price: float
    qty: float
    entry_fee: float
    funding_paid: float = 0.0
    bars_held: int = 0


def _calc_equity(cash: float, position: Optional[_OpenPosition], price: float) -> float:
    if position is None:
        return cash
    direction = 1.0 if position.side == "LONG" else -1.0
    unrealized = (price - position.entry_price) * position.qty * direction
    return cash + unrealized


def run_backtest(
    data: Dict[str, List[Bar]],
    config: BacktestConfig,
    signal_fn: SignalFunction,
) -> BacktestReport:
    if len(data) != 1:
        raise ValueError("v1 runner supports exactly one symbol")

    symbol, bars = next(iter(data.items()))
    if not bars:
        raise ValueError("bars are required")

    cash = config.initial_cash
    equity_curve: List[EquityPoint] = []
    trades: List[TradeEvent] = []
    position: Optional[_OpenPosition] = None
    last_decision_ts = None
    history: List[Bar] = []

    for bar in bars:
        history.append(bar)

        if position is not None:
            if bar.funding_rate:
                position.funding_paid += position.entry_price * position.qty * abs(bar.funding_rate)
            position.bars_held += 1

        raw_signals: List[PatternSignal] = signal_fn(symbol, history)
        adapted = adapt_signals(
            SignalAdapterInput(
                symbol=symbol,
                history=history,
                raw_signals=raw_signals,
                current_position_side=position.side if position else None,
                last_decision_ts=last_decision_ts,
            ),
            config,
        )

        if position is None and adapted.action in {"LONG", "SHORT"}:
            entry_fee = bar.close * config.position_size * config.fee_rate
            position = _OpenPosition(
                symbol=symbol,
                side=adapted.action,
                entry_ts=bar.ts,
                entry_price=bar.close,
                qty=config.position_size,
                entry_fee=entry_fee,
            )
            last_decision_ts = bar.ts
            equity_curve.append(EquityPoint(ts=bar.ts, equity=_calc_equity(cash, position, bar.close)))
            continue

        should_exit = (
            position is not None
            and position.bars_held >= max(1, config.signal_exit_after_bars)
        )
        if should_exit and position is not None:
            direction = 1.0 if position.side == "LONG" else -1.0
            gross_pnl = (bar.close - position.entry_price) * position.qty * direction
            exit_fee = bar.close * position.qty * config.fee_rate
            fee_paid = position.entry_fee + exit_fee
            net_pnl = gross_pnl - fee_paid - position.funding_paid
            cash += net_pnl
            trades.append(
                TradeEvent(
                    symbol=symbol,
                    side=position.side,
                    entry_ts=position.entry_ts,
                    exit_ts=bar.ts,
                    entry_price=position.entry_price,
                    exit_price=bar.close,
                    qty=position.qty,
                    gross_pnl=gross_pnl,
                    fee_paid=fee_paid,
                    funding_paid=position.funding_paid,
                    net_pnl=net_pnl,
                    bars_held=position.bars_held,
                    reason="time_exit",
                )
            )
            position = None
            last_decision_ts = bar.ts

        equity_curve.append(EquityPoint(ts=bar.ts, equity=_calc_equity(cash, position, bar.close)))

    if position is not None:
        final_bar = bars[-1]
        direction = 1.0 if position.side == "LONG" else -1.0
        gross_pnl = (final_bar.close - position.entry_price) * position.qty * direction
        exit_fee = final_bar.close * position.qty * config.fee_rate
        fee_paid = position.entry_fee + exit_fee
        net_pnl = gross_pnl - fee_paid - position.funding_paid
        cash += net_pnl
        trades.append(
            TradeEvent(
                symbol=symbol,
                side=position.side,
                entry_ts=position.entry_ts,
                exit_ts=final_bar.ts,
                entry_price=position.entry_price,
                exit_price=final_bar.close,
                qty=position.qty,
                gross_pnl=gross_pnl,
                fee_paid=fee_paid,
                funding_paid=position.funding_paid,
                net_pnl=net_pnl,
                bars_held=position.bars_held,
                reason="final_bar",
            )
        )
        equity_curve[-1] = EquityPoint(ts=final_bar.ts, equity=cash)

    ending_equity = equity_curve[-1].equity if equity_curve else cash
    summary = build_summary(
        initial_cash=config.initial_cash,
        ending_equity=ending_equity,
        trades=trades,
        equity_curve=equity_curve,
        timeframe_minutes=config.timeframe_minutes,
    )
    return BacktestReport(summary=summary, trades=trades, equity_curve=equity_curve)
