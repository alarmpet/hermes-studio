# Hermes Korean Stock YTD Chart Request Review

Date: 2026-05-21

## User Scenario

The user asks Hermes in Telegram to find the top 10 Korean KOSPI/KOSDAQ stocks by 2026 year-to-date return and send 3-year daily charts for all 10 stocks.

The concrete failure observed was:

- User asked for ranks 1 through 10.
- Hermes completed in a few seconds.
- Hermes sent only old chart images from a previous run.
- Hermes did not recompute the YTD ranking.
- Hermes did not generate and send 10 fresh charts.

## Root Cause

The request was routed to the generic "send latest images" handler.

That handler was too broad:

- It matched words like "chart/image" plus "send".
- It did not distinguish "send an existing image" from "calculate/generate new ranking charts".
- It ran before any dedicated Korean stock YTD chart workflow existed.

This was an intent-routing failure, not an LLM intelligence failure and not a KRX data failure.

## Implemented Fix

### 1. Dedicated intent classifier

Added `isKrxYtdTopChartRequest(text)` in `telegram-flow-news-bot.mjs`.

It detects requests containing the practical combination of:

- Korean stock market scope: KOSPI, KOSDAQ, KRX, Korean stocks
- YTD period: 2026, this year, start of year, YTD
- Ranking metric: highest rise, return rate, Top 10, rank 1 to 10
- Chart requirement: 3 years, daily candles, chart
- Telegram send wording

It also supports follow-up messages such as "send charts for ranks 1 through 10" where the previous context already makes the market obvious.

### 2. Narrowed latest-image resend handler

Updated `isSendLatestImagesRequest(text)` so it no longer catches new calculation/generation requests.

It now rejects requests containing words that imply a new task:

- find/search
- query
- calculate
- generate/create
- highest rise
- return rate
- Top 10
- 2026
- this year
- start of year
- 3-year data

This preserves the useful behavior for simple requests like "send the image you just made" while preventing accidental reuse of stale images.

### 3. Dedicated KRX/YFinance workflow

Added `scripts/krx_ytd_top10_charts.py`.

Workflow:

1. Load KRX listing through `FinanceDataReader.StockListing("KRX")`.
2. Map KOSPI tickers to `.KS` and KOSDAQ/KONEX tickers to `.KQ`.
3. Download 2026 YTD close data in grouped `yfinance.download()` chunks.
4. Calculate YTD return from first valid 2026 close to latest available close.
5. Sort Top 10.
6. Download 3-year OHLCV for only those Top 10 tickers.
7. Render daily candlestick charts with `mplfinance`.
8. Return structured JSON to Node.

Reason for using this path:

- `pykrx` failed in the local environment because KRX authentication variables were unavailable.
- `FinanceDataReader` plus grouped `yfinance` worked without KRX login.
- Full-universe grouped downloads avoid the previous one-request-per-ticker bottleneck.

### 4. Telegram handler

Added `handleKrxYtdTopChartsMessage(message)`.

It now:

- acknowledges the request,
- records progress phases,
- runs the helper script,
- sends a Top 10 summary,
- sends chart images one by one with rank/name/code/YTD captions,
- logs sent photo artifacts.

## Verification

### Syntax checks

Passed:

```powershell
node --check .\telegram-flow-news-bot.mjs
python -m py_compile .\scripts\krx_ytd_top10_charts.py
```

### Classifier checks

Passed:

```powershell
node .\telegram-flow-news-bot.mjs --test-classify "연초대비 상승률 1위부터 10위까지 종목 다 3년 일봉차트 생성해서 전송해줘"
```

Result:

```json
{ "task": "krx-ytd-top10-charts" }
```

Also passed:

```powershell
node .\telegram-flow-news-bot.mjs --test-classify "방금 만든 차트 이미지 보내줘"
```

Result:

```json
{ "task": "send-latest-images" }
```

### Inbound simulation

Passed with a limited test universe:

```powershell
$env:HERMES_KRX_YTD_MAX_CODES='30'
node .\telegram-flow-news-bot.mjs --simulate-message "연초대비 상승률 1위부터 10위까지 종목 다 3년 일봉차트 생성해서 전송해줘" --simulate-no-send --simulate-timeout-ms 180000
Remove-Item Env:\HERMES_KRX_YTD_MAX_CODES -ErrorAction SilentlyContinue
```

Observed:

- Task classified as `krx-ytd-top10-charts`.
- Progress messages showed the active workflow phase.
- Summary text was generated.
- 10 `sendPhoto` actions were produced.
- Korean captions were preserved in UTF-8.

### Full helper run

The full helper previously completed against the full KRX listing:

- Universe: 2826 tickers
- Ranked: 2815 tickers
- Failed chunks: 0
- Runtime: about 150 seconds

Top results from that full helper run:

1. DAEHA TECH (196490): 2903.00%
2. SUN TECH (217320): 769.89%
3. LIGHTRON (069540): 723.72%
4. Taihan Fiberoptics (010170): 717.86%
5. WILBES (008600): 713.66%
6. Ocean in The W (052300): 678.97%
7. Daewoo E&C (047040): 612.57%
8. AUK (017900): 589.75%
9. WOORIRO (046970): 553.12%
10. HMNEX (036170): 541.86%

Note: names are taken from the active data provider and may differ from Naver's display names.

## Operational Notes

- The live Telegram worker was restarted after the fix.
- The new worker process is running `telegram-flow-news-bot.mjs --watch`.
- The job may take about 2 to 4 minutes for the full KRX universe.
- The latest available trading close can lag calendar date when the data provider has not published the current session yet.
- `yfinance` can occasionally rate-limit a small number of tickers. The helper continues and reports ranked count and failed chunks.

## Remaining Improvements

P1: Add a cache for the latest full-universe YTD ranking so follow-up chart requests are faster.

P1: Add a Naver or KRX fallback for final display names when provider names differ.

P2: Add a `/lastcharts` command to resend the exact charts from the most recent ranking job.

P2: Add automated nightly smoke tests for classifier and limited-universe simulation.
