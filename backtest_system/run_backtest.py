from __future__ import annotations

from pathlib import Path

from .backtest_runner import run_backtest
from .bybit_linear import LinearMarketSpec, load_linear_bars, resolve_linear_csv_path
from .models import BacktestConfig
from .pattern_agents import MeanReversionAgent, TrendBreakoutAgent
from .signals import SignalOrchestrator
from .report import export_backtest_report


def main(
    csv_path: str,
    symbol: str = "BTCUSDT",
    output_dir: str = "artifacts/backtest",
) -> dict[str, Path]:
    resolved_csv_path = resolve_linear_csv_path(csv_path, symbol)
    bars = load_linear_bars(LinearMarketSpec(symbol=symbol, csv_path=resolved_csv_path))
    orchestrator = SignalOrchestrator(
        agents=[
            TrendBreakoutAgent(),
            MeanReversionAgent(),
        ]
    )
    report = run_backtest(
        data={symbol: bars},
        config=BacktestConfig(),
        signal_fn=orchestrator.generate,
    )
    return export_backtest_report(report, Path(output_dir))


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run Hermes Bybit 1h backtest")
    parser.add_argument("csv_path")
    parser.add_argument("--symbol", default="BTCUSDT")
    parser.add_argument("--output-dir", default="artifacts/backtest")
    args = parser.parse_args()
    paths = main(args.csv_path, symbol=args.symbol, output_dir=args.output_dir)
    for key, value in paths.items():
        print(f"{key}: {value}")
