from __future__ import annotations

from pathlib import Path
import argparse
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backtest_system.trade_analysis import export_trade_analysis


def main() -> None:
    parser = argparse.ArgumentParser(description="Enrich backtest trades.csv and build regime comparison tables.")
    parser.add_argument("--report-dir", required=True, help="Path to the backtest report directory containing trades.csv")
    parser.add_argument("--market-csv", help="Optional path to the source market CSV used for the backtest")
    args = parser.parse_args()

    paths = export_trade_analysis(report_dir=args.report_dir, market_csv_path=args.market_csv)
    for key, value in paths.items():
        print(f"{key}: {value}")


if __name__ == "__main__":
    main()
