from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backtest_system.backtest_runner import run_backtest
from backtest_system.bybit_linear import LinearMarketSpec, load_linear_bars
from backtest_system.bybit_public import (
    BybitKlineFetchSpec,
    fetch_market_klines,
    fetch_market_klines_up_to,
    kline_rows_to_csv_rows,
    write_kline_csv,
)
from backtest_system.models import BacktestConfig
from backtest_system.pattern_agents import (
    ConservativeFilteredBreakoutAgent,
    NeutralFilteredBreakoutAgent,
    SimpleTrendBreakoutAgent,
)
from backtest_system.report import export_backtest_report
from backtest_system.signals import SignalOrchestrator


def run(symbol: str, interval: str, limit: int, output_dir: str, strategy: str = "simple_breakout") -> dict[str, Path]:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    spec = BybitKlineFetchSpec(symbol=symbol, category="linear", interval=interval, limit=limit)
    raw_rows = fetch_market_klines_up_to(spec) if limit > 1000 else fetch_market_klines(spec)
    csv_rows = kline_rows_to_csv_rows(raw_rows)

    csv_path = out_dir / f"{symbol}_linear_{interval}m_{limit}.csv"
    write_kline_csv(csv_path, csv_rows)
    (out_dir / "raw_response.json").write_text(
        json.dumps(
            {
                "symbol": symbol,
                "category": "linear",
                "interval": interval,
                "requested_limit": limit,
                "fetched_rows": len(raw_rows),
                "fetched_at_utc": datetime.now(timezone.utc).isoformat(),
                "rows": raw_rows,
            },
            ensure_ascii=True,
            indent=2,
        ),
        encoding="utf-8",
    )

    bars = load_linear_bars(LinearMarketSpec(symbol=symbol, csv_path=str(csv_path)))
    if strategy == "conservative_filter":
        agents = [ConservativeFilteredBreakoutAgent()]
    elif strategy == "neutral_filter":
        agents = [NeutralFilteredBreakoutAgent()]
    else:
        agents = [SimpleTrendBreakoutAgent(lookback=20, min_breakout_pct=0.0, min_volume_ratio=0.8)]

    orchestrator = SignalOrchestrator(agents=agents)
    report = run_backtest(
        data={symbol: bars},
        config=BacktestConfig(
            initial_cash=10_000.0,
            fee_rate=0.00055,
            cooldown_bars=1,
            timeframe_minutes=60,
            min_confidence=0.58,
            position_size=1.0,
            signal_exit_after_bars=3,
        ),
        signal_fn=orchestrator.generate,
    )
    exported = export_backtest_report(report, out_dir / "report")
    exported["kline_csv"] = csv_path
    exported["raw_json"] = out_dir / "raw_response.json"
    return exported


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fetch Bybit linear klines and run a trend-breakout backtest")
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--interval", default="60")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--output-dir", default="outputs/bybit_linear_trend_backtest")
    parser.add_argument(
        "--strategy",
        choices=["simple_breakout", "conservative_filter", "neutral_filter"],
        default="simple_breakout",
    )
    args = parser.parse_args()

    paths = run(
        symbol=args.symbol,
        interval=args.interval,
        limit=args.limit,
        output_dir=args.output_dir,
        strategy=args.strategy,
    )
    for key, value in paths.items():
        print(f"{key}: {value}")
