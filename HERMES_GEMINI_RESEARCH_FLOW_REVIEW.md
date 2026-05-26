# Hermes & Electron 통합 YouTube 워크플로우 개선 계획서 검토 의견서

본 의견서는 `2026-05-25-gemini-research-flow-workflow-fix-plan.md` 구현 계획서와 Hermes 프로젝트의 코드베이스, 자동화 모듈, 데이터베이스 구조를 종합 검토하여 발견된 문제점과 이를 보완하기 위한 권장 개선 사항을 담고 있습니다.

---

## 1. 계획서 내 치명적인 결함 및 개선 필요 사항

제안된 통합 계획서는 텔레그램 봇과 Electron 데스크톱 앱의 중복된 비디오 생성 파이프라인을 하나로 단일화하는 훌륭한 설계를 담고 있으나, **실제 환경에서 오작동을 유발할 수 있는 치명적인 설계 결함 및 구현 누락**이 발견되었습니다.

### 1.1 JSON 스트리밍 과정에서의 레이스 컨디션 (치명적)
* **현황**: `gemini-research-draft.mjs` 파일의 `waitForJsonResponse` 함수는 아래와 같이 구현되어 있습니다:
  ```javascript
  const jsonMatch = lastText.match(/\{[\s\S]*"scenes"[\s\S]*\}/);
  if (jsonMatch) return jsonMatch[0];
  ```
* **문제점**: 구글 Gemini 웹 UI는 텍스트를 실시간(Token-by-Token Streaming)으로 출력합니다. 따라서 대본 생성 중 중괄호가 열리고 `"scenes"`라는 키워드가 등장하는 즉시 위의 정규식 조건이 만족(Match)되어 함수가 리턴되어 버립니다.
  * 결과적으로 아직 닫히지 않은 **불완전하고 손상된 JSON 문자열**을 반환하게 되며, 상위 함수인 `parseJsonMarkdown`이 구문 분석에 실패하여 에러를 던집니다.
  * 이 에러는 OpenRouter Fallback으로 이어지기 때문에, 사용자는 Gemini 브라우저 자동화를 전혀 활용하지 못하고 매번 OpenRouter API 요금을 소모하게 됩니다.
* **개선책**: 반환하기 전에 해당 JSON 문자열이 완전히 닫히고 **실제로 파싱이 성공하는지 검증하는 로직**을 루프 내에 삽입해야 합니다.
  ```javascript
  const jsonMatch = lastText.match(/\{[\s\S]*"scenes"[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = parseJsonMarkdown(jsonMatch[0]);
    if (parsed) return jsonMatch[0]; // 정상 파싱이 완료된 완전한 데이터일 때만 리턴
  }
  ```

### 1.2 텔레그램 봇(`telegram-flow-news-bot.mjs`) 연동 시 정의되지 않은 변수 참조 오류 (실행 불가)
* **현황**: Task 4 Step 2에서는 텔레그램 봇 코드에 아래의 무명 객체를 전달하도록 정의하고 있습니다:
  ```javascript
  const stages = createDefaultYouTubeStages({
    paths: {
      flowProfileDir: FLOW_PROFILE_DIR,
      geminiProfileDir: GEMINI_PROFILE_DIR,
      appRoot: ROOT,
    },
    chromePath: CHROME_PATH,
    ffmpegBin: FFMPEG_BIN,
  });
  ```
* **문제점**: 텔레그램 봇 코드베이스에는 `FLOW_PROFILE_DIR`, `GEMINI_PROFILE_DIR`, `CHROME_PATH`, `FFMPEG_BIN`이라는 상수가 정의되어 있지 않습니다.
  * 이 수정안을 그대로 적용하면 텔레그램 봇을 기동할 때 `ReferenceError: CHROME_PATH is not defined` 등의 예외를 던지며 프로세스가 즉시 종료됩니다.
* **개선책**: 봇 내부의 기존 자원과 함수를 매핑하여 아규먼트를 주입해야 합니다:
  * `chromePath` ➔ 기존의 `findBrowser()` 실행 함수 활용
  * `flowProfileDir` ➔ 기존의 `PROFILE_DIR` (`.aistudio-browser-profile`) 상수 활용
  * `geminiProfileDir` ➔ 신규로 `.gemini-browser-profile` 추가 선언
  * `ffmpegBin` ➔ static 패키지 경로 탐색 또는 기본 환경 파일에서 획득

### 1.3 공동 스테이지에서의 Mock 모드 미지원
* **현황**: 계획서의 `youtube-workflow-stages.mjs` 구현안에서 `generateSceneMedia`는 무조건 실물 Playwright 자동화 엔진(`generateGoogleFlowVideoFromPrompt`)을 호출합니다.
* **문제점**: 데스크톱 개발 환경이나 패키징 자동 검증용 스모크 테스트(`smoke-electron-youtube-mock-job.mjs`)에서는 속도와 계정 쿼터 세이빙을 위해 `mockMediaMode: true`를 적극적으로 활용합니다.
  * 만약 이 상태에서 `generateSceneMedia`가 Playwright를 무조건 띄운다면, 테스트 환경에서 가상 브라우저 실행 실패 혹은 계정 락이 일어나 스모크 테스트 자체가 통과할 수 없습니다.
* **개선책**: `generateSceneMedia` 내부에 `job.options.mockMediaMode`를 분기하는 로직을 삽입하고, 기존 `youtube-job-service.mjs`에 존재하는 `generateMockMedia` 코드를 공동 스테이지 모듈(`youtube-workflow-stages.mjs`)로 이동시켜 통합 공급해야 합니다.

---

## 2. 데이터베이스(SQLite) 및 아키텍처 관점에서의 개선사항

### 2.1 데스크톱 작업의 SQLite DB(`bot_data.db`) 로그 누락 보완
* **현황**: 계획서에 명시된 워크플로우 이벤트 수집기는 UI 진행 정보 전달에만 집중해, SQLite DB 저장 이벤트를 생략하고 있습니다.
* **개선사항**: 데스크톱 Electron에서 실행되는 YouTube 작업 역시 `bot_db_helper.py`의 `log-event` 및 `upsert-job` CLI 명령을 연계 호출해야 합니다.
  * 이를 통해 텔레그램 메신저 대화방에서 `/diagnose <job_id>` 혹은 `/jobs` 명령어를 사용해 데스크톱에서 발생한 렌더러 이슈, API 키 소진 실패, 흐름 에러를 통합으로 관제하고 진단할 수 있는 기능을 완성할 수 있습니다.

### 2.2 브라우저 헤드리스(Headless) 구성 및 세션 제어 옵션화
* **현황**: 자동화 모듈 `gemini-research-draft.mjs`와 `google-flow-media.mjs`에서 Playwright는 `headless: false`로 강제 고정되어 있습니다.
* **개선사항**: 로컬 텔레그램 봇을 백그라운드 데몬(Daemon)으로 실행하거나 데스크톱 창 팝업을 원치 않는 사용자를 위해, `context.headless` 설정을 넘겨받아 동적으로 `headless: true/false`를 스위칭할 수 있도록 구성 방식을 변경해야 합니다.

---

## 3. 의견 요약 및 구현 제안 리팩토링 예시

### 보완된 `youtube-workflow-stages.mjs` (제안)
```javascript
import { generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "./youtube-workflow.mjs";
import { buildGeminiResearchDraft } from "./automation/gemini-research-draft.mjs";
import { generateGoogleFlowVideoFromPrompt } from "./automation/google-flow-media.mjs";
import { createThumbnailForJob } from "./pipeline/youtube-thumbnail.mjs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

export function createDefaultYouTubeStages(context = {}) {
  return {
    generateYouTubeWorkflowAssets,
    renderFinalYouTubeVideo: (job, assets, runnerContext) => renderFinalVideo(job, assets, { ...context, ...runnerContext }),
    buildDraft: (job, runnerContext) => buildResearchDraft(job, { ...context, ...runnerContext }),
    generateSceneMedia: (args) => generateSceneMedia(args, context),
    generateThumbnail: (result) => generateThumbnail(result, context),
  };
}

export async function buildResearchDraft(job, context = {}) {
  return buildGeminiResearchDraft(job, context);
}

export async function generateSceneMedia({ job, scene, jobDir }, context = {}) {
  // 1. Mock 모드인지 체크하여 브라우저 로딩 회피
  if (job?.options?.mockMediaMode) {
    return generateMockMedia({ scene, jobDir }, context);
  }

  const prompt = scene.image_prompt;
  const media = await generateGoogleFlowVideoFromPrompt({
    prompt,
    jobDir,
    sceneOrder: scene.order,
    chromePath: context.chromePath,
    profileDir: context.paths?.flowProfileDir,
    timeoutMs: context.flowTimeoutMs,
    onProgress: context.onFlowProgress,
  });
  return { path: media.path, bytes: media.bytes, contentType: media.contentType };
}

// 기존 youtube-job-service.mjs에서 공유 단계로 이동된 Mock 생성기
export async function generateMockMedia({ scene, jobDir }, context = {}) {
  const ffmpegBin = context.ffmpegBin;
  if (!ffmpegBin) throw new Error("ffmpegBin is required for Mock Media Mode.");
  const outputPath = join(jobDir, `scene_${scene.order}.mp4`);
  const colors = ["0f766e", "334155", "7c2d12", "4338ca", "166534", "9f1239"];
  const color = colors[(Number(scene.order || 1) - 1) % colors.length];
  const duration = Math.max(4, Number(scene.duration_seconds || 8));
  
  const result = spawnSync(ffmpegBin, [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0x${color}:s=720x1280:d=${duration}:r=30`,
    "-vf", "drawbox=x=54:y=96:w=612:h=260:color=black@0.28:t=fill",
    "-an",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "veryfast",
    "-crf", "22",
    outputPath,
  ], {
    cwd: context.paths?.appRoot || process.cwd(),
    encoding: "utf8",
  });
  
  if (result.status !== 0) {
    throw new Error(`Mock video generation failed: ${result.stderr}`);
  }
  return { path: outputPath };
}

export async function renderFinalVideo(job, assets, context = {}) {
  return renderFinalYouTubeVideo(job, assets, context);
}

export async function generateThumbnail(result, context = {}) {
  return createThumbnailForJob({
    draft: result.assets?.draft,
    paths: context.paths,
    jobDir: result.assets?.jobDir,
  });
}
```

---

## 4. 결론

1. **Gemini JSON 파싱 레이스 컨디션 제거**: `waitForJsonResponse` 내부 루프에서 `parseJsonMarkdown` 성공 여부를 확인한 후 반환하도록 반드시 보완해야 합니다.
2. **봇 연동 코드 변수 주입 안전성 검증**: `telegram-flow-news-bot.mjs`에서 변수 레퍼런스 에러가 발생하지 않도록 상수를 선언하거나 기존 함수(`findBrowser()`, `PROFILE_DIR`)를 정확히 매핑하여 아규먼트를 넘겨주어야 합니다.
3. **Mock 기능 마이그레이션**: 데스크톱 통합 테스트와 계정 절약을 보존하기 위해 공유 레이어 내부로 `generateMockMedia`를 흡수 통합해야 합니다.
4. **SQLite 로깅 파이프라인 정비**: 데스크톱 앱의 데이터 또한 `bot_data.db`에 축적될 수 있도록 이벤트를 연계하면 시스템 유지보수성과 원격 진단 유틸리티가 극대화됩니다.
