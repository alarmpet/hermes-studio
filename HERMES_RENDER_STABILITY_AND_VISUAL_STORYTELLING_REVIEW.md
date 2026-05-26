# Hermes Desktop 렌더 안정성 및 비주얼 스토리텔링 계획서 검토 의견서

본 검토서는 `2026-05-25-desktop-render-stability-and-visual-storytelling-plan.md` 구현 계획서와 Hermes 프로젝트의 렌더링 파이프라인, 비디오 제작 워크플로우, 데이터베이스 및 관련 테스트 코드를 심층 분석한 결과입니다.

---

## 1. 계획서 내 잠재적 결함 및 개선 필요 사항

제안된 계획서는 패키징된 Electron 빌드에서 최종 렌더링 스크립트 실행 시 발생하는 Chromium 디스크 캐시 충돌 문제를 명확히 진단하고 해결책을 제시하며, AI 영상 생성 프롬프트의 질을 대폭 향상시키는 우수한 내용을 담고 있습니다. 다만, 실제 구현 시 오작동을 피하기 위해 다음 사항들을 추가로 보완해야 합니다.

### 1.1 `spawnSync` 잔존으로 인한 메인 프로세스 UI 프리징 문제 (치명적 UX 결함)
* **현황**: Task 1 Step 4에서는 캐시 충돌 문제를 해결하기 위해 `ELECTRON_RUN_AS_NODE=1` 환경 변수를 사용하도록 렌더 러너를 수정하지만, 여전히 **`spawnSync`를 사용한 동기식 프로세스 기동 방식**을 유지하고 있습니다.
* **문제점**: 앞서 진행 상태 UI 계획서 검토에서도 지적했듯이, `spawnSync`는 단일 스레드로 구동되는 Electron 메인 프로세스를 완전히 차단(Block)합니다.
  * 최종 영상 렌더링 및 자막 합성 과정은 상당한 시간(수분 소요)이 걸리는데, 이 시간 동안 Electron UI 창은 사용자의 클릭이나 창 이동 등에 반응하지 않고 멈춥니다.
  * 결과적으로 진행 상태 창에서 82% 단계(렌더링 단계)에 도달하자마자 화면이 "응답 없음" 상태로 먹통이 되어버리는 심각한 사용자 경험 저하를 유발합니다.
* **개선책**: 렌더링 과정을 비동기 `spawn`으로 실행하고 `Promise` 구조로 감싸서 메인 프로세스의 이벤트 루프가 계속 동작할 수 있도록 코드를 리팩토링해야 합니다.

### 1.2 테스트 스크립트 내 하드코딩된 절대 경로 문제
* **현황**: Task 1 Step 1의 `check-packaged-render-runner.mjs` 검증용 파일 상단에 아래와 같이 절대 경로가 하드코딩되어 있습니다:
  ```javascript
  const root = "C:/Users/amd/hermes";
  ```
* **문제점**: 검증 코드나 CI/CD 프로세스가 다른 머신 또는 다른 폴더 경로에서 작동할 경우, 해당 파일을 찾지 못해 무조건 에스트(Assert) 에러가 발생합니다.
* **개선책**: Node.js의 `import.meta.url` 및 `path` 라이브러리를 활용하여 상대적 경로로 프로젝트 루트를 동적으로 해석하게 수정해야 합니다.
  ```javascript
  import { dirname, resolve } from "node:path";
  import { fileURLToPath } from "node:url";
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const root = resolve(__dirname, "..");
  ```

### 1.3 로컬 스크립트 플래너(`script-planner.mjs`) 프롬프트의 단순 반복 문제
* **현황**: Task 2 Step 3에서 Gemini를 타지 않고 로컬에서 B-roll 프롬프트를 만드는 fallback 로직인 `inferVisualKeywords`는 4가지 예시 환경 환경(Environments) 목록을 배열로 가지고 있으며, 이를 장면 인덱스의 나머지 값(`(order - 1) % environments.length`)으로 매핑합니다.
* **문제점**: 만약 영상이 5장면 이상으로 구성될 경우, 1번 장면과 5번 장면에 완전히 동일한 프롬프트 텍스트(`a technician repairing equipment...`)가 할당됩니다.
  * 이는 Google Flow 영상 생성 시 동일하거나 매우 유사한 소스 영상이 중복되어 최종 비디오에 결합되는 품질 저하 문제를 야기합니다.
* **개선책**: 로컬 대체 플래너를 사용할 때에도 장면의 대본 일부(Narration Keywords)를 동적으로 추출하여 프롬프트 뒷부분에 믹싱하거나 덧붙여 주는 로직을 추가하여 중복성을 회피해야 합니다.

---

## 2. 데이터베이스(SQLite) 및 진단 시스템 관점의 개선 제안

### 2.1 크롬 캐시 및 렌더러 실패 정보의 SQLite DB 기록화
* **현황**: Task 3에서는 렌더링 실패 및 캐시 에러가 감지될 경우 사용자에게 `actionRequired` 메시지를 통해 경고하고 화면 콘솔 로그에 세부 내용을 표시합니다.
* **개선사항**: 렌더링 실패가 발생했을 때 단순 화면 로그에만 출력하는 것 외에, `bot_db_helper.py`의 `log-failure` CLI 명령을 연동하여 `bot_data.db`의 `task_failures` 테이블에 세부 STDERR 내용과 렌더 러너 모드(`HERMES_RENDER_RUNNER_MODE`)를 구조화된 에러 로그로 기록해야 합니다.
  * 이렇게 구성하면 사용자가 데스크톱에서 작업을 생성하다 오류가 났을 때, 메신저에서 `/diagnose` 명령어로 원인을 실시간 진단하여 "Chromium/Electron 충돌 방지 옵션 누락"이라는 정확한 진단 증거를 제공할 수 있어 운영 편의성이 대폭 향상됩니다.

---

## 3. 의견 요약 및 구현 제안 리팩토링 예시

### 비동기 방식의 렌더 프로세스 실행 로직 제안 (`youtube-workflow.mjs`)
기존 `renderFinalYouTubeVideo`를 동기식 `spawnSync`에서 비동기식 `spawn`으로 전환하고 Promise로 래핑하여 Electron UI 차단 문제를 해결한 버전입니다.

```javascript
import { spawn } from "node:child_process";

export async function renderFinalYouTubeVideo(job, assets = {}, context = {}) {
  if (typeof context.renderFinalVideo === "function") {
    return context.renderFinalVideo(job, assets, context);
  }

  const jobDir = resolve(assets.jobDir || resolveYouTubeJobDir(job, context));
  const finalName = context.finalName || process.env.HERMES_YOUTUBE_FINAL_NAME || `final-youtube-${Date.now()}.mp4`;
  const scriptPath = context.renderScriptPath || join(ROOT, "scripts/render-youtube-with-tts.mjs");
  
  const runner = resolveRenderNodeRunner(context);

  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(runner.command, [scriptPath, jobDir], {
      cwd: ROOT,
      env: {
        ...process.env,
        ...runner.env,
        HERMES_YOUTUBE_FINAL_NAME: finalName,
        HERMES_RENDER_RUNNER_MODE: runner.mode,
        ...(context.env || {}),
      }
    });

    let stdoutData = "";
    let stderrData = "";

    child.stdout.on("data", (chunk) => {
      stdoutData += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderrData += text;
      // 실시간으로 렌더 로그를 Electron UI 콘솔로 송출 가능
      context.emit?.({ type: "render-log", text }); 
    });

    child.on("close", (code) => {
      if (code !== 0) {
        // 캐시 충돌 및 GPU 에러에 대한 구조화된 경고 핸들링
        if (/Gpu Cache Creation failed|Unable to move the cache|disk_cache/i.test(stderrData)) {
          rejectPromise(new Error([
            "YouTube final render launched in Chromium/Electron mode instead of Node mode.",
            "This usually means the packaged app is using an old build or the render runner did not set ELECTRON_RUN_AS_NODE=1.",
            `Runner: ${runner.command}`,
            `Runner mode: ${runner.mode}`,
            `STDERR:\n${stderrData}`,
          ].join("\n")));
        } else {
          rejectPromise(new Error(`YouTube final render failed with exit code ${code}.\nSTDERR:\n${stderrData}`));
        }
        return;
      }

      const renderOutput = stdoutData.trim().match(/\{[\s\S]*\}\s*$/)?.[0] || "{}";
      let parsed = {};
      try {
        parsed = JSON.parse(renderOutput);
      } catch {
        parsed = {};
      }

      const finalPath = parsed.finalPath || join(jobDir, finalName);
      resolvePromise({ ...parsed, finalPath, jobDir });
    });
  });
}
```

---

## 4. 결론

1. **렌더 블로킹 완전 제거**: 비디오 생성 과정에서 가장 시간이 오래 걸리는 최종 렌더 단계를 **비동기 Promise 기반 `spawn`**으로 교체하여 UI 프리징 현상을 완전히 해결해야 합니다.
2. **테스트 이식성 강화**: 검증용 `scripts/check-packaged-render-runner.mjs` 파일 내부의 하드코딩된 절대 경로를 상대 경로 탐색 코드로 교체하여 어떤 배포 머신에서도 스모크 테스트가 정상적으로 돌 수 있도록 만듭니다.
3. **로컬 대체 프롬프트 다양화**:Fallback 플래너(`inferVisualKeywords`) 작동 시 장면 구성에 맞게 narration 단어를 결합해 줌으로써 중복 영상 생성을 억제합니다.
4. **진단 및 로그 기록 DB 연계**: 실패 로그가 SQLite DB에 연동되어 텔레그램 `/diagnose` 명령어로 모니터링될 수 있도록 CLI 호출 연계를 추천합니다.
