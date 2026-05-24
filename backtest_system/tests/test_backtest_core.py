from __future__ import annotations

from datetime import datetime, timedelta
from pathlib import Path

from backtest_system.backtest_runner import run_backtest
from backtest_system.bybit_public import kline_rows_to_csv_rows
from backtest_system.bybit_linear import LinearMarketSpec, load_linear_bars
from backtest_system.metrics import analyze_loss_streaks
from backtest_system.models import (
    BacktestConfig,
    BacktestSummary,
    Bar,
    PatternSignal,
    SignalAdapterInput,
    TradeEvent,
)
from backtest_system.pattern_agents import (
    ConservativeFilteredBreakoutAgent,
    NeutralFilteredBreakoutAgent,
    SimpleTrendBreakoutAgent,
)
from backtest_system.report import export_backtest_report
from backtest_system.run_backtest import main
from backtest_system.signal_adapter import adapt_signals
from backtest_system.trade_analysis import build_condition_table, enrich_trade_rows
from scripts import run_bybit_linear_trend_backtest


def _bar(ts: datetime, close: float, funding_rate: float = 0.0) -> Bar:
    return Bar(
        symbol="BTCUSDT",
        ts=ts,
        open=close,
        high=close,
        low=close,
        close=close,
        volume=1000.0,
        funding_rate=funding_rate,
    )


def _signal(ts: datetime, side: str, confidence: float, name: str = "test_agent") -> PatternSignal:
    return PatternSignal(
        symbol="BTCUSDT",
        ts=ts,
        name=name,
        side=side,
        confidence=confidence,
        strength=0.5,
        payload={},
        tags=[name],
    )


def test_signal_mapping_normal_operation() -> None:
    ts = datetime(2026, 1, 1, 0, 0, 0)
    output = adapt_signals(
        SignalAdapterInput(
            symbol="BTCUSDT",
            history=[_bar(ts, 100.0)],
            raw_signals=[_signal(ts, "LONG", 0.81)],
        ),
        BacktestConfig(min_confidence=0.75),
    )

    assert output.action == "LONG"
    assert output.chosen_signal is not None
    assert output.chosen_signal.side == "LONG"


def test_conflicting_signals_are_blocked_when_both_are_strong() -> None:
    ts = datetime(2026, 1, 1, 1, 0, 0)
    output = adapt_signals(
        SignalAdapterInput(
            symbol="BTCUSDT",
            history=[_bar(ts, 100.0)],
            raw_signals=[
                _signal(ts, "LONG", 0.84, "trend"),
                _signal(ts, "SHORT", 0.86, "mean_reversion"),
            ],
        ),
        BacktestConfig(min_confidence=0.75),
    )

    assert output.action == "HOLD"
    assert output.chosen_signal is None
    assert "conflict" in output.reasons


def test_cooldown_blocks_repeat_entry() -> None:
    ts = datetime(2026, 1, 1, 2, 0, 0)
    output = adapt_signals(
        SignalAdapterInput(
            symbol="BTCUSDT",
            history=[_bar(ts, 100.0)],
            raw_signals=[_signal(ts, "LONG", 0.8)],
            last_decision_ts=ts - timedelta(hours=1),
        ),
        BacktestConfig(min_confidence=0.75, cooldown_bars=2, timeframe_minutes=60),
    )

    assert output.action == "HOLD"
    assert "cooldown" in output.reasons


def test_runner_applies_fee_and_funding_correctly() -> None:
    start = datetime(2026, 1, 1, 0, 0, 0)
    bars = [
        _bar(start, 100.0, funding_rate=0.0),
        _bar(start + timedelta(hours=1), 100.0, funding_rate=0.001),
        _bar(start + timedelta(hours=2), 110.0, funding_rate=0.0),
    ]
    config = BacktestConfig(
        initial_cash=1000.0,
        fee_rate=0.001,
        funding_rate_interval_hours=1,
        cooldown_bars=0,
        min_confidence=0.7,
        position_size=1.0,
    )

    report = run_backtest(
        data={"BTCUSDT": bars},
        config=config,
        signal_fn=lambda symbol, history: (
            [_signal(history[-1].ts, "LONG", 0.8)] if len(history) == 1 else []
        ),
    )

    trade = report.trades[0]
    assert round(trade.gross_pnl, 6) == 10.0
    assert round(trade.fee_paid, 6) == 0.21
    assert round(trade.funding_paid, 6) == 0.1
    assert round(trade.net_pnl, 6) == 9.69
    assert round(report.summary.total_pnl, 6) == round(sum(item.net_pnl for item in report.trades), 6)
    assert round(report.summary.ending_equity, 6) == 1009.69


def test_report_generation_for_single_symbol_sample(tmp_path: Path) -> None:
    start = datetime(2026, 1, 1, 0, 0, 0)
    bars = [
        _bar(start, 100.0),
        _bar(start + timedelta(hours=1), 101.0),
        _bar(start + timedelta(hours=2), 103.0),
    ]
    report = run_backtest(
        data={"BTCUSDT": bars},
        config=BacktestConfig(initial_cash=1000.0, fee_rate=0.0, cooldown_bars=0, position_size=1.0),
        signal_fn=lambda symbol, history: (
            [_signal(history[-1].ts, "LONG", 0.8)] if len(history) == 1 else []
        ),
    )

    export_dir = tmp_path / "report"
    paths = export_backtest_report(report, export_dir)

    assert isinstance(report.summary, BacktestSummary)
    assert report.summary.trade_count == 1
    assert report.summary.total_pnl > 0
    assert report.summary.total_return > 0
    assert report.summary.sharpe_ratio > 0.0
    assert report.summary.sortino_ratio == 0.0
    assert report.summary.calmar_ratio == 0.0
    assert paths["markdown"].exists()
    assert paths["trades_csv"].exists()
    assert paths["equity_csv"].exists()


def test_load_linear_bars_accepts_bybit_style_csv(tmp_path: Path) -> None:
    csv_path = tmp_path / "BTCUSDT.csv"
    csv_path.write_text(
        "\n".join(
            [
                "start_at,open_price,high_price,low_price,close_price,volume,turnover",
                "1735689600000,100,105,99,104,1234,4567",
                "1735693200000,104,106,103,105,1500,4700",
            ]
        ),
        encoding="utf-8",
    )

    bars = load_linear_bars(LinearMarketSpec(symbol="BTCUSDT", csv_path=str(csv_path)))

    assert len(bars) == 2
    assert bars[0].ts == datetime(2025, 1, 1, 0, 0, 0)
    assert bars[0].open == 100.0
    assert bars[1].close == 105.0


def test_run_backtest_main_accepts_directory_input(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    csv_path = data_dir / "BTCUSDT.csv"
    csv_path.write_text(
        "\n".join(
            [
                "start_at,open,high,low,close,volume",
                "1735689600,100,101,99,100,1000",
                "1735693200,100,102,99,101,1200",
                "1735696800,101,104,100,103,1300",
            ]
        ),
        encoding="utf-8",
    )

    paths = main(str(data_dir), symbol="BTCUSDT", output_dir=str(tmp_path / "report"))

    assert paths["markdown"].exists()
    assert paths["trades_csv"].exists()


def test_run_bybit_linear_trend_backtest_supports_neutral_filter(tmp_path: Path, monkeypatch) -> None:
    class _DummyOrchestrator:
        captured_agents = None

        def __init__(self, agents):
            self.agents = agents
            _DummyOrchestrator.captured_agents = agents

        def generate(self, symbol, history):
            return []

    monkeypatch.setattr(run_bybit_linear_trend_backtest, "fetch_market_klines_up_to", lambda spec: [["1000", "1", "1", "1", "1", "1", "1"]])
    monkeypatch.setattr(run_bybit_linear_trend_backtest, "kline_rows_to_csv_rows", lambda rows: [{"start_at": "1000", "open_price": "1", "high_price": "1", "low_price": "1", "close_price": "1", "volume": "1", "turnover": "1"}])
    monkeypatch.setattr(run_bybit_linear_trend_backtest, "write_kline_csv", lambda path, rows: path.write_text("start_at,open_price,high_price,low_price,close_price,volume,turnover\n1000,1,1,1,1,1,1\n", encoding="utf-8"))
    monkeypatch.setattr(run_bybit_linear_trend_backtest, "load_linear_bars", lambda spec: [_bar(datetime(2026, 1, 1, 0, 0, 0), 1.0)])
    monkeypatch.setattr(run_bybit_linear_trend_backtest, "SignalOrchestrator", _DummyOrchestrator)
    monkeypatch.setattr(
        run_bybit_linear_trend_backtest,
        "run_backtest",
        lambda **kwargs: type(
            "DummyReport",
            (),
            {
                "summary": BacktestSummary(
                    initial_cash=10_000.0,
                    ending_equity=10_000.0,
                    total_pnl=0.0,
                    total_return=0.0,
                    max_drawdown=0.0,
                    trade_count=0,
                    win_rate=0.0,
                    long_trades=0,
                    short_trades=0,
                    sharpe_ratio=0.0,
                    sortino_ratio=0.0,
                    calmar_ratio=0.0,
                ),
                "trades": [],
                "equity_curve": [],
            },
        )(),
    )
    monkeypatch.setattr(
        run_bybit_linear_trend_backtest,
        "export_backtest_report",
        lambda report, export_dir: {"markdown": export_dir / "summary.md", "trades_csv": export_dir / "trades.csv", "equity_csv": export_dir / "equity_curve.csv"},
    )

    run_bybit_linear_trend_backtest.run(
        symbol="BTCUSDT",
        interval="60",
        limit=2000,
        output_dir=str(tmp_path / "neutral"),
        strategy="neutral_filter",
    )

    assert _DummyOrchestrator.captured_agents is not None
    assert _DummyOrchestrator.captured_agents[0].name() == "neutral_filtered_breakout"


def test_kline_rows_to_csv_rows_reorders_oldest_first() -> None:
    rows = [
        ["2000", "11", "12", "10", "11.5", "200", "2200"],
        ["1000", "10", "11", "9", "10.5", "100", "1050"],
    ]

    normalized = kline_rows_to_csv_rows(rows)

    assert normalized[0]["start_at"] == "1000"
    assert normalized[0]["open_price"] == "10"
    assert normalized[1]["start_at"] == "2000"


def test_simple_trend_breakout_agent_emits_long_signal_on_high_break() -> None:
    start = datetime(2026, 1, 1, 0, 0, 0)
    bars = []
    for i in range(20):
        bars.append(
            Bar(
                symbol="BTCUSDT",
                ts=start + timedelta(hours=i),
                open=100 + i * 0.1,
                high=101 + i * 0.1,
                low=99 + i * 0.1,
                close=100 + i * 0.1,
                volume=1000.0,
            )
        )
    bars.append(
        Bar(
            symbol="BTCUSDT",
            ts=start + timedelta(hours=20),
            open=103.0,
            high=106.0,
            low=102.5,
            close=105.5,
            volume=1300.0,
        )
    )

    signal = SimpleTrendBreakoutAgent(lookback=20, min_breakout_pct=0.0, min_volume_ratio=0.8).evaluate("BTCUSDT", bars)

    assert signal is not None
    assert signal.side == "LONG"


def test_conservative_filtered_breakout_agent_emits_signal_only_in_sideways_low_volatility_context() -> None:
    start = datetime(2026, 1, 1, 0, 0, 0)
    bars = []
    for i in range(60):
        base = 100.0 + ((i % 6) - 3) * 0.05
        bars.append(
            Bar(
                symbol="BTCUSDT",
                ts=start + timedelta(hours=i),
                open=base - 0.05,
                high=base + 0.30,
                low=base - 0.30,
                close=base,
                volume=1000.0 + (i % 5) * 20.0,
            )
        )
    bars[-1] = Bar(
        symbol="BTCUSDT",
        ts=bars[-1].ts,
        open=100.34,
        high=100.46,
        low=100.06,
        close=100.41,
        volume=1100.0,
    )

    signal = ConservativeFilteredBreakoutAgent().evaluate("BTCUSDT", bars)

    assert signal is not None
    assert signal.side == "LONG"
    assert signal.payload["market_regime"] == "횡보"
    assert signal.payload["vol_regime"] == "저변동"


def test_conservative_filtered_breakout_agent_blocks_overextended_breakout() -> None:
    start = datetime(2026, 1, 1, 0, 0, 0)
    bars = []
    for i in range(60):
        base = 100.0 + ((i % 6) - 3) * 0.05
        bars.append(
            Bar(
                symbol="BTCUSDT",
                ts=start + timedelta(hours=i),
                open=base - 0.05,
                high=base + 0.30,
                low=base - 0.30,
                close=base,
                volume=1000.0 + (i % 5) * 20.0,
            )
        )
    bars[-1] = Bar(
        symbol="BTCUSDT",
        ts=bars[-1].ts,
        open=100.3,
        high=101.2,
        low=100.2,
        close=100.95,
        volume=1150.0,
    )

    signal = ConservativeFilteredBreakoutAgent(max_breakout_strength=0.0046).evaluate("BTCUSDT", bars)

    assert signal is None


def test_neutral_filtered_breakout_agent_allows_moderate_sideways_breakout() -> None:
    start = datetime(2026, 1, 1, 0, 0, 0)
    bars = []
    for i in range(60):
        base = 100.0 + ((i % 6) - 3) * 0.08
        bars.append(
            Bar(
                symbol="BTCUSDT",
                ts=start + timedelta(hours=i),
                open=base - 0.08,
                high=base + 0.35,
                low=base - 0.35,
                close=base,
                volume=1000.0 + (i % 5) * 25.0,
            )
        )
    bars[-1] = Bar(
        symbol="BTCUSDT",
        ts=bars[-1].ts,
        open=100.25,
        high=100.70,
        low=100.10,
        close=100.62,
        volume=1120.0,
    )

    signal = NeutralFilteredBreakoutAgent().evaluate("BTCUSDT", bars)

    assert signal is not None
    assert signal.side == "LONG"


def test_summary_includes_risk_adjusted_metrics() -> None:
    start = datetime(2026, 1, 1, 0, 0, 0)
    bars = [
        _bar(start, 100.0),
        _bar(start + timedelta(hours=1), 103.0),
        _bar(start + timedelta(hours=2), 106.0),
        _bar(start + timedelta(hours=3), 109.0),
    ]

    report = run_backtest(
        data={"BTCUSDT": bars},
        config=BacktestConfig(initial_cash=1000.0, fee_rate=0.0, cooldown_bars=0, position_size=1.0, signal_exit_after_bars=3),
        signal_fn=lambda symbol, history: (
            [_signal(history[-1].ts, "LONG", 0.8)] if len(history) == 1 else []
        ),
    )

    assert round(report.summary.total_return, 6) == 0.009
    assert report.summary.sharpe_ratio > 0.0
    assert report.summary.sortino_ratio == 0.0
    assert report.summary.calmar_ratio == 0.0


def test_analyze_loss_streaks_returns_worst_windows() -> None:
    start = datetime(2026, 1, 1, 0, 0, 0)
    trades = [
        _trade(start, -10.0, 3),
        _trade(start + timedelta(hours=4), -25.0, 3),
        _trade(start + timedelta(hours=8), 15.0, 3),
        _trade(start + timedelta(hours=12), -40.0, 3),
        _trade(start + timedelta(hours=16), -12.0, 3),
    ]

    windows = analyze_loss_streaks(trades, top_n=2)

    assert len(windows) == 2
    assert windows[0]["trade_count"] == 2
    assert round(windows[0]["total_net_pnl"], 6) == -52.0
    assert windows[0]["start_ts"] == (start + timedelta(hours=12)).isoformat()
    assert windows[0]["end_ts"] == (start + timedelta(hours=19)).isoformat()


def test_enrich_trade_rows_adds_requested_entry_context_columns() -> None:
    start = datetime(2026, 1, 1, 0, 0, 0)
    bars = []
    for i in range(60):
        price = 100.0 + i * 0.2
        bars.append(
            Bar(
                symbol="BTCUSDT",
                ts=start + timedelta(hours=i),
                open=price - 0.2,
                high=price + 0.4,
                low=price - 0.4,
                close=price,
                volume=1000.0 + i * 5.0,
            )
        )
    bars[-1] = Bar(
        symbol="BTCUSDT",
        ts=bars[-1].ts,
        open=111.0,
        high=113.0,
        low=110.5,
        close=112.8,
        volume=1600.0,
    )

    rows = [
        {
            "symbol": "BTCUSDT",
            "side": "LONG",
            "entry_ts": bars[-1].ts.isoformat(),
            "exit_ts": (bars[-1].ts + timedelta(hours=3)).isoformat(),
            "entry_price": "112.8",
            "exit_price": "113.2",
            "qty": "1",
            "gross_pnl": "0.4",
            "fee_paid": "0.1",
            "funding_paid": "0.0",
            "net_pnl": "0.3",
            "bars_held": "3",
            "reason": "time_exit",
        }
    ]

    enriched = enrich_trade_rows(rows, bars)

    assert len(enriched) == 1
    row = enriched[0]
    assert "entry_ema_slope" in row
    assert row["trend_bias"] == "상향"
    assert float(row["breakout_strength"]) > 0.0
    assert row["vol_regime"] in {"저변동", "고변동"}
    assert row["market_regime"] in {"추세", "횡보"}
    assert row["pnl_bucket"] == "수익"


def test_build_condition_table_summarizes_win_rate_and_expectancy_by_regime() -> None:
    rows = [
        {"net_pnl": "10.0", "vol_regime": "고변동", "market_regime": "추세", "pnl_bucket": "수익"},
        {"net_pnl": "-4.0", "vol_regime": "고변동", "market_regime": "추세", "pnl_bucket": "손실"},
        {"net_pnl": "3.0", "vol_regime": "저변동", "market_regime": "횡보", "pnl_bucket": "수익"},
        {"net_pnl": "-2.0", "vol_regime": "저변동", "market_regime": "횡보", "pnl_bucket": "손실"},
    ]

    table = build_condition_table(rows)

    assert len(table) == 2
    trend_row = next(item for item in table if item["vol_regime"] == "고변동")
    assert trend_row["trade_count"] == 2
    assert round(trend_row["win_rate"], 4) == 0.5
    assert round(trend_row["expectancy"], 4) == 3.0


def _trade(entry_ts: datetime, net_pnl: float, bars_held: int, side: str = "LONG") -> TradeEvent:
    return TradeEvent(
        symbol="BTCUSDT",
        side=side,
        entry_ts=entry_ts,
        exit_ts=entry_ts + timedelta(hours=bars_held),
        entry_price=100.0,
        exit_price=100.0 + net_pnl,
        qty=1.0,
        gross_pnl=net_pnl,
        fee_paid=0.0,
        funding_paid=0.0,
        net_pnl=net_pnl,
        bars_held=bars_held,
        reason="time_exit",
    )
