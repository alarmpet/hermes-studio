from __future__ import annotations

from dataclasses import dataclass


@dataclass
class RiskDecision:
    allowed: bool
    reasons: list[str]
    size_scale: float


class RiskManager:
    def __init__(self, strategy):
        self.strategy = strategy
        self._cooldown = {}
        self._drawdown_hit = False

    def can_enter(self, symbol: str, equity: float, prev_equity: float, idx: int, signal) -> RiskDecision:
        reasons: list[str] = []

        if self._drawdown_hit:
            reasons.append("daily drawdown protection")
            return RiskDecision(False, reasons, 0.0)

        if prev_equity > 0 and equity < prev_equity * (1.0 - self.strategy.max_drawdown_daily):
            self._drawdown_hit = True
            reasons.append("daily drawdown exceeded")
            return RiskDecision(False, reasons, 0.0)

        cooldown = self._cooldown.get(symbol, -999)
        if idx - cooldown < self.strategy.cooldown_bars:
            reasons.append("cooldown")
            return RiskDecision(False, reasons, 0.0)

        return RiskDecision(True, reasons, 1.0)

    def mark_cooldown(self, symbol: str, idx: int):
        self._cooldown[symbol] = idx
