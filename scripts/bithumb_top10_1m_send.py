#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import mplfinance as mpf
import pandas as pd

ROOT = Path("C:/Users/amd/hermes")
BASE = "https://api.bithumb.com"

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except AttributeError:
    pass


def get_json(url: str):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Hermes/1.0",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.load(response)


def load_config() -> dict:
    return json.loads((ROOT / "telegram-flow-news-config.json").read_text(encoding="utf-8"))


def telegram(method: str, payload: dict, file_field: str | None = None, file_path: Path | None = None, mime_type: str = "image/png"):
    token = load_config()["botToken"]
    url = f"https://api.telegram.org/bot{token}/{method}"
    if file_field and file_path:
        boundary = f"----Hermes{int(time.time() * 1000)}"
        body = bytearray()
        for key, value in payload.items():
            if value is None:
                continue
            body.extend(f"--{boundary}\r\n".encode())
            body.extend(f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode())
            body.extend(str(value).encode("utf-8"))
            body.extend(b"\r\n")
        body.extend(f"--{boundary}\r\n".encode())
        body.extend(
            f'Content-Disposition: form-data; name="{file_field}"; filename="{file_path.name}"\r\n'.encode()
        )
        body.extend(f"Content-Type: {mime_type}\r\n\r\n".encode())
        body.extend(file_path.read_bytes())
        body.extend(b"\r\n")
        body.extend(f"--{boundary}--\r\n".encode())
        req = urllib.request.Request(
            url,
            data=bytes(body),
            headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
            method="POST",
        )
    else:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/json; charset=utf-8"},
            method="POST",
        )
    with urllib.request.urlopen(req, timeout=60) as response:
        parsed = json.load(response)
    if not parsed.get("ok"):
        raise RuntimeError(f"Telegram {method} failed: {parsed}")
    return parsed["result"]


def send_message(chat_id: str, text: str, reply_to: str | None = None):
    return telegram(
        "sendMessage",
        {
            "chat_id": chat_id,
            "text": text,
            "reply_to_message_id": reply_to,
            "disable_web_page_preview": True,
        },
    )


def send_photo(chat_id: str, path: Path, caption: str, reply_to: str | None = None):
    return telegram(
        "sendPhoto",
        {
            "chat_id": chat_id,
            "caption": caption,
            "reply_to_message_id": reply_to,
        },
        file_field="photo",
        file_path=path,
    )


def fetch_market_meta() -> dict[str, dict]:
    items = get_json(f"{BASE}/v1/market/all?isDetails=true")
    return {
        item["market"]: item
        for item in items
        if str(item.get("market", "")).startswith("KRW-") and item.get("market_warning") == "NONE"
    }


def fetch_all_tickers() -> dict:
    return get_json(f"{BASE}/public/ticker/ALL_KRW")["data"]


def fetch_daily_candles(market: str, count: int = 31, to_kst: str | None = None) -> list[dict]:
    params = {"market": market, "count": str(count)}
    if to_kst:
        params["to"] = to_kst
    query = urllib.parse.urlencode(params)
    return get_json(f"{BASE}/v1/candles/days?{query}")


def candidate_markets(limit: int) -> list[dict]:
    meta = fetch_market_meta()
    tickers = fetch_all_tickers()
    rows = []
    for symbol, data in tickers.items():
        if symbol == "date":
            continue
        market = f"KRW-{symbol}"
        if market not in meta:
            continue
        try:
            trade_value = float(data.get("acc_trade_value_24H") or 0)
        except Exception:
            trade_value = 0.0
        rows.append(
            {
                "market": market,
                "symbol": symbol,
                "name": meta[market].get("korean_name") or meta[market].get("english_name") or symbol,
                "trade_value_24h": trade_value,
            }
        )
    rows.sort(key=lambda item: item["trade_value_24h"], reverse=True)
    return rows[:limit]


def rank_top_monthly(limit: int, top_n: int) -> list[dict]:
    ranked = []
    for item in candidate_markets(limit):
        candles = fetch_daily_candles(item["market"], count=31)
        if len(candles) < 25:
            continue
        latest = float(candles[0]["trade_price"])
        baseline = float(candles[-1]["trade_price"])
        if baseline <= 0:
            continue
        item = {
            **item,
            "return_1m_pct": round((latest / baseline - 1.0) * 100.0, 2),
            "baseline_close": baseline,
            "latest_close": latest,
            "baseline_date": candles[-1]["candle_date_time_kst"][:10],
            "latest_date": candles[0]["candle_date_time_kst"][:10],
        }
        ranked.append(item)
        time.sleep(0.08)
    ranked.sort(key=lambda item: item["return_1m_pct"], reverse=True)
    for index, item in enumerate(ranked[:top_n], 1):
        item["rank"] = index
    return ranked[:top_n]


def fetch_three_year_frame(market: str) -> pd.DataFrame:
    pages: list[dict] = []
    cursor = None
    for _ in range(6):
        batch = fetch_daily_candles(market, count=200, to_kst=cursor)
        if not batch:
            break
        pages.extend(batch)
        oldest = batch[-1]["candle_date_time_kst"]
        cursor_dt = datetime.strptime(oldest, "%Y-%m-%dT%H:%M:%S") - timedelta(seconds=1)
        cursor = cursor_dt.strftime("%Y-%m-%d %H:%M:%S")
        if len(pages) >= 1100:
            break
        time.sleep(0.08)
    if not pages:
        raise RuntimeError(f"no candle data for {market}")
    frame = pd.DataFrame(
        [
            {
                "Date": pd.to_datetime(row["candle_date_time_kst"]),
                "Open": float(row["opening_price"]),
                "High": float(row["high_price"]),
                "Low": float(row["low_price"]),
                "Close": float(row["trade_price"]),
                "Volume": float(row["candle_acc_trade_volume"]),
            }
            for row in pages
        ]
    )
    frame = frame.drop_duplicates(subset=["Date"]).sort_values("Date")
    frame = frame.set_index("Date").tail(1100)
    return frame


def chart_path(out_dir: Path, rank: int, symbol: str) -> Path:
    return out_dir / f"{rank:02d}_{symbol}_KRW_3y_daily.png"


def build_chart(item: dict, out_dir: Path) -> Path:
    df = fetch_three_year_frame(item["market"])
    try:
        plt.rcParams["font.family"] = "Malgun Gothic"
    except Exception:
        pass
    plt.rcParams["axes.unicode_minus"] = False
    style = mpf.make_mpf_style(base_mpf_style="yahoo", rc={"font.family": "Malgun Gothic"})
    output = chart_path(out_dir, item["rank"], item["symbol"])
    mpf.plot(
        df,
        type="candle",
        volume=True,
        style=style,
        title=f"{item['name']} ({item['symbol']}/KRW) - 3Y Daily",
        ylabel="KRW",
        ylabel_lower="Volume",
        figsize=(10, 7),
        tight_layout=True,
        warn_too_much_data=2000,
        savefig=dict(fname=str(output), dpi=150, bbox_inches="tight"),
    )
    return output


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--chat-id", required=True)
    parser.add_argument("--reply-to")
    parser.add_argument("--candidate-limit", type=int, default=25)
    parser.add_argument("--top", type=int, default=10)
    parser.add_argument("--out-dir", default="")
    args = parser.parse_args()

    stamp = datetime.now(timezone.utc).astimezone().strftime("%Y%m%d-%H%M%S")
    out_dir = Path(args.out_dir) if args.out_dir else ROOT / "outputs" / f"bithumb-top10-1m-{stamp}"
    out_dir.mkdir(parents=True, exist_ok=True)

    ranked = rank_top_monthly(args.candidate_limit, args.top)
    if not ranked:
        raise SystemExit("no ranked items")

    for item in ranked:
        item["chart_path"] = str(build_chart(item, out_dir))

    result = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "source": "Bithumb public API",
        "method": f"KRW market warning NONE only -> 24h 거래대금 상위 {args.candidate_limit}개 선별 -> 최근 31일 일봉 수익률 상위 {args.top}개",
        "items": ranked,
    }
    (out_dir / "result.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")

    summary_lines = [
        "빗썸 최근 1개월 상승률 상위 10개 차트를 보냅니다.",
        f"기준: 24시간 거래대금 상위 {args.candidate_limit}개 KRW 마켓을 먼저 추려 1개월 수익률을 계산했습니다.",
        "",
    ]
    for item in ranked:
        summary_lines.append(
            f"{item['rank']}. {item['name']} ({item['symbol']}) {item['return_1m_pct']:+.2f}%"
        )
    send_message(args.chat_id, "\n".join(summary_lines), args.reply_to)

    for item in ranked:
        caption = f"{item['rank']}. {item['name']} ({item['symbol']}/KRW) 1개월 {item['return_1m_pct']:+.2f}% | 3년 일봉"
        send_photo(args.chat_id, Path(item["chart_path"]), caption, args.reply_to)

    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
