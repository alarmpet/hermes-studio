from __future__ import annotations

from collections import defaultdict
from typing import Dict, List, Tuple

from .models import Bar, PatternSignal


class SignalOrchestrator:
    def __init__(self, agents):
        self.agents = agents

    def generate(self, symbol: str, history: List[Bar]) -> List[PatternSignal]:
        signals = []
        for agent in self.agents:
            sig = agent.evaluate(symbol, history)
            if sig is not None:
                signals.append(sig)
        return signals


def resolve_signals(raw: List[PatternSignal]) -> Tuple[PatternSignal | None, List[PatternSignal]]:
    """
    규칙:
    1) 동일 종목 동일 방향 우선
    2) 신호 합의(강한 confidence 상위 2개가 동일 방향)
    3) 최고 confidence 단일 신호 fallback
    """
    if not raw:
        return None, []
    by_side = defaultdict(list)
    for s in raw:
        by_side[s.side].append(s)

    top_by_side = {}
    for side, signals in by_side.items():
        signals.sort(key=lambda s: (s.confidence, s.strength), reverse=True)
        top_by_side[side] = signals[0]

    if len(top_by_side) == 2:
        if raw[0].confidence >= 0.82 and raw[1].confidence >= 0.82:
            return None, raw
        return (top_by_side["LONG"] if top_by_side["LONG"].confidence > top_by_side["SHORT"].confidence else top_by_side["SHORT"]), raw

    # one-direction only
    chosen = list(top_by_side.values())[0]
    return chosen, raw
