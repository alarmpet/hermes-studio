from __future__ import annotations

from pathlib import Path
import csv

from .models import BacktestReport


def _summary_markdown(report: BacktestReport) -> str:
    summary = report.summary
    lines = [
        "# Backtest Summary",
        "",
        f"- Initial cash: {summary.initial_cash:.2f}",
        f"- Ending equity: {summary.ending_equity:.2f}",
        f"- Total PnL: {summary.total_pnl:.2f}",
        f"- Total return: {summary.total_return:.4%}",
        f"- Max drawdown: {summary.max_drawdown:.4f}",
        f"- Trade count: {summary.trade_count}",
        f"- Win rate: {summary.win_rate:.4f}",
        f"- Long trades: {summary.long_trades}",
        f"- Short trades: {summary.short_trades}",
        f"- Sharpe ratio: {summary.sharpe_ratio:.4f}",
        f"- Sortino ratio: {summary.sortino_ratio:.4f}",
        f"- Calmar ratio: {summary.calmar_ratio:.4f}",
    ]
    return "\n".join(lines) + "\n"


def export_backtest_report(report: BacktestReport, output_dir: Path) -> dict[str, Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    markdown_path = output_dir / "summary.md"
    trades_csv = output_dir / "trades.csv"
    equity_csv = output_dir / "equity_curve.csv"

    markdown_path.write_text(_summary_markdown(report), encoding="utf-8")

    with trades_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "symbol",
                "side",
                "entry_ts",
                "exit_ts",
                "entry_price",
                "exit_price",
                "qty",
                "gross_pnl",
                "fee_paid",
                "funding_paid",
                "net_pnl",
                "bars_held",
                "reason",
            ]
        )
        for trade in report.trades:
            writer.writerow(
                [
                    trade.symbol,
                    trade.side,
                    trade.entry_ts.isoformat(),
                    trade.exit_ts.isoformat(),
                    trade.entry_price,
                    trade.exit_price,
                    trade.qty,
                    trade.gross_pnl,
                    trade.fee_paid,
                    trade.funding_paid,
                    trade.net_pnl,
                    trade.bars_held,
                    trade.reason,
                ]
            )

    with equity_csv.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["ts", "equity"])
        for point in report.equity_curve:
            writer.writerow([point.ts.isoformat(), point.equity])

    return {
        "markdown": markdown_path,
        "trades_csv": trades_csv,
        "equity_csv": equity_csv,
    }
