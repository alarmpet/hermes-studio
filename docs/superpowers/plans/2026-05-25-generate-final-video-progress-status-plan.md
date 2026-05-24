# Generate Final Video Progress Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Generate Final Video` 버튼을 누른 직후부터 최종 렌더 완료 또는 실패까지, 사용자가 현재 단계와 막힌 원인을 즉시 이해할 수 있는 진행상태 UI를 만든다.

**Architecture:** Electron main process와 desktop job service가 구조화된 `job-progress` 이벤트를 발행하고, renderer가 이 이벤트를 받아 단계형 진행 패널을 갱신한다. 현재 실제 실패 지점인 Google Flow 미연결 상태는 일반 에러 로그가 아니라 `조치 필요` 상태로 표시한다.

**Tech Stack:** Electron IPC, Node.js ESM, existing `youtube-job-service.mjs`, existing `youtube-job-runner.mjs`, existing `youtube-workflow.mjs`, Playwright Electron smoke test.

---

## 검토 및 검증 결과

이전 계획서에서 타당한 내용:

- `Generate Final Video` 클릭 직후 즉시 진행상태를 보여줘야 한다.
- 콘솔 로그에만 의존하지 말고 별도 Progress 패널이 필요하다.
- Google Flow 미연결은 사용자가 이해할 수 있는 `조치 필요` 메시지로 보여줘야 한다.
- `job-progress`처럼 구조화된 이벤트 계약을 두는 방향은 타당하다.
- Playwright로 패키징 앱을 직접 실행해 `구글 글래스` 키워드 smoke test를 하는 검증 방식은 타당하다.

수정이 필요한 내용:

- 기존 계획은 `generateFlowMedia()` 안에서 `context.job?.id`를 읽도록 했지만, 현재 `youtube-job-service.mjs`의 래퍼는 `context`에 `job`을 넣지 않는다. 그대로 구현하면 `jobId`가 비게 된다.
- CSS에서 `var(--text-primary)`, `var(--text-muted)`, `var(--border)`를 사용하도록 했지만 현재 `styles.css`에는 `--ink`, `--muted`, `--line`, `--accent`, `--danger`만 정의되어 있다.
- `scene-planning`, `tts`, `render` 단계는 `createYouTubeJob()` 한 곳에서만 처리하면 실제 워크플로우 경계와 어긋난다. `runYouTubeJob()` 호출 전후와 `generateSceneMedia` 래퍼에서 현실적으로 잡아야 한다.
- 실패 이벤트는 `main.mjs`에서 잡아야 renderer가 IPC reject와 별도로 안정적으로 받을 수 있다.
- 정적 체크는 필요하지만, 최종 수용 기준은 Playwright로 실제 packaged Electron 앱에서 버튼 클릭 후 Progress 패널이 바뀌는지 확인해야 한다.

---

## 현재 재현 결과

2026-05-25에 패키징 앱 `C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe`를 직접 실행해 키워드 `구글 글래스`로 `Generate Final Video`를 클릭했다.

실제 동작:

- 버튼 클릭 직후 `youtube:createJob` IPC는 호출된다.
- `job-started`와 `flow-scene-started` 이벤트도 발생한다.
- 첫 번째 장면에서 `generateFlowMedia()`가 아래 에러를 던져 작업이 실패한다.

```text
Google Flow media generation is required for scene 1, but the desktop Flow automation stage is not wired yet.
```

근본 원인:

- 작업은 시작되지만, Google Flow 실제 브라우저 자동화가 아직 구현되지 않은 stub 단계에서 실패한다.
- renderer는 `Running`, `Failed`, 콘솔 로그만 보여주고 `자료 확인중`, `대본 생성중`, `Google Flow 영상 생성중`, `조치 필요` 같은 큰 단계 표시가 없다.
- 실패 원인이 콘솔 아래쪽에만 쌓여 사용자는 버튼이 아무 반응이 없는 것으로 느낀다.

---

## File Structure

- Create: `C:\Users\amd\hermes\electron\services\job-progress-events.mjs`
  - 진행 단계 목록, 기본 메시지, percent, 이벤트 생성 함수를 중앙 관리한다.
- Modify: `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
  - desktop job 단계별 progress event를 발행하고, Flow 미연결을 `action-required`로 전환한다.
- Modify: `C:\Users\amd\hermes\electron\main.mjs`
  - IPC 실패도 `desktop-job-failed` 이벤트로 renderer에 전달한다.
- Modify: `C:\Users\amd\hermes\electron\renderer\index.html`
  - Generate 버튼 아래에 Progress 패널을 추가한다.
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
  - progress event를 받아 단계 패널, 현재 메시지, 버튼 상태를 갱신한다.
- Modify: `C:\Users\amd\hermes\electron\renderer\styles.css`
  - 현재 CSS 변수 체계에 맞는 progress 스타일을 추가한다.
- Create: `C:\Users\amd\hermes\scripts\check-desktop-progress-feedback.mjs`
  - 진행상태 UI와 이벤트 연결 계약을 정적으로 검증한다.
- Modify: `C:\Users\amd\hermes\package.json`
  - `npm run check`에 progress feedback 검증을 포함한다.

---

### Task 1: Progress Event Contract

**Files:**
- Create: `C:\Users\amd\hermes\electron\services\job-progress-events.mjs`

- [ ] **Step 1: Create the progress event module**

Create `C:\Users\amd\hermes\electron\services\job-progress-events.mjs`:

```js
export const JOB_PROGRESS_PHASES = [
  { id: "submitted", label: "작업 접수", percent: 5, message: "작업을 접수했습니다." },
  { id: "source-research", label: "자료 확인", percent: 12, message: "입력 자료를 확인하는 중입니다." },
  { id: "script-draft", label: "대본 생성", percent: 24, message: "대본 초안을 생성하는 중입니다." },
  { id: "scene-planning", label: "장면 구성", percent: 34, message: "대본을 장면 단위로 나누는 중입니다." },
  { id: "flow-media", label: "Google Flow 영상 생성", percent: 56, message: "Google Flow에서 장면 영상을 생성하는 중입니다." },
  { id: "render", label: "TTS/자막/최종 렌더", percent: 82, message: "음성, 자막, 최종 영상을 렌더링하는 중입니다." },
  { id: "thumbnail", label: "썸네일 생성", percent: 92, message: "영상 맥락을 반영한 썸네일을 준비하는 중입니다." },
  { id: "completed", label: "완료", percent: 100, message: "최종 영상 생성이 완료되었습니다." },
];

export function createJobProgressEvent({
  jobId = "",
  phase,
  status = "running",
  message,
  details = {},
  actionRequired = null,
}) {
  const phaseMeta = JOB_PROGRESS_PHASES.find((item) => item.id === phase);
  return {
    type: "job-progress",
    jobId,
    phase,
    status,
    label: phaseMeta?.label || phase,
    percent: phaseMeta?.percent || 0,
    message: message || phaseMeta?.message || phaseMeta?.label || phase,
    details,
    actionRequired,
    updatedAt: new Date().toISOString(),
  };
}

export function emitJobProgress(emit, event) {
  if (typeof emit !== "function") return;
  emit(createJobProgressEvent(event));
}
```

- [ ] **Step 2: Run syntax validation**

Run:

```powershell
node -e "import('./electron/services/job-progress-events.mjs').then((m)=>console.log(m.JOB_PROGRESS_PHASES.length))"
```

Expected:

```text
8
```

- [ ] **Step 3: Commit**

```powershell
git add electron/services/job-progress-events.mjs
git commit -m "feat: add desktop job progress event contract"
```

---

### Task 2: Backend Progress Events

**Files:**
- Modify: `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
- Modify: `C:\Users\amd\hermes\electron\main.mjs`

- [ ] **Step 1: Import the progress helper**

In `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`, add:

```js
import { emitJobProgress } from "./job-progress-events.mjs";
```

- [ ] **Step 2: Add stage-aware scene media wrapper**

In `createYouTubeJob(input, context = {})`, replace:

```js
  const generateSceneMedia = job.options.mockMediaMode
    ? (args) => generateMockMedia(args, context)
    : (args) => generateFlowMedia(args, context);
```

with:

```js
  const progressContext = { ...context, job };
  const generateSceneMedia = async (args) => {
    emitJobProgress(context.emit, {
      jobId: job.id,
      phase: "flow-media",
      message: `장면 ${args.scene.order} 영상을 생성하는 중입니다.`,
      details: { sceneOrder: args.scene.order, narration: args.scene.narration },
    });

    return job.options.mockMediaMode
      ? generateMockMedia(args, progressContext)
      : generateFlowMedia(args, progressContext);
  };
```

This is required because `youtube-workflow.mjs` calls `context.generateSceneMedia({ job, draft, scene, jobDir, renderOptions })`, but the service-level `context` object does not automatically contain `job`.

- [ ] **Step 3: Emit progress around the runner boundaries**

In `createYouTubeJob(input, context = {})`, after `const job = buildDesktopJobRequest(input);`, add:

```js
  emitJobProgress(context.emit, {
    jobId: job.id,
    phase: "submitted",
    message: "작업을 접수했습니다. 입력값을 정리하는 중입니다.",
    details: { sourceType: job.sourceType, sourceValue: job.sourceValue },
  });
```

After `await mkdir(jobDir, { recursive: true });`, add:

```js
  emitJobProgress(context.emit, {
    jobId: job.id,
    phase: "source-research",
    message: job.sourceType === "url" ? "URL 자료를 확인하는 중입니다." : "키워드 기반 자료를 확인하는 중입니다.",
  });
```

Before `const result = await runYouTubeJob(job, {`, add:

```js
  emitJobProgress(context.emit, {
    jobId: job.id,
    phase: "script-draft",
    message: "대본 초안과 장면 구성 정보를 생성하는 중입니다.",
  });
```

Inside the `runYouTubeJob(job, { ... })` options object, pass `job`:

```js
    job,
```

Before `const thumbnail = await createThumbnailForJob({`, add:

```js
  emitJobProgress(context.emit, {
    jobId: job.id,
    phase: "thumbnail",
    message: "최종 영상 맥락을 반영한 썸네일을 준비하는 중입니다.",
  });
```

Before `return { ...result, thumbnail };`, add:

```js
  emitJobProgress(context.emit, {
    jobId: job.id,
    phase: "completed",
    status: "completed",
    message: "최종 영상 생성이 완료되었습니다.",
    details: { finalPath: result.finalVideo?.finalPath, thumbnailPath: thumbnail?.path },
  });
```

- [ ] **Step 4: Surface Flow stub as action-required**

Change `generateFlowMedia` from:

```js
export async function generateFlowMedia({ scene }) {
  throw new Error(`Google Flow media generation is required for scene ${scene.order}, but the desktop Flow automation stage is not wired yet.`);
}
```

to:

```js
export async function generateFlowMedia({ scene }, context = {}) {
  emitJobProgress(context.emit, {
    jobId: context.job?.id || "",
    phase: "flow-media",
    status: "action-required",
    message: `장면 ${scene.order} Google Flow 영상 생성 단계에서 멈췄습니다.`,
    details: { sceneOrder: scene.order, narration: scene.narration },
    actionRequired: {
      title: "Google Flow 자동화 연결 필요",
      message: "현재 패키징 앱은 Google Flow 브라우저 자동 생성/다운로드 단계가 아직 연결되지 않았습니다. 이 단계가 구현되기 전까지 실제 최종 영상 생성은 진행할 수 없습니다.",
    },
  });
  throw new Error(`Google Flow automation is not wired yet for scene ${scene.order}.`);
}
```

- [ ] **Step 5: Emit render progress with a wrapper**

In `createYouTubeJob()`, before `const result = await runYouTubeJob(job, {`, add:

```js
  const renderFinalVideoWithProgress = async (runnerJob, assets, runnerContext) => {
    emitJobProgress(context.emit, {
      jobId: runnerJob.id,
      phase: "render",
      message: "TTS 음성, 자막, 최종 영상을 렌더링하는 중입니다.",
      details: { jobDir: assets.jobDir },
    });
    return renderFinalYouTubeVideo(runnerJob, assets, runnerContext);
  };
```

Then replace this option:

```js
    renderFinalYouTubeVideo,
```

with:

```js
    renderFinalYouTubeVideo: renderFinalVideoWithProgress,
```

- [ ] **Step 6: Emit failures from main IPC**

In `C:\Users\amd\hermes\electron\main.mjs`, wrap the existing `youtube:createJob` handler in `try/catch`:

```js
ipcMain.handle("youtube:createJob", async (_event, input) => {
  sendJobEvent({ type: "desktop-job-submitted", input });
  try {
    const result = await createYouTubeJob(input, {
      paths,
      emit: sendJobEvent,
      outputDir: OUTPUT_DIR,
      ffmpegBin: FFMPEG_BIN,
    });
    if (result.finalVideo?.jobDir) await writeDesktopResult(result.finalVideo.jobDir, result.finalVideo);
    latestCompletedJob = result;
    await upsertJob(paths.jobsDir, {
      id: result.job.id,
      title: result.assets?.draft?.title || result.job.sourceValue,
      sourceValue: result.job.sourceValue,
      status: "completed",
      jobDir: result.assets.jobDir,
      finalPath: result.finalVideo?.finalPath,
      thumbnailPath: result.thumbnail?.path,
      createdAt: result.job.createdAt,
    });
    sendJobEvent({ type: "desktop-job-finished", jobId: result.job.id, jobDir: result.assets.jobDir });
    return result;
  } catch (error) {
    sendJobEvent({
      type: "desktop-job-failed",
      message: error?.message || String(error),
      input,
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
});
```

- [ ] **Step 7: Run validation**

Run:

```powershell
npm.cmd run check
```

Expected: all existing checks pass.

- [ ] **Step 8: Commit**

```powershell
git add electron/main.mjs electron/services/youtube-job-service.mjs
git commit -m "feat: emit desktop youtube job progress events"
```

---

### Task 3: Renderer Progress Panel

**Files:**
- Modify: `C:\Users\amd\hermes\electron\renderer\index.html`
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\electron\renderer\styles.css`

- [ ] **Step 1: Add progress panel markup**

In `C:\Users\amd\hermes\electron\renderer\index.html`, insert this section immediately after the generator form:

```html
          <section class="panel progress-panel" aria-live="polite">
            <div class="panel-header">
              <h3>Progress</h3>
              <span id="jobProgressPercent">0%</span>
            </div>
            <div id="currentProgressMessage" class="progress-message">대기 중입니다.</div>
            <ol id="progressSteps" class="progress-steps">
              <li data-phase="submitted">작업 접수</li>
              <li data-phase="source-research">자료 확인</li>
              <li data-phase="script-draft">대본 생성</li>
              <li data-phase="scene-planning">장면 구성</li>
              <li data-phase="flow-media">Google Flow 영상 생성</li>
              <li data-phase="render">TTS/자막/최종 렌더</li>
              <li data-phase="thumbnail">썸네일 생성</li>
              <li data-phase="completed">완료</li>
            </ol>
            <div id="progressActionRequired" class="progress-action" hidden></div>
          </section>
```

- [ ] **Step 2: Add renderer selectors and helpers**

In `C:\Users\amd\hermes\electron\renderer\app.js`, near the other `document.querySelector` calls, add:

```js
const jobProgressPercent = document.querySelector("#jobProgressPercent");
const currentProgressMessage = document.querySelector("#currentProgressMessage");
const progressSteps = Array.from(document.querySelectorAll("#progressSteps [data-phase]"));
const progressActionRequired = document.querySelector("#progressActionRequired");
```

Add these helpers before the submit handler:

```js
const PROGRESS_PERCENT_BY_PHASE = {
  "submitted": 5,
  "source-research": 12,
  "script-draft": 24,
  "scene-planning": 34,
  "flow-media": 56,
  "render": 82,
  "thumbnail": 92,
  "completed": 100,
};

function resetProgressUi() {
  jobProgressPercent.textContent = "0%";
  currentProgressMessage.textContent = "작업을 기다리는 중입니다.";
  progressActionRequired.hidden = true;
  progressActionRequired.textContent = "";
  for (const step of progressSteps) {
    step.classList.remove("is-current", "is-complete", "is-failed", "is-action-required");
  }
}

function updateProgressUi(event) {
  if (!event || event.type !== "job-progress") return;
  const percent = Number(event.percent || 0);
  jobProgressPercent.textContent = `${percent}%`;
  currentProgressMessage.textContent = event.message || event.label || "진행 중입니다.";

  for (const step of progressSteps) {
    const stepPercent = PROGRESS_PERCENT_BY_PHASE[step.dataset.phase] || 0;
    step.classList.toggle("is-complete", stepPercent > 0 && stepPercent < percent);
    step.classList.toggle("is-current", step.dataset.phase === event.phase && event.status === "running");
    step.classList.toggle("is-failed", step.dataset.phase === event.phase && event.status === "failed");
    step.classList.toggle("is-action-required", step.dataset.phase === event.phase && event.status === "action-required");
  }

  if (event.actionRequired) {
    progressActionRequired.hidden = false;
    progressActionRequired.textContent = `${event.actionRequired.title}: ${event.actionRequired.message}`;
  }
}
```

- [ ] **Step 3: Show immediate feedback on submit**

In the submit handler, before `generateBtn.disabled = true;`, add:

```js
  resetProgressUi();
  updateProgressUi({
    type: "job-progress",
    phase: "submitted",
    status: "running",
    percent: 5,
    message: "작업을 접수했습니다. 곧 자료 확인을 시작합니다.",
  });
```

After `generateBtn.disabled = true;`, add:

```js
  generateBtn.textContent = "Generating...";
```

In the `finally` block, before `generateBtn.disabled = false;`, add:

```js
    generateBtn.textContent = "Generate Final Video";
```

- [ ] **Step 4: Consume progress events**

Replace:

```js
window.hermes.onYouTubeEvent((event) => {
  appendLog(event.type || "youtube:event", event);
});
```

with:

```js
window.hermes.onYouTubeEvent((event) => {
  if (event?.type === "job-progress") updateProgressUi(event);
  if (event?.type === "desktop-job-failed") {
    jobState.textContent = "Failed";
    currentProgressMessage.textContent = event.message || "작업이 실패했습니다.";
  }
  appendLog(event.type || "youtube:event", event);
});
```

- [ ] **Step 5: Add CSS using existing variables**

Append to `C:\Users\amd\hermes\electron\renderer\styles.css`:

```css
.progress-panel {
  display: grid;
  gap: 12px;
}

.progress-message {
  min-height: 24px;
  color: var(--ink);
  font-weight: 700;
}

.progress-steps {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.progress-steps li {
  min-height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 13px;
}

.progress-steps li::before {
  content: "";
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--line);
  flex: 0 0 auto;
}

.progress-steps li.is-complete {
  color: var(--ink);
}

.progress-steps li.is-complete::before {
  background: #16a34a;
}

.progress-steps li.is-current {
  color: var(--accent-strong);
  font-weight: 700;
}

.progress-steps li.is-current::before {
  background: var(--accent);
}

.progress-steps li.is-action-required,
.progress-steps li.is-failed {
  color: var(--danger);
  font-weight: 700;
}

.progress-steps li.is-action-required::before,
.progress-steps li.is-failed::before {
  background: var(--danger);
}

.progress-action {
  border: 1px solid #fecaca;
  background: #fff1f2;
  color: #991b1b;
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.45;
}
```

- [ ] **Step 6: Run validation**

Run:

```powershell
npm.cmd run check
```

Expected: all checks pass.

- [ ] **Step 7: Commit**

```powershell
git add electron/renderer/index.html electron/renderer/app.js electron/renderer/styles.css
git commit -m "feat: show final video progress in desktop ui"
```

---

### Task 4: Progress Feedback Regression Check

**Files:**
- Create: `C:\Users\amd\hermes\scripts\check-desktop-progress-feedback.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Create the static check**

Create `C:\Users\amd\hermes\scripts\check-desktop-progress-feedback.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const renderer = readFileSync(new URL("../electron/renderer/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../electron/renderer/index.html", import.meta.url), "utf8");
const service = readFileSync(new URL("../electron/services/youtube-job-service.mjs", import.meta.url), "utf8");
const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
const progress = readFileSync(new URL("../electron/services/job-progress-events.mjs", import.meta.url), "utf8");

assert.match(progress, /JOB_PROGRESS_PHASES/, "progress contract should define phases");
assert.match(html, /id="progressSteps"/, "renderer should contain progress steps");
assert.match(html, /id="currentProgressMessage"/, "renderer should contain current progress message");
assert.match(html, /id="progressActionRequired"/, "renderer should contain action-required message area");
assert.match(renderer, /function updateProgressUi/, "renderer should update progress UI from events");
assert.match(renderer, /event\?\.type === "job-progress"/, "renderer should consume job-progress events");
assert.match(renderer, /Generating\.\.\./, "generate button should change label while running");
assert.match(service, /progressContext = \{ \.\.\.context, job \}/, "job service should pass job into progress context");
assert.match(service, /emitJobProgress/, "job service should emit structured progress events");
assert.match(service, /status:\s*"action-required"/, "Flow stub should emit action-required state");
assert.match(service, /renderFinalVideoWithProgress/, "render stage should emit progress before final render");
assert.match(main, /desktop-job-failed/, "main process should emit desktop-job-failed events");

console.log("Desktop progress feedback contract OK");
```

- [ ] **Step 2: Add it to package checks**

In `C:\Users\amd\hermes\package.json`, add:

```json
"check:desktop-progress": "node scripts/check-desktop-progress-feedback.mjs"
```

Then append this to the existing `check` script:

```json
"&& npm run check:desktop-progress"
```

- [ ] **Step 3: Run the new check**

Run:

```powershell
npm.cmd run check:desktop-progress
```

Expected:

```text
Desktop progress feedback contract OK
```

- [ ] **Step 4: Run full checks**

Run:

```powershell
npm.cmd run check
```

Expected: all checks pass.

- [ ] **Step 5: Commit**

```powershell
git add package.json scripts/check-desktop-progress-feedback.mjs
git commit -m "test: guard desktop progress feedback wiring"
```

---

### Task 5: Packaged Electron Smoke Verification

**Files:**
- No source changes unless this smoke test reveals a defect.

- [ ] **Step 1: Rebuild packaged app**

Run:

```powershell
npm.cmd run electron:pack
```

Expected: electron-builder completes and updates `C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe`.

- [ ] **Step 2: Run manual-equivalent Playwright smoke**

Run:

```powershell
@'
const { _electron: electron } = require('playwright');
const exe = 'C:/Users/amd/hermes/dist-electron/win-unpacked/Hermes YouTube Studio.exe';

(async () => {
  const app = await electron.launch({ executablePath: exe });
  const page = await app.firstWindow();
  await page.waitForSelector('#sourceValue', { timeout: 15000 });
  await page.selectOption('#sourceType', 'keyword').catch(() => {});
  await page.fill('#sourceValue', '\uAD6C\uAE00 \uAE00\uB798\uC2A4');
  await page.click('#generateBtn');
  await page.waitForTimeout(3000);
  const state = await page.locator('#jobState').innerText();
  const message = await page.locator('#currentProgressMessage').innerText();
  const action = await page.locator('#progressActionRequired').innerText().catch(() => '');
  console.log(JSON.stringify({ state, message, action }, null, 2));
  if (!/Running|Failed|Preview Complete/.test(state)) throw new Error(`Unexpected state: ${state}`);
  if (!message || message === '대기 중입니다.') throw new Error('Progress message did not update.');
  if (state === 'Failed' && !/Google Flow|자동화|not wired/.test(`${message} ${action}`)) {
    throw new Error('Failure did not expose actionable Google Flow status.');
  }
  await app.close();
})();
'@ | node -
```

Expected while Flow is still unwired:

```json
{
  "state": "Failed",
  "message": "장면 1 Google Flow 영상 생성 단계에서 멈췄습니다.",
  "action": "Google Flow 자동화 연결 필요: 현재 패키징 앱은 Google Flow 브라우저 자동 생성/다운로드 단계가 아직 연결되지 않았습니다. 이 단계가 구현되기 전까지 실제 최종 영상 생성은 진행할 수 없습니다."
}
```

- [ ] **Step 3: Record the smoke result**

In the final implementation response, include:

```text
키워드 `구글 글래스`로 Generate 클릭 확인:
- 버튼 클릭 즉시 Progress가 `작업 접수`로 변경됨
- Flow 미연결 상태가 `조치 필요`로 표시됨
- 콘솔뿐 아니라 화면 패널에서도 실패 원인 확인 가능
```

- [ ] **Step 4: Commit if smoke required source tweaks**

If source files changed during smoke stabilization:

```powershell
git add electron scripts package.json
git commit -m "fix: stabilize desktop progress feedback smoke"
```

If no source changed, skip this commit.

---

## Acceptance Criteria

- `Generate Final Video` 클릭 후 1초 안에 Progress 패널 메시지가 `대기 중입니다.`에서 벗어난다.
- 사용자는 최소한 다음 단계를 구분해서 볼 수 있다: `작업 접수`, `자료 확인`, `대본 생성`, `장면 구성`, `Google Flow 영상 생성`, `TTS/자막/최종 렌더`, `썸네일 생성`, `완료`.
- Google Flow 자동화가 아직 연결되지 않은 경우 화면의 `조치 필요` 영역에 원인과 다음 작업이 보인다.
- 실패 시 버튼은 다시 활성화되고 텍스트는 `Generate Final Video`로 돌아온다.
- `npm.cmd run check`가 통과한다.
- 패키징 앱에서 키워드 `구글 글래스`로 smoke test를 실행했을 때 progress panel이 즉시 갱신된다.

## Self-Review

- Spec coverage: 직접 클릭 재현, 무반응 원인 확인, `자료 확인중/대본 생성중` 진행상태 계획, Flow 미연결 표시를 모두 포함했다.
- Red-flag scan: 실행 불가능한 미정 표현 없이 실제 파일, 함수, 코드, 명령을 명시했다.
- Type consistency: `job-progress`, `desktop-job-failed`, `action-required`, `progressActionRequired`, `updateProgressUi`, `progressContext` 이름을 모든 작업에서 일관되게 사용했다.
