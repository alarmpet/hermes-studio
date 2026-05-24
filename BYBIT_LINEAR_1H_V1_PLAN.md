# Bybit Linear 1h 멀티 에이전트 백테스트 v1

Date: 2026-05-22

## 확정 범위

- 마켓: Bybit Linear Perpetual
- 타임프레임: 1h
- 신호 계층: 기존 `backtest_system/pattern_agents.py`, `backtest_system/signals.py` 재사용
- 재사용 대상:
  - `TrendBreakoutAgent`
  - `MeanReversionAgent`
  - `SignalOrchestrator`
  - `resolve_signals`
- `auto-trade-main-okx`에는 코어 로직만 좁게 재사용

## v1 아키텍처

1. Data Layer
- 입력: Bybit Linear 1h OHLCV CSV
- 변환: `LinearMarketSpec` + `load_linear_bars()`로 `Bar[]` 생성

2. Signal Layer (기존 재사용)
- `SignalOrchestrator([TrendBreakoutAgent, MeanReversionAgent])`
- `resolve_signals(raw_signals)`로 최종 1개 신호 또는 no-trade 결정

3. Position Layer (신규)
- 입력: 최종 신호 + 현재 포지션 상태
- 규칙:
  - 동일 방향 보유 시 신규 진입 생략
  - 반대 방향 신호 시 기존 포지션 청산 후 전환
  - 동시 양방향 포지션 금지

4. Risk Layer (신규)
- 기본 파라미터(v1):
  - `max_leverage = 2.0`
  - `risk_per_trade = 0.01` (equity 기준 1%)
  - `max_open_positions = 1` (심볼 1개 기준)
  - `fee_rate = 0.0006`
  - `slippage_bps = 3`
- 청산 조건:
  - 손절: -1.0R
  - 익절: +1.5R
  - 최대 보유 봉수: 48 bars (2일)

5. Execution Simulator Layer (신규)
- 시그널 발생 다음 봉 시가 체결(lookahead 방지)
- 체결가 보정: 슬리피지 + 수수료 반영
- 주문 로그: timestamp, side, qty, fill_price, reason 저장

6. Metrics Layer (신규)
- 필수:
  - 누적수익률, MDD, 승률, PF, Sharpe(시간당 기준)
  - 총 거래수, 평균 보유시간, 롱/숏 분리 성과
- 산출물:
  - 콘솔 요약
  - JSON 리포트 (`outputs/backtest-bybit-linear-1h-*.json`)

## 실행 순서

1. `Bar[]` 로드
2. warm-up 구간(최소 60 bars) 스킵
3. 매 봉마다:
- 과거 구간으로 신호 생성
- 신호 resolve
- 포지션/리스크/체결 처리
- equity curve 기록
4. 종료 시 미청산 포지션 정리
5. 지표 계산 및 결과 저장

## v1 구현 파일 제안

- 기존 재사용:
  - `backtest_system/pattern_agents.py`
  - `backtest_system/signals.py`
  - `backtest_system/bybit_linear.py`
  - `backtest_system/models.py`
- 신규 추가:
  - `backtest_system/engine.py` (루프/체결/포지션 상태 전이)
  - `backtest_system/metrics.py` (성과 계산)
  - `backtest_system/run_bybit_linear_1h.py` (CLI 엔트리)

## auto-trade-main-okx 재사용 경계

재사용 허용:
- 시그널 생성/해결 인터페이스
- 리스크 파라미터 스키마
- 주문 reason taxonomy

재사용 제외:
- 거래소 API 호출
- 실주문/실시간 WS 처리
- OKX 전용 포지션/주문 상태머신

## 완료 기준 (DoD)

- 동일 CSV 입력에 대해 재실행 시 결과 재현 가능
- lookahead bias 없음(다음 봉 체결)
- 최소 1개 샘플 데이터에서 JSON 결과 생성
- 실패 시 원인 로그가 단계별로 식별 가능(데이터/신호/체결/지표)
