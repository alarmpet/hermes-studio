# Bybit Integration Guide for Hermes

## 목표
Hermes에서 Bybit 관련 요청(가격 조회, 차트 수집, 전략 백테스트, 숏/롱 비교 실험)이 들어왔을 때, **요청 해석 → 데이터 수집 → 백테스트 실행 → 결과 산출/전달**의 루프가 항상 재현 가능하게 동작하도록 정리한다.

## 공식 소스
- Bybit 공식 Docs: https://bybit-exchange.github.io/docs/
- Bybit API V5 가이드: https://bybit-exchange.github.io/docs/v5/guide
- Bybit MCP/Skills 저장소: https://github.com/bybit-exchange/skills
- Bybit MCP 서버 패키지: `bybit-official-trading-server@latest`
- 역사 데이터: https://www.bybit.com/derivatives/en/history-data

## Hermes 적용 구조
Hermes 현재 구조에서 권장되는 결합은 다음 3계층이다.

1) **정책/보안 계층 (Skill)**: `integrations/bybit/SKILL.md`
- 보안/권한, 서명 방식(HMAC vs RSA), 환경/계정 체크 규칙 보유
- 실서비스 동작(쓰기 포함) 전 사전 검증 절차 제공

2) **실행 계층 (MCP)**: Codex MCP + Bybit MCP 서버
- 실시간 시세/틱/오더북/기본 계측용
- `telegrams`에서 MCP 등록/사용 상태 확인은 `scripts/check-bybit-integration.mjs`를 통해 모니터링

3) **재현 계층 (CSV Backtest)**: `run_bybit_linear_trend_backtest.py`
- 실제 실행은 기본적으로 CSV 기반으로 보존성 유지
- 산출물: `summary.md`, `trades.csv`, `equity_curve.csv`, `manifest.json`

## 데이터 수집 워크플로우

요청 `symbol/category/interval/limit`이 들어오면 Hermes가 수행하는 순서:

1. 요청 해석: `symbol`(예: BTCUSDT), `category`(linear), `interval`(60), `limit`(기본 1000), `strategy` 추출
2. 데이터 소스 판단:
   - `recent`/`new` 키워드가 있으면 Bybit API 조회 후 저장
   - 그 외 기본은 최신 저장본 재사용
3. Bybit API 호출(요청 시):
   - `v5/market/kline` (OHLCV)
   - `v5/market/instruments-info` (심볼 스펙)
   - `v5/market/funding/history` (funding)
   - 필요 시 `tickers`, `orderbook`
4. 응답 정규화(역순 정렬인 startTime 기반)
5. `outputs/bybit_*` 폴더에 원본/정규 CSV/manifest 저장
6. 백테스트 엔진에 `symbol, category, interval, intervalSeconds, source`를 전달

## 전략 비교 규칙
- `normal`: 원래 신호 방향 그대로
- `reverse_long_entries`: LONG 진입만 역전 후 숏 진입
- `reverse_all_entries`: 모든 진입/청산을 반대로
- `counterfactual_reverse_losers`: 오직 실패 거래만 뒤집는 사후 분석(투자 실행용 아님)

이 규칙은 결과 리포트에 반드시 명시하고, `counterfactual` 라벨은 운영 전략으로 제안하지 않는다.

## 자연어 라우팅 규칙(요약)

Hermes에게 아래 패턴은 **Bybit 백테스트**로 라우팅:
- "Bybit ... BTCUSDT ... 1000 ... trend breakout backtest"
- "롱/숏 반대로 / 비교"
- "same previous data", "reverse long entries", "reverse all entries"

Bybit 데이터만 새로 불러오지 않고 최근 저장본으로 처리해야 하는 요청:
- "이전 데이터", "같은 데이터로", "지난번 결과 기반"

새 데이터를 강제해야 하는 요청:
- "recent", "latest", "새로", "새 데이터"

## Telegram 응답 규칙(중요)

- 긴 텍스트는 단일 메시지로 절대 전송하지 않는다.
- 결과는 `outputs/...` 경로를 먼저 제시하고, 텍스트에는 핵심 지표(총손익/승률/MDD/거래수)와 유효성 검증값을 담는다.
- `counterfactual` 결과를 실전 전략처럼 설명하면 안 된다.

## 보안 규칙

- API 키/비밀값은 코드/로그/대화에 절대 평문 고정하지 않는다.
- 환경변수 우선 원칙: `BYBIT_API_KEY`, `BYBIT_API_SECRET` 또는 `BYBIT_API_PRIVATE_KEY_PATH`.
- 실서비스(주문/청산)는 사용자 승인 경로를 거친 경우에만 활성화.

---

## Hermes 실행 템플릿

### 데이터만 수집
```text
Bybit BTCUSDT linear 1h 1000 recent
```

### 백테스트 실행
```text
Bybit BTCUSDT linear 1h 1000 trend breakout backtest
```

### 방향 비교
```text
Bybit BTCUSDT linear 1h 1000 trend breakout backtest; reverse_long_entries, reverse_all_entries 비교
```
