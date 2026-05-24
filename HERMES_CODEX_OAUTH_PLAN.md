# Hermes LLM을 Codex OAuth 기반으로 연동하는 안정화 계획

작성일: 2026-05-21

검토 대상:

- `C:\Users\amd\hermes\HERMES_CODEX_OAUTH_REVIEW.md`
- `C:\Users\amd\hermes\telegram-flow-news-bot.mjs`
- `C:\Users\amd\.codex\auth.json`
- `C:\Users\amd\.codex\models_cache.json`
- OpenAI Codex 공식 문서

## 1. 결론

Hermes에서 Codex/ChatGPT OAuth를 사용하려면 `auth.json`의 access token을 직접 꺼내 HTTP API 토큰처럼 쓰는 방식은 피한다.

가장 안정적인 방향은 다음 순서다.

1. Codex SDK 브릿지
2. Codex CLI `exec` fallback
3. OpenRouter/API key fallback

즉, Hermes는 “Codex OAuth 토큰 사용자”가 아니라 “로그인된 로컬 Codex를 호출하는 클라이언트”가 되어야 한다.

## 2. 공식 문서로 확인된 사실

공식 Codex 인증 문서 기준:

- Codex는 ChatGPT 로그인과 API key 로그인을 모두 지원한다.
- CLI/IDE Extension은 ChatGPT 계정 또는 API key로 인증 가능하다.
- ChatGPT 로그인 시 CLI가 브라우저 로그인 후 access token을 받는다.
- headless 환경에서는 `codex login --device-auth`가 권장된다.
- `~/.codex/auth.json`은 access token을 포함하므로 비밀번호처럼 취급해야 한다.
- Codex access token은 trusted script/private CI 같은 Codex local workflow용이다.
- 일반 OpenAI API 호출은 Platform API key를 계속 사용해야 한다.

공식 Codex SDK 문서 기준:

- `@openai/codex-sdk`는 로컬 Codex agent를 애플리케이션에서 제어하기 위한 TypeScript 라이브러리다.
- 서버 측 Node.js 18 이상에서 사용한다.
- `new Codex()`, `startThread()`, `thread.run()` 패턴을 제공한다.

공식 CLI 문서 기준:

- `codex` 첫 실행 시 ChatGPT 계정 또는 API key로 인증한다.
- `codex exec`는 non-interactive automation mode로 쓸 수 있다.
- Codex CLI는 MCP 서버를 사용할 수 있지만, MCP는 기본적으로 도구 확장 프로토콜이지 Hermes의 LLM provider 대체 수단이 아니다.

참고:

- https://developers.openai.com/codex/auth
- https://developers.openai.com/codex/sdk
- https://developers.openai.com/codex/cli
- https://www.npmjs.com/package/@openai/codex

## 3. 로컬에서 확인한 사실

현재 로컬 상태:

- Codex 인증 파일 존재: `C:\Users\amd\.codex\auth.json`
- 인증 파일 구조:
  - `auth_mode`
  - `OPENAI_API_KEY`
  - `tokens`
  - `last_refresh`
- 현재 Codex config 모델: `gpt-5.5`
- 로컬 모델 캐시에 존재:
  - `gpt-5.3-codex-spark`
  - `gpt-5.3-codex`
  - `gpt-5.4`
  - `gpt-5.5`
- 현재 Hermes Telegram worker의 일반 답변 경로:
  - `telegram-flow-news-bot.mjs`
  - `openRouterReply()`가 OpenRouter HTTP API를 직접 호출

## 4. 리뷰 문서에서 반영할 내용

### 반영함

1. Spark 실패 대비 circuit breaker
   - `gpt-5.3-codex-spark`는 로컬 모델 캐시에 있지만, 실제 호출 가능 여부는 smoke test 전까지 확정하지 않는다.
   - Spark가 연속 실패하면 일정 시간 차단하고 다음 모델로 fallback한다.

2. CLI 브릿지의 프로세스 오버헤드
   - `codex exec`를 매 Telegram 메시지마다 실행하면 latency가 커질 수 있다.
   - 따라서 1순위는 SDK, CLI는 fallback으로 둔다.
   - 정확한 지연 시간은 측정한다. 문서의 “1.5~3초” 같은 수치는 추정값으로만 취급한다.

3. OAuth 만료/인증 실패 처리
   - 백그라운드 봇이 인증 플로우에서 멈추면 안 된다.
   - 인증 실패 시 Telegram에 `codex login --device-auth` 안내를 보내고 OpenRouter fallback으로 내려간다.

4. persistent circuit breaker
   - 실패 상태를 메모리에만 두면 프로세스 재시작 후 같은 실패 모델을 반복 호출할 수 있다.
   - `telegram-flow-state.json`에 모델 실패 상태를 저장한다.

5. 관측 로그
   - 어떤 backend를 썼는지 기록한다.
   - `codex-sdk`, `codex-cli`, `openrouter`
   - 선택 모델, latency, fallback 여부, 실패 사유를 남긴다.
   - token/key는 절대 로그에 남기지 않는다.

6. Codex CLI 설치 경로 문제
   - 현재 WindowsApps의 `codex.exe` 직접 실행은 Access denied가 발생했다.
   - 필요하면 `npm i -g @openai/codex@latest`로 별도 CLI를 설치하고 PATH 우선순위를 분리한다.

### 반영하지 않음

1. `auth.json` Disk Watcher 기반 local API proxy
   - 토큰을 직접 읽고 메모리에 보관하는 프록시는 공격면을 키운다.
   - 공식 권장 흐름인 SDK/CLI 호출보다 위험하다.
   - 지금 단계에서는 제외한다.

2. Hermes가 OAuth device flow를 Telegram 안에서 직접 대행
   - OAuth 코드/링크 전달 자체는 가능하지만, 봇이 인증 흐름을 직접 구현하면 보안/UX/예외 처리가 복잡해진다.
   - 우선은 `codex login --device-auth`를 사용자가 로컬 터미널에서 수행하도록 안내한다.

3. MCP OAuth를 1순위로 사용하는 방식
   - MCP는 Codex가 도구를 쓰게 하거나 외부 도구를 노출하는 구조에 가깝다.
   - Hermes의 기본 LLM provider를 바꾸는 목적에는 SDK/CLI가 더 단순하고 검증 가능하다.
   - `@modelcontextprotocol/server-codex` 같은 패키지는 공식성/유지보수 상태가 확인되기 전까지 계획에서 제외한다.

4. 자동매매 DB/SQLite 개선 항목
   - 리뷰 문서에 포함되어 있지만 Codex OAuth 연동 범위를 벗어난다.
   - 단, Hermes worker 상태 저장 안정화에는 atomic write 정도만 반영한다.

5. Chrome/Google Flow zombie process 관리
   - Flow 자동화 운영 안정성에는 유효한 지적이다.
   - 그러나 Codex OAuth 계획의 핵심은 아니므로 별도 Flow 운영 개선 문서로 분리한다.

## 5. 목표 아키텍처

```text
Telegram message
  -> Hermes worker
    -> 명시적 Google Flow/영상 요청
       -> Google Flow CDP 자동화
    -> 뉴스 검색/요약 요청
       -> Google News RSS
       -> 필요 시 Codex/OpenRouter로 요약 보강
    -> 일반 질문/요청
       -> CodexBridge.ask()
          1. Codex SDK + gpt-5.3-codex-spark
          2. Codex SDK + gpt-5.3-codex
          3. Codex SDK + gpt-5.4
          4. Codex CLI exec fallback
          5. OpenRouter fallback
```

## 6. 구현 단계

### 1단계: Codex SDK 설치 및 smoke test

```powershell
cd C:\Users\amd\hermes
npm init -y
npm install @openai/codex-sdk
```

테스트 파일:

```js
// codex-sdk-smoke.mjs
import { Codex } from "@openai/codex-sdk";

const model = process.argv[2] || "gpt-5.3-codex-spark";
const codex = new Codex();
const thread = codex.startThread({ model });
const started = Date.now();
const result = await thread.run("한국어로 한 문장만 답해: Hermes 연결 테스트 OK");
console.log(JSON.stringify({
  model,
  latencyMs: Date.now() - started,
  result,
}, null, 2));
```

실행:

```powershell
node .\codex-sdk-smoke.mjs gpt-5.3-codex-spark
node .\codex-sdk-smoke.mjs gpt-5.3-codex
node .\codex-sdk-smoke.mjs gpt-5.4
```

성공 기준:

- OAuth 재로그인 없이 답변이 나온다.
- 모델별 latency가 기록된다.
- Spark 실패 시 에러 메시지를 기록하고 다음 모델 fallback이 성공해야 한다.

### 2단계: CLI fallback 검증

현재 WindowsApps `codex.exe`는 Access denied가 발생했으므로 먼저 별도 CLI 설치를 검토한다.

```powershell
npm i -g @openai/codex@latest
where codex
codex --version
```

테스트:

```powershell
codex exec --model gpt-5.3-codex-spark "한국어로 한 문장만 답해: Hermes 연결 테스트 OK"
codex exec --model gpt-5.3-codex "한국어로 한 문장만 답해: Hermes 연결 테스트 OK"
codex exec --model gpt-5.4 "한국어로 한 문장만 답해: Hermes 연결 테스트 OK"
```

실패 시:

```powershell
codex login --device-auth
```

### 3단계: CodexBridge 추가

`telegram-flow-news-bot.mjs`에 다음 구조를 추가한다.

```js
async function hermesReply(text, message) {
  if (codexCircuitAllows("gpt-5.3-codex-spark")) {
    try {
      return await codexSdkReply("gpt-5.3-codex-spark", text, message);
    } catch (error) {
      recordCodexFailure("gpt-5.3-codex-spark", error);
    }
  }

  for (const model of ["gpt-5.3-codex", "gpt-5.4"]) {
    try {
      return await codexSdkReply(model, text, message);
    } catch (error) {
      recordCodexFailure(model, error);
    }
  }

  try {
    return await codexCliReply("gpt-5.4", text, message);
  } catch (error) {
    recordCodexFailure("codex-cli", error);
  }

  return openRouterReply(text, message);
}
```

기존 `handleGenericMessage()`는 `openRouterReply()` 대신 `hermesReply()`를 호출한다.

### 4단계: circuit breaker

상태 파일:

```json
{
  "codex": {
    "models": {
      "gpt-5.3-codex-spark": {
        "failures": 0,
        "blockedUntil": null,
        "lastError": null
      }
    }
  }
}
```

정책:

- 같은 모델 3회 연속 실패 시 10분 차단
- 인증 오류는 즉시 30분 차단 후 사용자에게 로그인 안내
- 성공 시 failure count reset
- 상태 저장은 atomic write 사용

### 5단계: atomic state write

현재 `telegram-flow-state.json`과 offset 파일은 단순 `writeFile()`이다.

개선:

```js
async function writeJsonAtomic(path, value) {
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2));
  await rename(tmp, path);
}
```

필요 변경:

- `node:fs/promises`에서 `rename` import
- `writeState()`, `writeOffset()`에 적용

### 6단계: 인증 실패 UX

Codex SDK/CLI에서 인증 실패가 감지되면 Telegram에 다음처럼 응답한다.

```text
Codex 로그인이 만료되었습니다.
로컬 터미널에서 아래 명령을 실행해 주세요:

codex login --device-auth

임시로 OpenRouter fallback으로 답변합니다.
```

주의:

- Telegram으로 `auth.json` 내용, token, code를 요구하지 않는다.
- Telegram 봇이 OAuth token을 직접 저장하지 않는다.

## 7. 테스트 계획

### A. 일반 Hermes 질답

입력:

```text
비트코인 RSI가 뭐야?
```

기대:

- Flow 실행 없음
- Codex SDK 답변
- 실패 시 CLI 또는 OpenRouter fallback
- 로그에 backend/model/latency 기록

### B. AI 뉴스 요약

입력:

```text
오늘자 AI 뉴스 3건 요약해
```

기대:

- Google News RSS 검색
- `3건`을 “3번 뉴스”로 오해하지 않음
- 최신 뉴스 목록을 `telegram-flow-state.json`에 저장

### C. 후속 맥락

입력:

```text
2번 뉴스를 저작권에 위배되지 않게 각색해서 대본과 이미지 프롬프트 만들어줘
```

기대:

- 저장된 뉴스 목록의 2번 사용
- 새 검색으로 오인하지 않음

### D. Flow 명시 요청

입력:

```text
/flow 미래 도시 쇼츠 영상 만들어줘
```

기대:

- Codex 일반 답변이 아니라 Flow CDP 자동화 실행

### E. Flow 비명시 요청

입력:

```text
오늘 스포츠 뉴스 검색해봐
```

기대:

- Flow 실행 없음
- Google News RSS 스포츠 검색

### F. Spark 라우팅/가용성 실패

조건:

- `gpt-5.3-codex-spark` 강제

기대:

- 실패 기록
- 3회 실패 후 10분 차단
- `gpt-5.3-codex` 또는 `gpt-5.4` fallback

### G. OAuth 만료

조건:

- 인증 파일을 임시 이동하거나 별도 `CODEX_HOME`으로 실행

기대:

- 봇 hang 없음
- 로그인 안내
- OpenRouter fallback

### H. CLI latency 측정

입력:

```text
짧게 OK라고 답해
```

기대:

- SDK latency와 CLI latency를 분리 측정
- CLI가 느리면 기본 경로에서 제외하고 emergency fallback으로만 사용

## 8. 보안 원칙

절대 로그/Telegram에 출력하지 않을 것:

- `C:\Users\amd\.codex\auth.json` 내용
- access token
- refresh token
- OpenRouter key
- Telegram bot token

허용되는 로그:

- backend 이름
- model 이름
- latency
- fallback 여부
- 에러의 safe summary

## 9. 최종 우선순위

1. `@openai/codex-sdk` smoke test
2. Spark, Codex, GPT-5.4 모델별 성공/실패/latency 기록
3. `hermesReply()` 추가
4. persistent circuit breaker 추가
5. atomic state write 추가
6. CLI fallback 검증
7. Telegram 회귀 테스트

## 10. 이번 리뷰에서 제외한 항목

다음은 리뷰 문서에 있었지만 이 계획서에는 반영하지 않는다.

- auto-trading DB 구조 개선
- trading backtest/slippage 개선
- Google Flow selector hardening
- Chrome zombie process lifecycle
- SQLite WAL 통합

이 항목들은 각각 별도 운영 안정화 문서에서 다루는 것이 맞다.

## 11. 진행 결과

2026-05-21에 다음 항목을 구현/검증했다.

완료:

- `npm init -y`
- `npm install @openai/codex-sdk`
- `codex-sdk-smoke.mjs` 작성
- `gpt-5.3-codex-spark` smoke test 성공
- `telegram-flow-news-bot.mjs` 일반 Hermes 응답 경로를 `Codex SDK -> Codex CLI -> OpenRouter` fallback 구조로 변경
- Codex SDK 모델 순서:
  - `gpt-5.3-codex-spark`
  - `gpt-5.3-codex`
  - `gpt-5.4`
- Spark capacity 오류 발생 시 다음 모델로 fallback되는 것 확인
- CLI fallback을 `node node_modules/@openai/codex/bin/codex.js exec ...` 방식으로 검증
- `telegram-flow-state.json`에 Codex 모델별 실패/성공 상태 저장
- `telegram-flow-state.json` 및 offset 저장을 atomic write 방식으로 변경
- Telegram worker 재시작 완료

검증 결과:

```text
SDK smoke test:
gpt-5.3-codex-spark -> 성공

일반 Hermes 응답:
gpt-5.3-codex-spark -> 성공

강제 SDK 실패 후 CLI fallback:
codex-cli + gpt-5.3-codex -> 성공
```

현재 운영 워커:

```text
telegram-flow-news-bot.mjs --watch
```

남은 후속 작업:

- 실제 Telegram에서 일반 질문을 보내 `hermes_reply` 로그가 `codex-sdk`로 찍히는지 확인
- Spark capacity가 반복될 때 3회 실패 후 10분 circuit breaker가 의도대로 동작하는지 장기 관찰
- OAuth 만료 상황을 별도 `CODEX_HOME`으로 재현해 로그인 안내/fallback UX 확인
