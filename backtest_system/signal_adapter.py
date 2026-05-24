from __future__ import annotations

from datetime import timedelta

from .models import BacktestConfig, SignalAdapterInput, SignalAdapterOutput
from .signals import resolve_signals


def adapt_signals(data: SignalAdapterInput, config: BacktestConfig) -> SignalAdapterOutput:
    reasons: list[str] = []
    chosen, _ = resolve_signals(data.raw_signals)

    if chosen is None:
        if data.raw_signals:
            reasons.append("conflict")
        return SignalAdapterOutput(
            action="HOLD",
            chosen_signal=None,
            raw_signals=data.raw_signals,
            reasons=reasons or ["no_signal"],
        )

    if chosen.confidence < config.min_confidence:
        reasons.append("below_confidence")
        return SignalAdapterOutput("HOLD", None, data.raw_signals, reasons)

    if data.current_position_side == chosen.side:
        reasons.append("same_side_position")
        return SignalAdapterOutput("HOLD", None, data.raw_signals, reasons)

    if data.last_decision_ts is not None:
        cooldown = timedelta(minutes=config.cooldown_bars * config.timeframe_minutes)
        current_ts = data.history[-1].ts if data.history else data.last_decision_ts
        if current_ts - data.last_decision_ts < cooldown:
            reasons.append("cooldown")
            return SignalAdapterOutput("HOLD", None, data.raw_signals, reasons)

    return SignalAdapterOutput(
        action=chosen.side,
        chosen_signal=chosen,
        raw_signals=data.raw_signals,
        reasons=["accepted"],
    )
