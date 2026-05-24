from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Protocol

from .models import Bar, PatternSignal


class PatternAgent(Protocol):
    def name(self) -> str: ...
    def evaluate(self, symbol: str, history: List[Bar]) -> PatternSignal | None: ...


def _pct_change(series: List[float], window: int) -> float:
    if len(series) < window + 1:
        return 0.0
    prev = series[-window - 1]
    if prev == 0:
        return 0.0
    return (series[-1] - prev) / prev


def _sma(values: List[float], window: int) -> float:
    if len(values) < window:
        return 0.0
    return sum(values[-window:]) / window


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


def _atr(history: List[Bar], window: int = 14) -> List[float]:
    if not history:
        return []
    true_ranges: List[float] = []
    prev_close = history[0].close
    for bar in history:
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


def _percentile_rank(values: List[float], current: float) -> float:
    sample = [value for value in values if value > 0.0]
    if not sample:
        return 0.0
    below_or_equal = sum(1 for value in sample if value <= current)
    return below_or_equal / len(sample)


@dataclass
class TrendBreakoutAgent:
    short_window: int = 20
    long_window: int = 50
    min_volume_ratio: float = 1.15

    def name(self) -> str:
        return "trend_breakout"

    def evaluate(self, symbol: str, history: List[Bar]) -> PatternSignal | None:
        if len(history) < self.long_window + 1:
            return None
        closes = [b.close for b in history]
        vol = [b.volume for b in history]
        short_sma = _sma(closes, self.short_window)
        long_sma = _sma(closes, self.long_window)
        vma = _sma(vol, self.short_window)
        if vma <= 0:
            return None
        vol_r = history[-1].volume / vma
        if vol_r < self.min_volume_ratio:
            return None
        if short_sma > long_sma * 1.01:
            conf = min(0.9, 0.55 + 0.35 * (short_sma / max(long_sma, 1e-12 - 1)))
            return PatternSignal(
                symbol=symbol,
                ts=history[-1].ts,
                name=self.name(),
                side="LONG",
                confidence=conf,
                strength=_pct_change(closes, self.short_window),
                payload={"short_sma": short_sma, "long_sma": long_sma, "vol_ratio": vol_r},
                tags=["trend", "breakout"],
            )
        if short_sma < long_sma * 0.99:
            conf = min(0.9, 0.55 + 0.35 * (long_sma / max(short_sma, 1e-12) - 1))
            return PatternSignal(
                symbol=symbol,
                ts=history[-1].ts,
                name=self.name(),
                side="SHORT",
                confidence=conf,
                strength=abs(_pct_change(closes, self.short_window)),
                payload={"short_sma": short_sma, "long_sma": long_sma, "vol_ratio": vol_r},
                tags=["trend", "breakout"],
            )
        return None


@dataclass
class SimpleTrendBreakoutAgent:
    lookback: int = 20
    min_breakout_pct: float = 0.0
    min_volume_ratio: float = 0.8
    volume_window: int = 20

    def name(self) -> str:
        return "simple_trend_breakout"

    def evaluate(self, symbol: str, history: List[Bar]) -> PatternSignal | None:
        if len(history) < self.lookback + 1:
            return None

        current = history[-1]
        previous = history[-self.lookback - 1 : -1]
        recent_high = max(bar.high for bar in previous)
        recent_low = min(bar.low for bar in previous)
        volumes = [bar.volume for bar in history]
        volume_baseline = _sma(volumes, self.volume_window)
        if volume_baseline <= 0:
            return None

        volume_ratio = current.volume / volume_baseline
        if volume_ratio < self.min_volume_ratio:
            return None

        upside_breakout = current.close > recent_high * (1.0 + self.min_breakout_pct)
        downside_breakout = current.close < recent_low * (1.0 - self.min_breakout_pct)

        if upside_breakout:
            strength = (current.close - recent_high) / max(recent_high, 1e-12)
            confidence = min(0.95, 0.58 + strength * 40.0 + max(0.0, volume_ratio - 1.0) * 0.08)
            return PatternSignal(
                symbol=symbol,
                ts=current.ts,
                name=self.name(),
                side="LONG",
                confidence=confidence,
                strength=strength,
                payload={"recent_high": recent_high, "recent_low": recent_low, "volume_ratio": volume_ratio},
                tags=["trend", "breakout", "donchian"],
            )

        if downside_breakout:
            strength = (recent_low - current.close) / max(recent_low, 1e-12)
            confidence = min(0.95, 0.58 + strength * 40.0 + max(0.0, volume_ratio - 1.0) * 0.08)
            return PatternSignal(
                symbol=symbol,
                ts=current.ts,
                name=self.name(),
                side="SHORT",
                confidence=confidence,
                strength=strength,
                payload={"recent_high": recent_high, "recent_low": recent_low, "volume_ratio": volume_ratio},
                tags=["trend", "breakout", "donchian"],
            )

        return None


@dataclass
class ConservativeFilteredBreakoutAgent:
    lookback: int = 20
    min_breakout_pct: float = 0.0
    min_volume_ratio: float = 0.8
    volume_window: int = 20
    atr_window: int = 14
    atr_percentile_window: int = 100
    ema_short_window: int = 20
    ema_long_window: int = 50
    max_atr_pctile: float = 0.47
    max_breakout_strength: float = 0.0046
    trend_ratio_threshold: float = 0.01

    def name(self) -> str:
        return "conservative_filtered_breakout"

    def evaluate(self, symbol: str, history: List[Bar]) -> PatternSignal | None:
        min_history = max(self.lookback + 1, self.ema_long_window, self.atr_window)
        if len(history) < min_history:
            return None

        base_signal = SimpleTrendBreakoutAgent(
            lookback=self.lookback,
            min_breakout_pct=self.min_breakout_pct,
            min_volume_ratio=self.min_volume_ratio,
            volume_window=self.volume_window,
        ).evaluate(symbol, history)
        if base_signal is None:
            return None

        closes = [bar.close for bar in history]
        ema_short = _ema(closes, self.ema_short_window)
        ema_long = _ema(closes, self.ema_long_window)
        if not ema_short or not ema_long or ema_long[-1] == 0:
            return None

        atr_values = _atr(history, self.atr_window)
        atr_window_values = atr_values[-min(len(atr_values), self.atr_percentile_window) :]
        atr_pctile = _percentile_rank(atr_window_values, atr_values[-1])
        trend_ratio = abs((ema_short[-1] / ema_long[-1]) - 1.0)
        market_regime = "trending" if trend_ratio >= self.trend_ratio_threshold else "ranging"
        vol_regime = "high_vol" if atr_pctile >= 0.5 else "low_vol"

        if market_regime != "ranging" or vol_regime != "low_vol":
            return None
        if atr_pctile > self.max_atr_pctile or base_signal.strength > self.max_breakout_strength:
            return None

        return PatternSignal(
            symbol=base_signal.symbol,
            ts=base_signal.ts,
            name=self.name(),
            side=base_signal.side,
            confidence=base_signal.confidence,
            strength=base_signal.strength,
            payload={
                **base_signal.payload,
                "ATR_pctile": atr_pctile,
                "market_regime": market_regime,
                "vol_regime": vol_regime,
                "trend_ratio": trend_ratio,
            },
            tags=[*base_signal.tags, "conservative_filter"],
        )


@dataclass
class NeutralFilteredBreakoutAgent:
    lookback: int = 20
    min_breakout_pct: float = 0.0
    min_volume_ratio: float = 0.8
    volume_window: int = 20
    atr_window: int = 14
    atr_percentile_window: int = 100
    ema_short_window: int = 20
    ema_long_window: int = 50
    max_atr_pctile: float = 0.58
    max_breakout_strength: float = 0.0080
    trend_ratio_threshold: float = 0.004

    def name(self) -> str:
        return "neutral_filtered_breakout"

    def evaluate(self, symbol: str, history: List[Bar]) -> PatternSignal | None:
        min_history = max(self.lookback + 1, self.ema_long_window, self.atr_window)
        if len(history) < min_history:
            return None

        base_signal = SimpleTrendBreakoutAgent(
            lookback=self.lookback,
            min_breakout_pct=self.min_breakout_pct,
            min_volume_ratio=self.min_volume_ratio,
            volume_window=self.volume_window,
        ).evaluate(symbol, history)
        if base_signal is None:
            return None

        closes = [bar.close for bar in history]
        ema_short = _ema(closes, self.ema_short_window)
        ema_long = _ema(closes, self.ema_long_window)
        if not ema_short or not ema_long or ema_long[-1] == 0:
            return None

        atr_values = _atr(history, self.atr_window)
        atr_window_values = atr_values[-min(len(atr_values), self.atr_percentile_window) :]
        atr_pctile = _percentile_rank(atr_window_values, atr_values[-1])
        trend_ratio = abs((ema_short[-1] / ema_long[-1]) - 1.0)
        market_regime = "ranging" if trend_ratio < self.trend_ratio_threshold else "trending"
        vol_regime = "low_vol" if atr_pctile < 0.5 else "high_vol"

        if market_regime == "trending":
            return None
        if atr_pctile > self.max_atr_pctile:
            return None
        if base_signal.strength > self.max_breakout_strength:
            return None

        return PatternSignal(
            symbol=base_signal.symbol,
            ts=base_signal.ts,
            name=self.name(),
            side=base_signal.side,
            confidence=base_signal.confidence,
            strength=base_signal.strength,
            payload={
                **base_signal.payload,
                "ATR_pctile": atr_pctile,
                "market_regime": market_regime,
                "vol_regime": vol_regime,
                "trend_ratio": trend_ratio,
            },
            tags=[*base_signal.tags, "neutral_filter"],
        )

@dataclass
class MeanReversionAgent:
    lookback: int = 14

    def name(self) -> str:
        return "mean_reversion"

    def evaluate(self, symbol: str, history: List[Bar]) -> PatternSignal | None:
        if len(history) < self.lookback + 1:
            return None
        closes = [b.close for b in history]
        mean = sum(closes[-self.lookback:]) / self.lookback
        dev = closes[-1] - mean
        if abs(dev) / max(mean, 1e-12) < 0.003:
            return None
        if dev < 0:
            return PatternSignal(
                symbol=symbol,
                ts=history[-1].ts,
                name=self.name(),
                side="LONG",
                confidence=min(0.92, 0.6 + min(2.0, abs(dev) / max(mean, 1e-12) * 80)),
                strength=abs(dev / mean),
                payload={"mean": mean, "deviation": dev},
                tags=["mean_reversion"],
            )
        return PatternSignal(
            symbol=symbol,
            ts=history[-1].ts,
            name=self.name(),
            side="SHORT",
            confidence=min(0.92, 0.6 + min(2.0, (dev / max(mean, 1e-12)) * 80)),
            strength=abs(dev / mean),
            payload={"mean": mean, "deviation": dev},
            tags=["mean_reversion"],
        )

