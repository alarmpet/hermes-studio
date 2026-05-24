from __future__ import annotations

from pathlib import Path
import argparse
import csv
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backtest_system.backtest_runner import run_backtest
from backtest_system.bybit_linear import LinearMarketSpec, load_linear_bars
from backtest_system.metrics import analyze_loss_streaks
from backtest_system.models import BacktestConfig, BacktestReport
from backtest_system.pattern_agents import SimpleTrendBreakoutAgent
from backtest_system.report import export_backtest_report
from backtest_system.signals import SignalOrchestrator


def _run_case(
    bars,
    *,
    lookback: int,
    breakout_pct: float,
    volume_ratio: float,
    exit_bars: int,
) -> BacktestReport:
    orchestrator = SignalOrchestrator(
        agents=[
            SimpleTrendBreakoutAgent(
                lookback=lookback,
                min_breakout_pct=breakout_pct,
                min_volume_ratio=volume_ratio,
                volume_window=max(lookback, 20),
            ),
        ]
    )
    return run_backtest(
        data={"BTCUSDT": bars},
        config=BacktestConfig(
            initial_cash=10_000.0,
            fee_rate=0.00055,
            cooldown_bars=1,
            timeframe_minutes=60,
            min_confidence=0.58,
            position_size=1.0,
            signal_exit_after_bars=exit_bars,
        ),
        signal_fn=orchestrator.generate,
    )


def _row(case_id: str, report: BacktestReport, lookback: int, breakout_pct: float, volume_ratio: float, exit_bars: int) -> dict:
    summary = report.summary
    return {
        "case_id": case_id,
        "lookback": lookback,
        "breakout_pct": breakout_pct,
        "volume_ratio": volume_ratio,
        "exit_bars": exit_bars,
        "ending_equity": round(summary.ending_equity, 6),
        "total_pnl": round(summary.total_pnl, 6),
        "total_return": round(summary.total_return, 6),
        "max_drawdown": round(summary.max_drawdown, 6),
        "trade_count": summary.trade_count,
        "win_rate": round(summary.win_rate, 6),
        "sharpe_ratio": round(summary.sharpe_ratio, 6),
        "sortino_ratio": round(summary.sortino_ratio, 6),
        "calmar_ratio": round(summary.calmar_ratio, 6),
    }


def _write_sensitivity_csv(rows: list[dict], path: Path) -> None:
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def _suggestions(loss_windows: list[dict], baseline: dict) -> list[str]:
    suggestions: list[str] = []
    if baseline["max_drawdown"] > 0.45:
        suggestions.append("Add a stop-loss candidate: 1.0%-1.5% from entry or a recent 5-bar swing break.")
    if baseline["trade_count"] >= 40:
        suggestions.append("Reduce weak breakouts: raise `min_breakout_pct` toward 0.15%-0.30%.")
    if loss_windows and any(window["avg_bars_held"] >= 3 for window in loss_windows):
        suggestions.append("Tighten the time exit: test `exit_bars=2` or a break-even stop after 1 bar.")
    if loss_windows and any(window["long_trades"] > window["short_trades"] for window in loss_windows):
        suggestions.append("Filter overheated longs: cap the prior 3-bar run-up or skip the first post-volume-spike chase.")
    suggestions.append("Add a session filter after checking loss concentration by hour.")
    return suggestions


def _analysis_markdown(
    baseline_report: BacktestReport,
    baseline_row: dict,
    top_rows: list[dict],
    worst_rows: list[dict],
    loss_windows: list[dict],
) -> str:
    lines = [
        "# Trend Breakout Sensitivity",
        "",
        "## Baseline",
        f"- Lookback: {baseline_row['lookback']}",
        f"- Breakout pct: {baseline_row['breakout_pct']:.4f}",
        f"- Volume ratio: {baseline_row['volume_ratio']:.2f}",
        f"- Exit bars: {baseline_row['exit_bars']}",
        f"- Total return: {baseline_row['total_return']:.2%}",
        f"- Max drawdown: {baseline_row['max_drawdown']:.2%}",
        f"- Sharpe / Sortino / Calmar: {baseline_row['sharpe_ratio']:.3f} / {baseline_row['sortino_ratio']:.3f} / {baseline_row['calmar_ratio']:.3f}",
        "",
        "## Top Cases",
    ]
    for row in top_rows:
        lines.append(
            f"- {row['case_id']}: lb={row['lookback']}, brk={row['breakout_pct']:.4f}, vol={row['volume_ratio']:.2f}, exit={row['exit_bars']}, return={row['total_return']:.2%}, MDD={row['max_drawdown']:.2%}, Sharpe={row['sharpe_ratio']:.3f}"
        )
    lines.extend(["", "## Worst Cases"])
    for row in worst_rows:
        lines.append(
            f"- {row['case_id']}: lb={row['lookback']}, brk={row['breakout_pct']:.4f}, vol={row['volume_ratio']:.2f}, exit={row['exit_bars']}, return={row['total_return']:.2%}, MDD={row['max_drawdown']:.2%}, Sharpe={row['sharpe_ratio']:.3f}"
        )
    lines.extend(["", "## Worst Loss Windows"])
    for window in loss_windows:
        lines.append(
            f"- {window['start_ts']} ~ {window['end_ts']}: {window['trade_count']} trades, net={window['total_net_pnl']:.2f}, long={window['long_trades']}, short={window['short_trades']}, avg_hold={window['avg_bars_held']:.2f}, reasons={','.join(window['reasons'])}"
        )
    lines.extend(["", "## Candidate Rules"])
    for text in _suggestions(loss_windows, baseline_row):
        lines.append(f"- {text}")
    lines.append("")
    return "\n".join(lines)


def main(csv_path: str, output_dir: str) -> dict[str, Path]:
    out_dir = Path(output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    bars = load_linear_bars(LinearMarketSpec(symbol="BTCUSDT", csv_path=csv_path))
    cases: list[dict] = []
    reports: dict[str, BacktestReport] = {}
    case_index = 1
    for lookback in (10, 20, 30):
        for breakout_pct in (0.0, 0.0015, 0.003):
            for exit_bars in (2, 3, 4):
                case_id = f"case_{case_index:02d}"
                report = _run_case(
                    bars,
                    lookback=lookback,
                    breakout_pct=breakout_pct,
                    volume_ratio=0.8,
                    exit_bars=exit_bars,
                )
                reports[case_id] = report
                cases.append(_row(case_id, report, lookback, breakout_pct, 0.8, exit_bars))
                case_index += 1

    baseline_row = next(row for row in cases if row["lookback"] == 20 and row["breakout_pct"] == 0.0 and row["exit_bars"] == 3)
    baseline_report = reports[baseline_row["case_id"]]
    top_rows = sorted(cases, key=lambda row: (row["total_return"], -row["max_drawdown"], row["sharpe_ratio"]), reverse=True)[:5]
    worst_rows = sorted(cases, key=lambda row: (row["total_return"], -row["max_drawdown"]))[:5]
    loss_windows = analyze_loss_streaks(baseline_report.trades, top_n=3)

    sensitivity_csv = out_dir / "sensitivity.csv"
    _write_sensitivity_csv(cases, sensitivity_csv)

    summary_json = out_dir / "sensitivity_summary.json"
    summary_json.write_text(
        json.dumps(
            {
                "baseline": baseline_row,
                "top_cases": top_rows,
                "worst_cases": worst_rows,
                "loss_windows": loss_windows,
                "case_count": len(cases),
            },
            ensure_ascii=True,
            indent=2,
        ),
        encoding="utf-8",
    )

    report_paths = export_backtest_report(baseline_report, out_dir / "baseline_report")
    analysis_md = out_dir / "analysis.md"
    analysis_md.write_text(
        _analysis_markdown(baseline_report, baseline_row, top_rows, worst_rows, loss_windows),
        encoding="utf-8",
    )
    return {
        "analysis_md": analysis_md,
        "sensitivity_csv": sensitivity_csv,
        "summary_json": summary_json,
        "baseline_markdown": report_paths["markdown"],
        "baseline_trades_csv": report_paths["trades_csv"],
        "baseline_equity_csv": report_paths["equity_csv"],
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run bounded sensitivity analysis for the simple trend breakout strategy")
    parser.add_argument("--csv-path", default="outputs/bybit_linear_trend_backtest_1000/BTCUSDT_linear_60m_1000.csv")
    parser.add_argument("--output-dir", default="outputs/bybit_linear_trend_backtest_1000_sensitivity")
    args = parser.parse_args()

    paths = main(args.csv_path, args.output_dir)
    for key, value in paths.items():
        print(f"{key}: {value}")
