# Hermes Studio Webwright Diagnostics & ChatGPT Thumbnail Recovery Review

본 검토서는 `2026-05-31-webwright-diagnostics-chatgpt-thumbnail-plan.md` 계획서와 Hermes Studio 코드베이스(Playwright 자동화, Electron 서비스, 메인 프로세스, SQLite DB 헬퍼 `bot_db_helper.py` 및 워크플로우 이벤트 수신기 `workflow-db-events.mjs`)를 교차 분석하여 발견된 문제점 및 개선 방향을 제시하는 의견서입니다.

---

## 1. 개요 (Executive Summary)

제안된 구현 계획서는 ChatGPT 썸네일 생성 시 발생하는 실패 패턴을 세분화(Taxonomy)하고, Microsoft Webwright 연구에서 영감을 얻은 자가진단 리포팅 메커니즘을 통합하려는 훌륭한 설계를 담고 있습니다. 

* **강점**: 기존 Playwright 자동화 인프라의 안정성을 저해하지 않으면서, 실패 시점에만 Webwright 기반의 재현 가능한 `task.md` 및 진단 산출물(DOM 스냅샷, 전송 버튼 정보, 계정 상태 등)을 분리 수집하도록 유도한 설계가 매우 영리합니다.
* **보완 필요 영역**: 그러나 Electron의 싱글 스레드 이벤트 루프 특성, Playwright의 브라우저 프로필 세션 락(Session Lock) 충돌 가능성, 그리고 SQLite DB(`bot_data.db`)로의 실패 이벤트 전파 누락 문제 등 실제 연동 단계에서 시스템 멈춤이나 모니터링 누락을 유발할 수 있는 구조적 허점들이 발견되었습니다.

---

## 2. 식별된 주요 문제점 및 잠재적 버그 (Identified Issues & Bugs)

### 2.1 Config Context 전달 누락 버그 (`context.config`가 `undefined`인 문제)
* **현상**: 계획서 Task 3 Step 4에서는 `createYouTubeJob` 내에서 `maybeRunWebwrightDiagnostics`를 호출할 때 `config: context.config`를 인자로 전달합니다.
* **원인**: 그러나 `electron/main.mjs` 내의 `youtube:createJob` IPC 핸들러 코드를 보면, `createYouTubeJob`에 컨텍스트를 주입할 때 `config` 자체를 통째로 전달하지 않고 `chromePath: config.chromePath`만 부분 주입하고 있습니다.
* **결과**: 이대로 구현하면 `context.config`가 `undefined`가 되므로, `maybeRunWebwrightDiagnostics` 함수 내부의 `if (!config.webwrightDiagnosticsEnabled)` 플래그 검사가 항상 건너뛰기(Skipped)로 처리되어 진단 기능이 영원히 실행되지 않습니다.
* **대안**: `main.mjs`에서 `createYouTubeJob`을 호출할 때 컨텍스트 객체에 `config`를 명시적으로 주입해야 합니다.
  ```javascript
  // electron/main.mjs
  const result = await createYouTubeJob(inputWithId, {
    paths,
    emit: sendJobEvent,
    outputDir: OUTPUT_DIR,
    jobDir: activeJobDir,
    ffmpegBin: FFMPEG_BIN,
    chromePath: config.chromePath,
    config, // <-- 명시적으로 전체 config 전달
  });
  ```

### 2.2 `spawnSync` 사용에 따른 Electron UI 블로킹(Freeze) 위험
* **현상**: `webwright-diagnostics-service.mjs`에서 `webwright` CLI 프로그램의 정상 설치 여부 및 도움말 작동을 확인하기 위해 `spawnSync`를 사용해 도움말 명령을 호출합니다.
* **원인**: Electron 메인 프로세스는 단일 스레드 이벤트 루프로 작동합니다. 만약 Windows의 PATH 검색 지연, 파이썬 인터프리터 로딩 지연 등으로 인해 `webwright --help` 실행이 지체되거나 행(Hang)이 걸릴 경우, 지정된 타임아웃(15000ms)이 경과할 때까지 Hermes 데스크톱 앱의 UI가 완전히 멈추고 윈도우가 응답하지 않는 현상(Not Responding)이 발생합니다.
* **대안**: CLI 헬프 체크 프로세스 역시 비동기식 `spawn`을 사용해 Promise로 래핑하여 메인 이벤트 루프를 방해하지 않도록 정합시켜야 합니다.

---

## 3. 워크플로우 및 SQLite DB 연동 개선 사항 (Workflow & Database Enhancements)

### 3.1 ChatGPT 실패 이벤트의 DB(task_failures 테이블) 누락 현상
* **현상**: ChatGPT 썸네일 생성이 실패하면 `local-composited` 방식의 로컬 그래픽 썸네일로 자동 복구(Fallback)되어 전체 작업은 `completed` 상태로 완료됩니다. 
* **원인**: 
  1. `pipeline/youtube-thumbnail.mjs` 내부에서 ChatGPT 에러 발생 시 단지 `createLocalCompositedThumbnail`을 반환할 뿐, 실패 사실을 알리는 이벤트를 전송하지 않습니다.
  2. `workflow-db-events.mjs` 내의 `isFailureEvent()` 판단기 역시 이 복구 흐름을 인지하지 못합니다.
* **결과**: ChatGPT 자동화 엔진에 로그인 만료(`CHATGPT_AUTH_REQUIRED`)나 Cloudflare 보안 체크(`CHATGPT_HUMAN_VERIFICATION_REQUIRED`) 등의 조치가 필요한 중요 실패가 발생했음에도 불구하고, SQLite 데이터베이스의 `task_failures` 테이블에 실패 건이 등록되지 않아 텔레그램 관리 봇 등에서 사후 진단을 내릴 수 없게 됩니다.
* **대안**: 
  1. ChatGPT 실패 시 썸네일 파이프라인에서 `workflow-warning` 형태의 이벤트를 명시적으로 발급하도록 구조화합니다.
  2. `workflow-db-events.mjs` 내의 `isFailureEvent` 함수에 `CHATGPT_`로 시작하는 에러 코드가 들어올 경우 실패 이벤트(`true`)로 판정하게 보완하여 `task_failures` 테이블에 에러가 안착되도록 합니다.
  ```javascript
  // workflow-db-events.mjs
  function isFailureEvent(event = {}) {
    return event.type === "desktop-job-failed"
      || event.details?.failureCode?.startsWith("CHATGPT_") // ChatGPT 관련 실패 필터 추가
      || ...
  }
  ```

### 3.2 Python DB 헬퍼(`bot_db_helper.py`)의 진단 로직 (`triageDiagnostic`) 보강
* **현상**: 텔레그램 `/diagnose` 명령어나 자동 보고 시스템은 SQLite DB에서 에러 정보를 파싱해 원인을 분류하는 `triageDiagnostic` 함수에 크게 의존합니다.
* **원인**: 현재 `bot_db_helper.py` 내의 `triageDiagnostic`은 ChatGPT 계열의 오류 접두사(Prefix)를 파싱하는 분기가 없어, 해당 오류가 적재되더라도 단순히 일반 시스템 버그(`handler_bug`, 신뢰도 65%)로 분류하고 맙니다.
* **개선책**: `triageDiagnostic` 함수 내에 `CHATGPT_AUTH_REQUIRED` 등의 패턴 매칭 분기를 추가하여 사용자에게 명확하고 차별화된 가이드라인을 제공하도록 업그레이드합니다.
  ```python
  # bot_db_helper.py
  if "CHATGPT_AUTH_REQUIRED" in errorText:
      failureType = "chatgpt_auth_required"
      rootCause = "ChatGPT is not authenticated in the browser profile."
      recommendedAction = "Run 'Authenticate ChatGPT' in Hermes Studio UI to log in."
      confidence = 0.95
  elif "CHATGPT_HUMAN_VERIFICATION_REQUIRED" in errorText:
      failureType = "chatgpt_human_verification"
      rootCause = "Cloudflare or security verification blocks ChatGPT."
      recommendedAction = "Complete the manual verification via 'Authenticate ChatGPT' window."
      confidence = 0.95
  ```

---

## 4. 자가진단 프로브 범위 및 동시성 관리 (Diagnostic Probe & Concurrency)

### 4.1 Composer 미검출 오류 시 진단 프로브 연계 확대
* **현상**: 계획서에서는 DALL-E 이미지 툴 메뉴 진입 실패(`CHATGPT_IMAGE_TOOL_NOT_FOUND`) 시점에만 `diagnoseChatGptThumbnailState` 진단 프로브를 실행하도록 구성되어 있습니다.
* **개선책**: 하지만 ChatGPT 자동화가 실패하는 가장 빈번한 지점은 로그인 풀림이나 Cloudflare 대기화면으로 인한 **Composer 미노출 단계**(`CHATGPT_COMPOSER_NOT_FOUND` 등)입니다. 따라서 초기 Composer 검색에 실패했을 때도 스크린샷 캡처와 함께 `diagnoseChatGptThumbnailState` 프로브를 `phase: "composer-search"` 단계로 호출하게 단일화하면 로그인 세션이 끊긴 시점의 HTML 구조와 비정상 버튼 구성 등을 완벽히 수집하여 리포팅 퀄리티를 대폭 높일 수 있습니다.

### 4.2 Webwright 수동 실행 시 브라우저 프로필 동시성 락 충돌 방지 가이드
* **현상**: Webwright CLI는 가공된 `task.md`를 기반으로 직접 브라우저(Playwright)를 기동합니다.
* **위험성**: 만약 Hermes 데스크톱 앱이 동일한 Chromium 사용자 프로필 경로(`chatgptProfileDir`)를 잡고 있는 동안 사용자가 터미널에서 `webwright run task.md`를 구동하면, 크롬 세션 잠금 충돌로 인해 사용자 세션이 깨지거나 프로세스가 강제 중단될 수 있습니다.
* **대안**: 작성되는 가이드 문서(`webwright-diagnostics-manual.md`) 및 CLI 권장 로그 메시지에 **"수동 진단을 실행하기 전에 실행 중인 Hermes Studio 브라우저를 반드시 종료해야 한다"**는 경고 가이드라인을 강력하게 기재해야 합니다.

---

## 5. 결론 (Conclusion)

본 구현 계획서는 매우 우수한 완성도를 갖추고 있으며, 위의 **다섯 가지 연동 개선안(Config 컨텍스트 연계, 비동기 CLI 탐색, DB 수신기 필터 추가, 파이썬 진단 모델 갱신, Composer 미검출 프로브 주입)**을 추가 반영한다면 운영체제 무결성을 유지하면서 오동작의 가시성과 복구력을 극대화한 최고 수준의 브라우저 자가진단 파이프라인을 구축할 수 있을 것입니다.

* **의견서 저장 위치**: `C:\Users\amd\hermes\HERMES_WEBWRIGHT_DIAGNOSTICS_REVIEW.md` (UTF-8 인코딩)
