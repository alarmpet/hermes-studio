#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
from pathlib import Path


def f(row: dict[str, str], key: str) -> float:
    return float(row[key])


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze a counterfactual that reverses losing trades only.")
    parser.add_argument("--trades", required=True, help="Path to trades.csv")
    args = parser.parse_args()

    trades_path = Path(args.trades)
    rows = list(csv.DictReader(trades_path.open(encoding="utf-8")))
    losers = [row for row in rows if f(row, "net_pnl") < 0]

    reversed_losers = []
    for row in losers:
      reversed_net = -f(row, "gross_pnl") - f(row, "fee_paid") - f(row, "funding_paid")
      reversed_losers.append({**row, "reversed_net_pnl": reversed_net})

    original_closed_pnl = sum(f(row, "net_pnl") for row in rows)
    original_loser_pnl = sum(f(row, "net_pnl") for row in losers)
    reversed_loser_pnl = sum(row["reversed_net_pnl"] for row in reversed_losers)
    winner_pnl = sum(f(row, "net_pnl") for row in rows if f(row, "net_pnl") >= 0)

    long_rows = [row for row in rows if row.get("side") == "LONG"]
    short_rows = [row for row in rows if row.get("side") == "SHORT"]
    long_original = sum(f(row, "net_pnl") for row in long_rows)
    short_original = sum(f(row, "net_pnl") for row in short_rows)
    long_as_short = sum(-f(row, "gross_pnl") - f(row, "fee_paid") - f(row, "funding_paid") for row in long_rows)
    all_reversed = sum(-f(row, "gross_pnl") - f(row, "fee_paid") - f(row, "funding_paid") for row in rows)

    print(f"trades={len(rows)}")
    print(f"losers={len(losers)}")
    print(f"reversed_loser_winners={sum(1 for row in reversed_losers if row['reversed_net_pnl'] > 0)}")
    print(f"original_closed_trade_pnl={original_closed_pnl:.2f}")
    print(f"original_loser_pnl={original_loser_pnl:.2f}")
    print(f"reversed_loser_pnl={reversed_loser_pnl:.2f}")
    print(f"closed_trade_pnl_with_losers_reversed={winner_pnl + reversed_loser_pnl:.2f}")
    print(f"delta={reversed_loser_pnl - original_loser_pnl:.2f}")
    print(f"long_trades={len(long_rows)}")
    print(f"short_trades={len(short_rows)}")
    print(f"long_original_pnl={long_original:.2f}")
    print(f"short_original_pnl={short_original:.2f}")
    print(f"reverse_long_entries_total_pnl={short_original + long_as_short:.2f}")
    print(f"reverse_all_entries_total_pnl={all_reversed:.2f}")
    print(f"reverse_long_entries_winners={sum(1 for row in long_rows if (-f(row, 'gross_pnl') - f(row, 'fee_paid') - f(row, 'funding_paid')) > 0)}")


if __name__ == "__main__":
    main()
