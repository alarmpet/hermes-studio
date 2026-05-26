# Hermes Studio HPSL Duration V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hermes Studio가 유튜브 대본을 HPSL(후킹, 포인트, 스토리, 교훈) 구조로 생성하고, 프리셋/수동 길이 혼선을 제거해 60초 선택 시 영상이 반복되지 않도록 만든다.

**Architecture:** 대본 생성 프롬프트, draft schema, 장면 플래너, QA validator, Electron UI를 같은 계약으로 묶는다. `scriptLengthMode=preset`이면 `customDurationSeconds`를 무시하고 preset target만 사용하며, HPSL 섹션별 목표 시간과 장면 수를 기준으로 대본/장면/영상 프롬프트를 만든다.

**Tech Stack:** Electron renderer/main IPC, Node.js ESM workflow modules, Gemini browser automation, OpenRouter fallback, Google Flow automation, Supertonic TTS, ffmpeg render QA, existing `npm run check` smoke tests.

---

## Current Findings

- `C:\Users\amd\hermes\electron\renderer\index.html`의 `customDurationSeconds` 기본값이 `120`이다.
- `C:\Users\amd\hermes\electron\renderer\app.js`는 프리셋 모드에서도 `customDurationSeconds` 값을 항상 payload에 넣는다.
- `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`와 `C:\Users\amd\hermes\youtube-job-schema.mjs`는 기본 수동 길이를 `90`으로 둔다.
- `C:\Users\amd\hermes\youtube-workflow.mjs`는 `scriptLengthMode === "custom"`일 때만 수동 길이를 target으로 사용하므로 원칙상 preset 60초는 60초여야 한다.
- 하지만 UI에 120초가 계속 표시되고 payload에 들어가므로 사용자는 60초 프리셋을 골라도 120초 작업처럼 느낀다. 또한 장면 분배 오류가 생기면 마지막 장면에 전체 대본이 반복되어 실제로 영상이 두 번 반복되는 문제가 발생할 수 있다.
- 현재 대본 프롬프트는 일반적인 shorts draft schema다. HPSL 섹션을 명시적으로 강제하지 않기 때문에 훅, 핵심 포인트, 이야기 흐름, 교훈/마무리의 리듬이 안정적이지 않다.

## Product Direction

Hermes Studio V2는 “대본 생성기”가 아니라 “쇼츠 편집 감독”처럼 동작해야 한다.

- 사용자는 키워드/URL, 길이, 톤, 음성, 자막만 선택한다.
- 시스템은 HPSL 구조로 대본을 만들고, 각 섹션을 장면으로 나눈다.
- 영상 프롬프트는 각 HPSL 섹션의 목적에 맞는 B-roll을 생성한다.
- 렌더 전 QA가 대본 반복, 장면 길이 과다, 정지 화면 위험을 막는다.
- UI는 실제 적용 길이와 예상 장면 수를 즉시 보여준다.

---

## HPSL Contract

HPSL은 모든 draft에 다음 필드를 포함한다.

```json
{
  "structure": "HPSL",
  "hpsl": {
    "hook": {
      "goal": "첫 3초 안에 시청 이유를 만든다",
      "narration": "Korean narration",
      "target_seconds": 8
    },
    "point": {
      "goal": "핵심 사실과 결론을 짧게 말한다",
      "narration": "Korean narration",
      "target_seconds": 15
    },
    "story": {
      "goal": "배경, 전개, 쉬운 비유로 이해시킨다",
      "narration": "Korean narration",
      "target_seconds": 27
    },
    "lesson": {
      "goal": "시청자가 가져갈 교훈/주의점/행동을 남긴다",
      "narration": "Korean narration",
      "target_seconds": 10
    }
  },
  "script": "hook + point + story + lesson",
  "scenes": []
}
```

60초 기준 권장 배분:

| Section | Target | Role |
| --- | ---: | --- |
| Hook | 6-8s | 궁금증, 반전, 긴급성 |
| Point | 10-15s | 핵심 요약, 가장 중요한 한 문장 |
| Story | 28-34s | 배경, 맥락, 사례, 비유 |
| Lesson | 8-12s | 교훈, 주의점, 다음 행동 |

120초 기준은 같은 구조를 유지하되 Story를 2-3개 beat로 확장한다. 같은 HPSL 전체를 한 번 더 반복하지 않는다.

---

## Review Validation Update

`C:\Users\amd\hermes\HERMES_HPSL_DURATION_V2_REVIEW.md`를 현재 코드 구조와 대조해 검증한 결과, 다음 항목만 계획에 반영한다.

### Accepted Review Items

- HPSL section의 `target_seconds` 합계는 LLM이 항상 정확히 맞추지 못한다. `planScenesFromHpsl()` 내부에서 `targetSeconds / sum(section.target_seconds)` 방식으로 비례 scaling을 수행해야 한다.
- Story section을 여러 scene으로 나눌 때 균등 분배만 쓰면 짧은 문장과 긴 문장이 같은 영상 길이를 가져 TTS/영상 길이 불일치가 생긴다. Story 문장은 음절 수, 즉 공백 제거 글자 수에 비례해 duration을 배분해야 한다.
- 계획서의 테스트 코드 예시는 `import.meta.dirname`을 쓰면 Node 20.11 미만 또는 일부 Electron/Node 환경에서 깨질 수 있다. 모든 새 테스트 스크립트 예시는 `fileURLToPath(import.meta.url)`와 `dirname()` 조합으로 작성한다.
- HPSL structure와 section별 목표 시간은 운영 진단에 유용하다. 이미 `bot_db_helper.py`에 `jobs.workflow_json`과 `task_events`가 있고 `workflow-db-events.mjs`가 `log-event`를 호출하므로, 새 DB 테이블을 만들기보다 workflow event/details에 `scriptStructure`, `hpslOffsets`, `effectiveTargetSeconds`, `sceneSectionMap`을 넣어 SQLite에 남긴다.

### Rejected Or Deferred Review Items

- 별도 SQLite column을 추가하는 방식은 이번 단계에서는 보류한다. 기존 `workflow_json`/`task_events.data_json`에 구조화 payload를 넣는 편이 현재 코드와 migration 부담 면에서 더 안전하다.
- 리뷰 문서의 예시 코드에 있는 `import { splitKoreanSentences } from "./script-planner.mjs";`는 같은 파일 내부 구현 예시로는 맞지 않는다. 실제 구현은 `script-planner.mjs` 내부 export 함수들이 서로 직접 참조하거나, 테스트 파일에서만 외부 import한다.

---

## File Structure

- Modify: `C:\Users\amd\hermes\youtube-job-schema.mjs`
  - Default custom duration을 60초로 맞춘다.
  - `scriptStructure: "hpsl"` 옵션을 추가한다.
  - preset mode에서는 `effectiveTargetSeconds`가 preset target이라는 계약을 명확히 한다.

- Modify: `C:\Users\amd\hermes\electron\renderer\index.html`
  - 수동 길이 기본값을 60으로 바꾼다.
  - HPSL 구조 선택/고정 UI를 추가한다.
  - 실제 적용 길이 preview를 표시한다.

- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
  - `scriptLengthMode=preset`이면 UI preview에서 수동 길이를 비활성/보조 표시한다.
  - payload에는 `scriptStructure: "hpsl"`을 포함한다.
  - 실제 적용 길이와 예상 장면 수를 계산해 보여준다.

- Modify: `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
  - default custom duration을 60으로 통일한다.
  - job request에 `scriptStructure`를 전달한다.

- Modify: `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
  - Gemini prompt에 HPSL JSON schema와 섹션별 역할을 강제한다.
  - URL jobs는 기사 사실을 HPSL로 재구성하게 한다.

- Modify: `C:\Users\amd\hermes\electron\services\youtube-draft-service.mjs`
  - OpenRouter fallback도 동일한 HPSL schema를 출력하게 한다.
  - fallback이 HPSL을 못 지키면 draft QA에서 실패한다.

- Modify: `C:\Users\amd\hermes\electron\services\script-planner.mjs`
  - HPSL 섹션을 scene beat로 나누는 `planScenesFromHpsl()`을 추가한다.
  - HPSL 섹션별 target_seconds를 전체 targetSeconds에 맞춰 비례 scaling한다.
  - Story 문장은 음절 수에 비례해 duration을 배분한다.
  - 마지막 scene에 남은 시간을 몰아주지 않는다.

- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
  - `draft.hpsl`이 있으면 HPSL 기반 scene planner를 우선 사용한다.
  - preset target과 custom target을 하나의 `effectiveTargetSeconds`로 계산한다.

- Modify: `C:\Users\amd\hermes\scripts\youtube-draft-quality.mjs`
  - HPSL 섹션 누락, 전체 구조 반복, section target 초과를 잡는다.

- Modify: `C:\Users\amd\hermes\workflow-db-events.mjs`
  - HPSL metadata가 포함된 workflow event details를 SQLite `task_events`에 그대로 남기는지 static check로 보장한다.

- Create: `C:\Users\amd\hermes\scripts\check-hpsl-draft-structure.mjs`
  - HPSL schema, 순서, 길이, 반복 방지 검사.

- Create: `C:\Users\amd\hermes\scripts\check-duration-mode-contract.mjs`
  - preset 60초가 수동 120초 값에 오염되지 않는지 검사.

- Create: `C:\Users\amd\hermes\scripts\check-hpsl-workflow-observability.mjs`
  - HPSL metadata가 workflow event payload로 보존되는지 검사.

---

## Task 1: Duration Contract Fix

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-job-schema.mjs`
- Modify: `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
- Modify: `C:\Users\amd\hermes\electron\renderer\index.html`
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Create: `C:\Users\amd\hermes\scripts\check-duration-mode-contract.mjs`

- [ ] **Step 1: Write failing duration contract check**

Create `C:\Users\amd\hermes\scripts\check-duration-mode-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeYouTubeJobRequest, SCRIPT_LENGTH_PRESETS } from "../youtube-job-schema.mjs";
import { buildRenderOptions } from "../youtube-workflow.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const service = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");

assert.match(html, /id="customDurationSeconds"[^>]+value="60"/, "manual duration UI default must be 60, not 120");
assert.match(renderer, /effectiveTargetSeconds|updateDurationPreview/, "renderer should show the actual applied duration");
assert.match(service, /customDurationSeconds:\s*input\.customDurationSeconds\s*\|\|\s*60/, "desktop service default custom duration should be 60");

const job = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: {
    scriptLengthMode: "preset",
    scriptLengthPreset: "standard",
    customDurationSeconds: 120
  }
});
const renderOptions = buildRenderOptions(job);
assert.equal(SCRIPT_LENGTH_PRESETS.standard.targetSeconds, 60);
assert.equal(renderOptions.targetSeconds, 60, "preset 60s must ignore stale manual 120s value");

const customJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: {
    scriptLengthMode: "custom",
    scriptLengthPreset: "standard",
    customDurationSeconds: 120
  }
});
assert.equal(buildRenderOptions(customJob).targetSeconds, 120, "custom mode should use manual seconds");

console.log(JSON.stringify({ ok: true, checked: "duration-mode-contract" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-duration-mode-contract.mjs
```

Expected now: FAIL because UI default is `120` and renderer lacks duration preview.

- [ ] **Step 3: Fix defaults**

Change:

- `youtube-job-schema.mjs`: `customDurationSeconds: 60`
- `electron/services/youtube-job-service.mjs`: `customDurationSeconds: input.customDurationSeconds || 60`
- `electron/renderer/index.html`: `value="60"`
- `electron/renderer/app.js`: `customDurationSeconds: Number(... || 60)`

- [ ] **Step 4: Add actual duration preview**

In `electron/renderer/index.html`, under the length controls add:

```html
<div class="duration-summary" id="durationSummary">
  실제 적용 길이: 60초 · 예상 장면 5개 · HPSL
</div>
```

In `electron/renderer/app.js`, add:

```js
const durationSummary = document.querySelector("#durationSummary");
const presetSeconds = { micro: 30, short: 45, standard: 60, extended: 90 };
const presetScenes = { micro: 3, short: 4, standard: 5, extended: 6 };

function effectiveTargetSeconds() {
  const mode = document.querySelector("#scriptLengthMode").value;
  if (mode === "custom") return Math.max(15, Math.min(600, Number(document.querySelector("#customDurationSeconds").value || 60)));
  return presetSeconds[document.querySelector("#scriptLengthPreset").value] || 60;
}

function updateDurationPreview() {
  const seconds = effectiveTargetSeconds();
  const mode = document.querySelector("#scriptLengthMode").value;
  const preset = document.querySelector("#scriptLengthPreset").value;
  const customInput = document.querySelector("#customDurationSeconds");
  customInput.disabled = mode !== "custom";
  const scenes = mode === "custom" ? Math.max(3, Math.ceil(seconds / 10)) : (presetScenes[preset] || 5);
  durationSummary.textContent = `실제 적용 길이: ${seconds}초 · 예상 장면 ${scenes}개 · HPSL`;
}
```

Call `updateDurationPreview()` on load and on length input changes.

- [ ] **Step 5: Re-run check**

Run:

```powershell
node scripts/check-duration-mode-contract.mjs
```

Expected: PASS.

---

## Task 2: HPSL Draft Schema

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-job-schema.mjs`
- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-hpsl-draft-structure.mjs`

- [ ] **Step 1: Write failing HPSL schema check**

Create `C:\Users\amd\hermes\scripts\check-hpsl-draft-structure.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { normalizeYouTubeDraft } from "../youtube-workflow.mjs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const job = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: { scriptStructure: "hpsl" }
});
assert.equal(job.options.scriptStructure, "hpsl");

const draft = normalizeYouTubeDraft({
  title: "구글 글래스의 귀환",
  structure: "HPSL",
  hpsl: {
    hook: { narration: "구글 글래스가 다시 주목받는 이유, 생각보다 현실적입니다.", target_seconds: 7 },
    point: { narration: "핵심은 손을 쓰지 않고 정보를 확인하는 생산성입니다.", target_seconds: 13 },
    story: { narration: "공장, 병원, 여행 현장에서 사용자는 화면을 보지 않고도 다음 행동을 안내받습니다.", target_seconds: 30 },
    lesson: { narration: "하지만 촬영 알림과 개인정보 보호가 함께 설계되어야 합니다.", target_seconds: 10 }
  },
  script: "구글 글래스가 다시 주목받는 이유, 생각보다 현실적입니다. 핵심은 손을 쓰지 않고 정보를 확인하는 생산성입니다. 공장, 병원, 여행 현장에서 사용자는 화면을 보지 않고도 다음 행동을 안내받습니다. 하지만 촬영 알림과 개인정보 보호가 함께 설계되어야 합니다.",
  scenes: []
});

assert.equal(draft.structure, "HPSL");
assert.ok(draft.hpsl.hook.narration);
assert.ok(draft.hpsl.point.narration);
assert.ok(draft.hpsl.story.narration);
assert.ok(draft.hpsl.lesson.narration);
assert.match(draft.script, /구글 글래스/);

console.log(JSON.stringify({ ok: true, checked: "hpsl-draft-structure" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-hpsl-draft-structure.mjs
```

Expected now: FAIL because `scriptStructure` and normalized HPSL fields are not preserved.

- [ ] **Step 3: Add schema option**

In `youtube-job-schema.mjs`, add:

```js
scriptStructure: "hpsl",
```

Validate:

```js
if (!["hpsl"].includes(options.scriptStructure)) {
  throw new Error(`Unknown scriptStructure: ${options.scriptStructure}`);
}
```

- [ ] **Step 4: Preserve HPSL in draft normalization**

In `youtube-workflow.mjs`, update `normalizeYouTubeDraft()` to carry:

```js
structure: cleanText(value.structure || "HPSL").toUpperCase(),
hpsl: normalizeHpsl(value.hpsl, script),
```

Add `normalizeHpsl()` that returns `hook`, `point`, `story`, `lesson` objects with `narration` and `target_seconds`.

- [ ] **Step 5: Re-run check**

Run:

```powershell
node scripts/check-hpsl-draft-structure.mjs
```

Expected: PASS.

---

## Task 3: Gemini and OpenRouter HPSL Prompting

**Files:**
- Modify: `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
- Modify: `C:\Users\amd\hermes\electron\services\youtube-draft-service.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-hpsl-draft-structure.mjs`

- [ ] **Step 1: Extend test to inspect prompt sources**

Add to `check-hpsl-draft-structure.mjs`:

```js
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gemini = readFileSync(resolve(root, "automation/gemini-research-draft.mjs"), "utf8");
const openrouter = readFileSync(resolve(root, "electron/services/youtube-draft-service.mjs"), "utf8");

for (const source of [gemini, openrouter]) {
  assert.match(source, /HPSL|hook|point|story|lesson/i, "draft prompts must require HPSL");
  assert.match(source, /후킹|포인트|스토리|교훈|Hook|Point|Story|Lesson/i, "prompts must explain the HPSL roles");
}
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-hpsl-draft-structure.mjs
```

Expected now: FAIL until prompts mention HPSL.

- [ ] **Step 3: Update Gemini prompt**

In `automation/gemini-research-draft.mjs`, change schema to include:

```text
"structure":"HPSL",
"hpsl":{
  "hook":{"narration":"Korean hook","target_seconds":7},
  "point":{"narration":"Korean core point","target_seconds":13},
  "story":{"narration":"Korean story/context","target_seconds":30},
  "lesson":{"narration":"Korean lesson/closing","target_seconds":10}
}
```

Add rules:

- Hook must create curiosity in the first 3 seconds.
- Point must say the core fact or conclusion.
- Story must explain background with one concrete example or metaphor.
- Lesson must leave a useful takeaway or caution.
- Do not repeat the full HPSL script at the end.
- Total narration must fit the selected duration.

- [ ] **Step 4: Update OpenRouter fallback prompt**

Apply the same schema and rules to `electron/services/youtube-draft-service.mjs`.

- [ ] **Step 5: Re-run check**

Run:

```powershell
node scripts/check-hpsl-draft-structure.mjs
```

Expected: PASS.

---

## Task 4: HPSL Scene Planner

**Files:**
- Modify: `C:\Users\amd\hermes\electron\services\script-planner.mjs`
- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-hpsl-scene-planner.mjs`

- [ ] **Step 1: Write failing scene planner check**

Create `scripts/check-hpsl-scene-planner.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { planScenesFromHpsl } from "../electron/services/script-planner.mjs";

const hpsl = {
  hook: { narration: "구글 글래스가 다시 주목받는 이유, 생각보다 현실적입니다.", target_seconds: 7 },
  point: { narration: "핵심은 손을 쓰지 않고 정보를 확인하는 생산성입니다.", target_seconds: 13 },
  story: { narration: "공장에서는 작업자가 매뉴얼을 보며 장비를 고치고, 병원에서는 의사가 환자 정보를 즉시 확인합니다. 하지만 카메라가 켜져 있다는 사실을 주변 사람이 알아야 합니다.", target_seconds: 30 },
  lesson: { narration: "결국 성공 조건은 멋진 기기보다 신뢰를 주는 사용 경험입니다.", target_seconds: 10 }
};

const scenes = planScenesFromHpsl({
  title: "구글 글래스의 귀환",
  hpsl,
  targetSeconds: 60,
  characterProfile: "same Korean tech reporter in her early 30s"
});

assert.ok(scenes.length >= 5, "60s HPSL should create enough visual beats");
assert.deepEqual([...new Set(scenes.map((scene) => scene.section))], ["hook", "point", "story", "lesson"]);
assert.ok(scenes.every((scene) => !scene.narration.includes(hpsl.hook.narration + " " + hpsl.point.narration + " " + hpsl.story.narration)), "no scene should repeat the full script");
assert.ok(scenes.every((scene) => scene.duration_seconds <= 10), "single Flow scene should stay under 10 seconds target");
assert.ok(scenes.every((scene) => /Visual goal:|Action:|Camera:/.test(scene.image_prompt)), "each scene needs concrete visual prompt fields");
assert.equal(scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0), 60, "scaled HPSL scene durations must sum to targetSeconds");

const scaledScenes = planScenesFromHpsl({
  title: "구글 글래스의 귀환",
  hpsl: {
    hook: { narration: "짧은 훅입니다.", target_seconds: 7 },
    point: { narration: "핵심 포인트입니다.", target_seconds: 12 },
    story: { narration: "첫 문장입니다. 두 번째 문장은 훨씬 길어서 더 많은 설명과 화면 시간이 필요합니다.", target_seconds: 28 },
    lesson: { narration: "마무리 교훈입니다.", target_seconds: 10 }
  },
  targetSeconds: 90,
  characterProfile: "same Korean tech reporter in her early 30s"
});
assert.equal(scaledScenes.reduce((sum, scene) => sum + scene.duration_seconds, 0), 90, "HPSL raw section seconds must scale to custom target");
const storyScenes = scaledScenes.filter((scene) => scene.section === "story");
assert.ok(storyScenes.length >= 2, "story section should split into sentence beats");
assert.ok(storyScenes[1].duration_seconds >= storyScenes[0].duration_seconds, "longer story sentence should receive at least as much duration as shorter sentence");

console.log(JSON.stringify({ ok: true, checked: "hpsl-scene-planner", sceneCount: scenes.length }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-hpsl-scene-planner.mjs
```

Expected now: FAIL because `planScenesFromHpsl` is missing.

- [ ] **Step 3: Implement planner**

In `script-planner.mjs`, export `planScenesFromHpsl({ title, hpsl, targetSeconds, characterProfile })`.

Rules:

- Compute raw section sum from `hook.target_seconds`, `point.target_seconds`, `story.target_seconds`, and `lesson.target_seconds`.
- Scale section times with `scale = targetSeconds / rawSum`.
- Apply rounding correction to the lesson section so total scene duration equals `targetSeconds`.
- Hook: 1 scene.
- Point: 1-2 scenes.
- Story: split by sentences into 2-5 scenes.
- Lesson: 1 scene.
- Each scene target: 5-9 seconds, maximum 10.
- Never use full script fallback.
- Each scene keeps `section` and `sectionGoal`.
- Within Story, allocate sentence durations by syllable count instead of equal split.

Use this duration allocation pattern:

```js
function allocateSectionSeconds(hpsl, targetSeconds) {
  const raw = {
    hook: Number(hpsl?.hook?.target_seconds || 8),
    point: Number(hpsl?.point?.target_seconds || 15),
    story: Number(hpsl?.story?.target_seconds || 27),
    lesson: Number(hpsl?.lesson?.target_seconds || 10),
  };
  const rawSum = Math.max(1, raw.hook + raw.point + raw.story + raw.lesson);
  const scale = Number(targetSeconds || 60) / rawSum;
  const hook = Math.max(4, Math.round(raw.hook * scale));
  const point = Math.max(4, Math.round(raw.point * scale));
  const story = Math.max(4, Math.round(raw.story * scale));
  const lesson = Math.max(4, Number(targetSeconds || 60) - hook - point - story);
  return { hook, point, story, lesson };
}

function allocateBySyllables(sentences, totalSeconds) {
  const total = sentences.reduce((sum, sentence) => sum + sentence.replace(/\s+/g, "").length, 0) || 1;
  const items = sentences.map((sentence) => ({
    narration: sentence,
    duration_seconds: Math.max(4, Math.round((sentence.replace(/\s+/g, "").length / total) * totalSeconds)),
  }));
  const diff = totalSeconds - items.reduce((sum, item) => sum + item.duration_seconds, 0);
  if (items.length) items[items.length - 1].duration_seconds = Math.max(4, items[items.length - 1].duration_seconds + diff);
  return items;
}
```

- [ ] **Step 4: Use HPSL planner in workflow**

In `youtube-workflow.mjs`:

```js
if (job.options.scriptStructure === "hpsl" && draft.hpsl) {
  scenes = planScenesFromHpsl(...)
} else {
  scenes = planScenesFromScript(...)
}
```

- [ ] **Step 5: Re-run check**

Run:

```powershell
node scripts/check-hpsl-scene-planner.mjs
```

Expected: PASS.

---

## Task 5: HPSL QA Gate

**Files:**
- Modify: `C:\Users\amd\hermes\scripts\youtube-draft-quality.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-hpsl-qa-gate.mjs`

- [ ] **Step 1: Write failing HPSL QA check**

Create `scripts/check-hpsl-qa-gate.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateDraftQuality } from "./youtube-draft-quality.mjs";

const missingLesson = validateDraftQuality({
  draft: {
    structure: "HPSL",
    title: "테스트",
    script: "훅입니다. 포인트입니다. 스토리입니다.",
    hpsl: {
      hook: { narration: "훅입니다.", target_seconds: 7 },
      point: { narration: "포인트입니다.", target_seconds: 13 },
      story: { narration: "스토리입니다.", target_seconds: 30 }
    },
    scenes: [{ order: 1, narration: "훅입니다." }]
  },
  stage: "unit"
});
assert.equal(missingLesson.ok, false);
assert.equal(missingLesson.failureCode, "HPSL_SECTION_MISSING");

const repeatedHpsl = validateDraftQuality({
  draft: {
    structure: "HPSL",
    title: "테스트",
    script: "훅입니다. 포인트입니다. 스토리입니다. 교훈입니다.",
    hpsl: {
      hook: { narration: "훅입니다.", target_seconds: 7 },
      point: { narration: "포인트입니다.", target_seconds: 13 },
      story: { narration: "스토리입니다.", target_seconds: 30 },
      lesson: { narration: "교훈입니다.", target_seconds: 10 }
    },
    scenes: [
      { order: 1, narration: "훅입니다." },
      { order: 2, narration: "훅입니다. 포인트입니다. 스토리입니다. 교훈입니다." }
    ]
  },
  stage: "unit"
});
assert.equal(repeatedHpsl.ok, false);
assert.equal(repeatedHpsl.failureCode, "DUPLICATE_FULL_SCRIPT_SCENE");

console.log(JSON.stringify({ ok: true, checked: "hpsl-qa-gate" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-hpsl-qa-gate.mjs
```

Expected now: FAIL because HPSL section validation does not exist.

- [ ] **Step 3: Implement HPSL QA**

In `youtube-draft-quality.mjs`:

- If `draft.structure === "HPSL"`, require `hook`, `point`, `story`, `lesson`.
- Each section must have non-empty narration.
- Section target seconds must be positive.
- Total target seconds should be within 20% of job target if target is passed.
- Full script repetition remains a hard fail.

- [ ] **Step 4: Re-run check**

Run:

```powershell
node scripts/check-hpsl-qa-gate.mjs
```

Expected: PASS.

---

## Task 6: Studio V2 UX Upgrade

**Files:**
- Modify: `C:\Users\amd\hermes\electron\renderer\index.html`
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\electron\renderer\styles.css`
- Create: `C:\Users\amd\hermes\scripts\check-studio-v2-ux.mjs`

- [ ] **Step 1: Write failing UX check**

Create `scripts/check-studio-v2-ux.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const app = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const css = readFileSync(resolve(root, "electron/renderer/styles.css"), "utf8");

assert.match(html, /HPSL|후킹|포인트|스토리|교훈/, "UI should expose HPSL structure");
assert.match(html, /durationSummary/, "UI should show actual duration summary");
assert.match(html, /qualitySummary|qaSummary/, "UI should reserve space for QA summary");
assert.match(app, /updateDurationPreview/, "renderer should update duration preview");
assert.match(app, /scriptStructure:\s*"hpsl"/, "job payload should include HPSL script structure");
assert.match(css, /duration-summary|qa-summary/, "new Studio V2 summaries should be styled");

console.log(JSON.stringify({ ok: true, checked: "studio-v2-ux" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-studio-v2-ux.mjs
```

Expected now: FAIL.

- [ ] **Step 3: Add HPSL structure panel**

Add compact non-marketing UI inside the create form:

```html
<div class="structure-strip" aria-label="대본 구조">
  <span>후킹</span>
  <span>포인트</span>
  <span>스토리</span>
  <span>교훈</span>
</div>
```

- [ ] **Step 4: Add QA summary**

Add:

```html
<div id="qaSummary" class="qa-summary">QA 대기 중</div>
```

Update it from progress events when `qualityWarnings`, `freezeRisk`, or `requiresRegeneration` appears.

- [ ] **Step 5: Re-run UX check**

Run:

```powershell
node scripts/check-studio-v2-ux.mjs
```

Expected: PASS.

---

## Task 7: HPSL Workflow Observability

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
- Modify: `C:\Users\amd\hermes\workflow-db-events.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-hpsl-workflow-observability.mjs`

- [ ] **Step 1: Write failing observability check**

Create `scripts/check-hpsl-workflow-observability.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const dbEvents = readFileSync(resolve(root, "workflow-db-events.mjs"), "utf8");

assert.match(workflow, /scriptStructure/, "workflow should emit scriptStructure metadata");
assert.match(workflow, /hpslOffsets|hpslSectionSeconds/, "workflow should include HPSL section timing metadata");
assert.match(workflow, /sceneSectionMap/, "workflow should include scene-to-HPSL section mapping");
assert.match(dbEvents, /details:\s*event\.details/, "workflow DB mirror should preserve structured event details");

console.log(JSON.stringify({ ok: true, checked: "hpsl-workflow-observability" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-hpsl-workflow-observability.mjs
```

Expected now: FAIL until workflow emits HPSL metadata.

- [ ] **Step 3: Emit HPSL workflow metadata**

In `youtube-workflow.mjs`, after HPSL scene planning succeeds, emit:

```js
emit({
  type: "workflow-progress",
  jobId: job.id,
  phase: "scene-planning",
  message: "HPSL 장면 구성이 완료됐습니다.",
  details: {
    scriptStructure: "hpsl",
    effectiveTargetSeconds: renderOptions.targetSeconds,
    hpslOffsets: {
      hook: draft.hpsl.hook.target_seconds,
      point: draft.hpsl.point.target_seconds,
      story: draft.hpsl.story.target_seconds,
      lesson: draft.hpsl.lesson.target_seconds,
    },
    sceneSectionMap: draft.scenes.map((scene) => ({
      order: scene.order,
      section: scene.section,
      duration_seconds: scene.duration_seconds,
    })),
  },
});
```

- [ ] **Step 4: Keep DB schema unchanged**

Do not add a new SQLite table or column in this task. `workflow-db-events.mjs` already stores `event.details` in `task_events.data_json`, and `bot_db_helper.py` already stores job workflow in `jobs.workflow_json`.

- [ ] **Step 5: Re-run observability check**

Run:

```powershell
node scripts/check-hpsl-workflow-observability.mjs
```

Expected: PASS.

---

## Task 8: Verification and Packaging Gate

**Files:**
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Add checks to npm run check**

Add these scripts to the `check` chain:

```text
node ./scripts/check-duration-mode-contract.mjs
node ./scripts/check-hpsl-draft-structure.mjs
node ./scripts/check-hpsl-scene-planner.mjs
node ./scripts/check-hpsl-qa-gate.mjs
node ./scripts/check-studio-v2-ux.mjs
node ./scripts/check-hpsl-workflow-observability.mjs
```

- [ ] **Step 2: Run focused checks**

Run:

```powershell
node scripts/check-duration-mode-contract.mjs
node scripts/check-hpsl-draft-structure.mjs
node scripts/check-hpsl-scene-planner.mjs
node scripts/check-hpsl-qa-gate.mjs
node scripts/check-studio-v2-ux.mjs
node scripts/check-hpsl-workflow-observability.mjs
```

Expected: all PASS.

---

## 2026-05-25 Addendum: Comprehensive Review Validation

### Reviewed Document

검토 문서: `C:\Users\amd\hermes\HERMES_HPSL_DURATION_V2_COMPREHENSIVE_REVIEW.md`

이 리뷰 문서의 핵심 주장은 실제 코드와 다음처럼 대조했다.

- HPSL duration contract, HPSL QA, proportional scene splitting, workflow DB details 저장은 현재 코드와 대체로 일치한다.
- `workflow-db-events.mjs`가 `event.details`를 JSON payload로 `bot_db_helper.py log-event`에 넘기는 구조도 실제 코드와 일치한다.
- `workflow-db-events.mjs`가 `spawnSync`를 사용한다는 지적도 실제 코드와 일치한다.
- `structure-strip`이 정적 텍스트만 표시하고 HPSL 단계별 완료 상태를 시각적으로 보여주지 않는다는 지적도 실제 UI 코드와 일치한다.

### Accepted Items

1. **HPSL 구조 스트립 실시간 상태 표시**
   - 현재 UI는 `후킹`, `포인트`, `스토리`, `교훈`을 보여주지만, 단계별 진행 상태는 표시하지 않는다.
   - 사용자는 지금 어떤 HPSL 섹션이 만들어졌고, 어떤 섹션이 Flow/렌더 단계까지 갔는지 알 수 없다.
   - 이 항목은 UX에 직접적인 가치가 있으므로 계획서에 구현 태스크로 반영한다.

2. **DB 이벤트 로깅 비동기화 검토**
   - 현재 `mirrorWorkflowEventToDb()`는 `spawnSync()`를 사용한다.
   - 이벤트가 많아지면 Node 이벤트 루프를 짧게라도 막을 수 있고, 렌더/브라우저 자동화 상태 업데이트가 촘촘해질수록 비용이 누적될 수 있다.
   - 다만 현재 병목 증거는 없다. 따라서 즉시 대규모 리팩터가 아니라, "동작을 깨지 않는 비동기 mirror + 실패 무시/진단 유지" 방식의 선택적 안정화 태스크로 반영한다.

### Deferred or Rejected Items

- 리뷰 문서의 "프로덕션 사용 준비가 충분하다"는 결론은 보수적으로 받아들이지 않는다. 실제 Google Flow, Gemini, ChatGPT 인증 브라우저 경로는 외부 UI 변화와 계정 상태에 영향을 받으므로, 설치본 배포 전 실제 end-to-end 테스트가 별도로 필요하다.
- SQLite schema를 바꾸거나 별도 HPSL column을 추가하는 작업은 이번 계획에 넣지 않는다. 현재 `task_events.data_json`과 `jobs.workflow_json`이 구조화 payload를 저장할 수 있으므로 migration 비용 대비 이득이 작다.

---

## Task 13: HPSL Structure Strip Live Status

**Files:**
- Modify: `C:\Users\amd\hermes\electron\renderer\index.html`
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\electron\renderer\styles.css`
- Create: `C:\Users\amd\hermes\scripts\check-hpsl-strip-status-ui.mjs`

- [ ] **Step 1: Write failing UI status check**

Create `C:\Users\amd\hermes\scripts\check-hpsl-strip-status-ui.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const app = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const css = readFileSync(resolve(root, "electron/renderer/styles.css"), "utf8");

assert.match(html, /data-hpsl-section="hook"/, "HPSL strip should expose hook section");
assert.match(html, /data-hpsl-section="point"/, "HPSL strip should expose point section");
assert.match(html, /data-hpsl-section="story"/, "HPSL strip should expose story section");
assert.match(html, /data-hpsl-section="lesson"/, "HPSL strip should expose lesson section");
assert.match(app, /updateHpslStripStatus/, "renderer should update HPSL strip status from workflow details");
assert.match(app, /sceneSectionMap|hpslSectionSeconds/, "HPSL strip should react to planned section metadata");
assert.match(css, /is-hpsl-complete|is-hpsl-current/, "HPSL strip should have visible status states");

console.log(JSON.stringify({ ok: true, checked: "hpsl-strip-status-ui" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-hpsl-strip-status-ui.mjs
```

Expected: FAIL because the strip is static and has no status updater.

- [ ] **Step 3: Add section data attributes**

In `C:\Users\amd\hermes\electron\renderer\index.html`, replace the static strip spans with:

```html
<div class="structure-strip" aria-label="대본 구조">
  <span data-hpsl-section="hook">후킹</span>
  <span data-hpsl-section="point">포인트</span>
  <span data-hpsl-section="story">스토리</span>
  <span data-hpsl-section="lesson">교훈</span>
</div>
```

- [ ] **Step 4: Add renderer status updater**

In `C:\Users\amd\hermes\electron\renderer\app.js`, add:

```js
const hpslStripItems = Array.from(document.querySelectorAll("[data-hpsl-section]"));

function resetHpslStripStatus() {
  for (const item of hpslStripItems) {
    item.classList.remove("is-hpsl-current", "is-hpsl-complete", "is-hpsl-warning");
  }
}

function updateHpslStripStatus(details = {}) {
  if (!hpslStripItems.length) return;
  const sectionMap = Array.isArray(details.sceneSectionMap) ? details.sceneSectionMap : [];
  const completed = new Set(sectionMap.map((scene) => scene.section).filter(Boolean));
  for (const item of hpslStripItems) {
    const section = item.dataset.hpslSection;
    item.classList.toggle("is-hpsl-complete", completed.has(section));
    item.classList.toggle("is-hpsl-current", details.currentHpslSection === section);
    item.classList.toggle("is-hpsl-warning", Boolean(details.hpslWarnings?.[section]));
  }
}
```

Call `resetHpslStripStatus()` inside `resetProgressUi()`.

Call `updateHpslStripStatus(event.details || {})` inside `updateProgressUi()`.

- [ ] **Step 5: Add CSS states**

In `C:\Users\amd\hermes\electron\renderer\styles.css`, add:

```css
.structure-strip span.is-hpsl-current {
  border-color: var(--accent);
  color: white;
  background: var(--accent);
}

.structure-strip span.is-hpsl-complete {
  border-color: #16a34a;
  color: #166534;
  background: #dcfce7;
}

.structure-strip span.is-hpsl-warning {
  border-color: #f97316;
  color: #9a3412;
  background: #ffedd5;
}
```

- [ ] **Step 6: Re-run status UI check**

Run:

```powershell
node scripts/check-hpsl-strip-status-ui.mjs
```

Expected: PASS.

---

## Task 14: Non-Blocking Workflow DB Mirror

**Files:**
- Modify: `C:\Users\amd\hermes\workflow-db-events.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-workflow-db-nonblocking.mjs`

- [ ] **Step 1: Write failing non-blocking DB mirror check**

Create `C:\Users\amd\hermes\scripts\check-workflow-db-nonblocking.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(resolve(root, "workflow-db-events.mjs"), "utf8");

assert.match(source, /spawn\(/, "workflow DB mirror should use non-blocking spawn");
assert.doesNotMatch(source, /spawnSync\(/, "workflow DB mirror should not block the event loop with spawnSync");
assert.match(source, /unref\(\)/, "DB mirror child process should be detached from workflow completion");
assert.match(source, /mirrorWorkflowEventToDb/, "existing mirror API should remain available");

console.log(JSON.stringify({ ok: true, checked: "workflow-db-nonblocking" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-workflow-db-nonblocking.mjs
```

Expected: FAIL because `workflow-db-events.mjs` currently imports and uses `spawnSync`.

- [ ] **Step 3: Replace sync spawn with fire-and-forget spawn**

In `C:\Users\amd\hermes\workflow-db-events.mjs`, replace:

```js
import { spawnSync } from "node:child_process";
```

with:

```js
import { spawn } from "node:child_process";
```

Add helper:

```js
function spawnDbHelper(pythonBin, args, options = {}) {
  const child = spawn(pythonBin, args, {
    ...options,
    windowsHide: true,
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { ok: true, pid: child.pid || null };
}
```

Use it for both `log-event` and `log-failure`. Preserve `mirrorWorkflowEventToDb(event, context)` return shape enough for callers:

```js
return {
  ok: true,
  status: 0,
  stdout: "",
  stderr: "",
  failureStatus: isFailureEvent(event) ? 0 : null,
  failureStdout: "",
  failureStderr: "",
};
```

- [ ] **Step 4: Add safety note**

Do not make the main workflow fail if DB mirror spawning fails. If `spawn()` throws synchronously, catch it and return:

```js
{
  ok: false,
  status: 1,
  stdout: "",
  stderr: error?.message || String(error),
  failureStatus: null,
  failureStdout: "",
  failureStderr: ""
}
```

- [ ] **Step 5: Re-run DB mirror check**

Run:

```powershell
node scripts/check-workflow-db-nonblocking.mjs
```

Expected: PASS.

- [ ] **Step 6: Add to full check only after manual smoke**

Run:

```powershell
node scripts/check-workflow-db-nonblocking.mjs
npm.cmd run smoke:youtube-mock
npm.cmd run check
```

Expected: PASS.

Only then add `node ./scripts/check-workflow-db-nonblocking.mjs` to `package.json` `check`.

### Updated Acceptance Criteria From Comprehensive Review

- HPSL strip is no longer only static text; it reflects HPSL section completion or current section from workflow event details.
- `workflow-db-events.mjs` no longer blocks the Node event loop with `spawnSync()` if Task 14 is implemented.
- DB mirror failure must not fail video generation; it should remain diagnostic side-channel behavior.
- No SQLite schema migration is required for HPSL section data because structured event details are already stored as JSON.

- [ ] **Step 3: Run existing mock workflow**

Run:

```powershell
npm.cmd run smoke:youtube-mock
```

Expected: PASS and final mock video path printed.

- [ ] **Step 4: Run full check**

Run:

```powershell
npm.cmd run check
```

Expected: PASS.

- [ ] **Step 5: Manual app verification**

Run Electron locally, choose:

- input: `구글 글래스`
- mode: preset
- preset: 60초
- manual field: any value, but disabled unless custom
- structure: HPSL

Expected:

- UI shows `실제 적용 길이: 60초`.
- Generated draft contains hook, point, story, lesson.
- No scene repeats the full script.
- Render report has `requiresRegeneration:false`.
- Final video does not repeat the whole script twice.

---

## Acceptance Criteria

- 60초 프리셋은 항상 60초 target으로 처리된다.
- UI의 수동 길이 기본값은 60초이며, preset 모드에서는 수동 길이가 적용되지 않는다는 점이 명확히 보인다.
- 모든 draft는 HPSL 구조를 가진다.
- 영상 대본은 후킹, 포인트, 스토리, 교훈 순서로 자연스럽게 이어진다.
- 같은 HPSL 대본 전체가 마지막 장면에 반복되지 않는다.
- 120초 custom은 HPSL을 확장하되 같은 60초 대본을 두 번 반복하지 않는다.
- HPSL section target_seconds 합계가 실제 목표 길이와 달라도 scene durations는 `effectiveTargetSeconds`에 정확히 맞춰 scaling된다.
- Story section 안의 여러 문장은 음절 수 비례로 duration이 배분된다.
- Flow prompt는 HPSL section 목적을 반영한다.
- Draft QA, scene QA, render QA가 모두 `npm run check`에 포함된다.
- Hermes Studio UI는 실제 적용 길이, HPSL 구조, QA 상태를 바로 보여준다.
- HPSL structure, section timing, scene-section mapping은 workflow event details로 남아 `/diagnose`와 DB 분석에서 추적 가능해야 한다.

---

## 2026-05-25 Addendum: URL Source Transformation and Visual Grounding

### Codebase Review Result

현재 코드 기준으로 URL 기사 처리 방향은 "기사 원문을 그대로 복사하지 않고, 분석/요약/각색해서 HPSL 대본으로 재작성"하는 설계가 맞다.

- `C:\Users\amd\hermes\electron\services\youtube-draft-service.mjs`
  - URL 모드에서 `fetchArticleSource(job.sourceValue)`로 기사 HTML을 가져오고, `<title>`과 `<p>` 본문을 추출한다.
  - `systemPrompt()`에는 `Do not copy article sentences directly. Rewrite and transform.` 규칙이 있다.
  - `buildDraftPrompt()`는 `Create a Korean YouTube Shorts draft from this article source.`와 함께 기사 제목/본문을 모델에 넘긴다.
  - 현재 약점: 실제 결과가 원문 문장을 많이 복사했는지 자동 검사하지 않는다.

- `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
  - Gemini 경로에서도 `For URL jobs, rewrite and transform the article idea instead of copying.` 규칙이 있다.
  - HPSL schema와 Hook/Point/Story/Lesson 역할이 프롬프트에 들어간다.
  - 현재 약점: Gemini가 웹에서 직접 URL을 읽는 경우, 입력 기사 본문과 최종 대본의 유사도를 코드가 비교하지 못한다.

- `C:\Users\amd\hermes\youtube-workflow.mjs`
  - `normalizeYouTubeDraft()`가 HPSL 구조를 보존하고, 누락 시 `normalizeHpsl()`로 fallback을 만든다.
  - `generateYouTubeWorkflowAssets()`가 `planScenesFromHpsl()`을 우선 사용한다.
  - 현재 약점: fallback HPSL은 문장을 4등분하는 안전장치라, LLM이 HPSL을 제대로 안 준 경우 품질이 낮아질 수 있다. URL 기사 변환 실패를 명확히 실패 처리하는 QA가 더 낫다.

- `C:\Users\amd\hermes\electron\services\script-planner.mjs`
  - `planScenesFromHpsl()`이 HPSL 섹션별 narration을 장면으로 나누고 `buildVisualStoryPrompt()`를 호출한다.
  - `buildVisualStoryPrompt()`는 `Visual goal`, `Action`, `Scene keywords`, `Context keywords`, `Camera`를 포함한다.
  - `extractSceneKeywords()`가 각 장면 narration에서 핵심어를 추출한다.
  - 현재 방향은 "각 문장/장면 맥락과 핵심키워드 반영"이 맞다.
  - 현재 약점: HPSL section 이름과 sectionGoal이 프롬프트 안에 간접적으로만 들어가며, "기사 출처의 핵심 facts"와 "장면 prompt"의 대응 관계를 검증하는 테스트가 부족하다.

- `C:\Users\amd\hermes\scripts\youtube-draft-quality.mjs`
  - HPSL section 누락, placeholder, 전체 대본 반복, 인접 장면 중복은 잡는다.
  - 현재 약점: 기사 원문과 대본 사이의 n-gram/문장 유사도, 긴 원문 구절 복사, 출처 문장 그대로 사용을 잡지 못한다.

### Decision

현재 구현은 방향은 맞지만, 저작권 안전성과 기사 각색 품질을 "프롬프트 신뢰"에서 "검증 가능한 계약"으로 올려야 한다. 따라서 다음 개선사항을 이 계획에 추가한다.

1. URL 기사 원문과 최종 HPSL script/hpsl/scenes narration 사이의 유사도 QA를 추가한다.
2. URL 모드에서는 `sourceExcerpt` 또는 `article.body`를 draft QA에 전달해 복사 감지를 가능하게 한다.
3. LLM이 HPSL을 누락하면 조용히 4등분 fallback으로 진행하지 않고, URL 모드에서는 `HPSL_SECTION_MISSING` 또는 `ARTICLE_TRANSFORMATION_WEAK`로 재생성/실패 처리한다.
4. 각 scene `image_prompt`가 해당 scene narration의 핵심어와 HPSL section 목적을 반영하는지 정적/동적 테스트를 추가한다.
5. workflow event details에 `sourceTransformQa`, `articleSimilarity`, `visualGroundingQa`를 남겨 나중에 `/diagnose`에서 확인 가능하게 한다.

---

## Task 9: Article Transformation QA Gate

**Files:**
- Modify: `C:\Users\amd\hermes\scripts\youtube-draft-quality.mjs`
- Modify: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`
- Modify: `C:\Users\amd\hermes\automation\gemini-research-draft.mjs`
- Modify: `C:\Users\amd\hermes\electron\services\youtube-draft-service.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-article-transform-qa.mjs`

- [ ] **Step 1: Write the failing QA check**

Create `C:\Users\amd\hermes\scripts\check-article-transform-qa.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateDraftQuality } from "./youtube-draft-quality.mjs";

const articleBody = [
  "ABC전자는 오늘 새로운 스마트 안경을 공개했다.",
  "이 제품은 실시간 번역과 길 안내 기능을 제공하며 올해 하반기 출시될 예정이다.",
  "회사 관계자는 개인정보 보호를 위해 촬영 알림 기능을 강화했다고 밝혔다."
].join(" ");

const copied = validateDraftQuality({
  source: { mode: "url", body: articleBody, title: "ABC전자 스마트 안경 공개" },
  draft: {
    structure: "HPSL",
    title: "ABC전자 스마트 안경 공개",
    script: articleBody,
    hpsl: {
      hook: { narration: "ABC전자는 오늘 새로운 스마트 안경을 공개했다.", target_seconds: 7 },
      point: { narration: "이 제품은 실시간 번역과 길 안내 기능을 제공하며 올해 하반기 출시될 예정이다.", target_seconds: 13 },
      story: { narration: "회사 관계자는 개인정보 보호를 위해 촬영 알림 기능을 강화했다고 밝혔다.", target_seconds: 30 },
      lesson: { narration: "개인정보 보호를 위해 촬영 알림 기능을 강화했다고 밝혔다.", target_seconds: 10 }
    },
    scenes: [
      { order: 1, narration: "ABC전자는 오늘 새로운 스마트 안경을 공개했다." },
      { order: 2, narration: "이 제품은 실시간 번역과 길 안내 기능을 제공하며 올해 하반기 출시될 예정이다." }
    ]
  },
  stage: "unit"
});

assert.equal(copied.ok, false);
assert.equal(copied.failureCode, "ARTICLE_TEXT_TOO_SIMILAR");

const transformed = validateDraftQuality({
  source: { mode: "url", body: articleBody, title: "ABC전자 스마트 안경 공개" },
  draft: {
    structure: "HPSL",
    title: "스마트 안경이 다시 주목받는 이유",
    script: "스마트 안경 경쟁이 다시 뜨거워지고 있습니다. 핵심은 단순한 화면 표시가 아니라 번역, 이동 안내, privacy signal 같은 일상 기능입니다. 사용자는 손을 쓰지 않고 정보를 확인하지만, 촬영 알림과 데이터 보호가 함께 설계되어야 시장이 받아들일 수 있습니다.",
    hpsl: {
      hook: { narration: "스마트 안경 경쟁이 다시 뜨거워지고 있습니다.", target_seconds: 7 },
      point: { narration: "핵심은 화면 표시가 아니라 번역, 이동 안내, privacy signal 같은 일상 기능입니다.", target_seconds: 13 },
      story: { narration: "사용자는 손을 쓰지 않고 정보를 확인하지만, 주변 사람에게 촬영 여부가 보이는 장치가 신뢰를 좌우합니다.", target_seconds: 30 },
      lesson: { narration: "결국 성공 조건은 멋진 하드웨어보다 편리함과 privacy를 같이 잡는 경험입니다.", target_seconds: 10 }
    },
    scenes: [
      { order: 1, narration: "스마트 안경 경쟁이 다시 뜨거워지고 있습니다." },
      { order: 2, narration: "핵심은 화면 표시가 아니라 번역, 이동 안내, privacy signal 같은 일상 기능입니다." }
    ]
  },
  stage: "unit"
});

assert.equal(transformed.ok, true);
assert.ok(transformed.sourceTransformQa);
assert.ok(transformed.sourceTransformQa.maxSimilarity < 0.72);

console.log(JSON.stringify({ ok: true, checked: "article-transform-qa" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-article-transform-qa.mjs
```

Expected: FAIL because article source similarity QA does not exist yet.

- [ ] **Step 3: Implement article similarity helpers**

In `C:\Users\amd\hermes\scripts\youtube-draft-quality.mjs`, add:

```js
function splitSourceSentences(text = "") {
  return normalizeText(text)
    .split(/(?<=[.!?。！？]|다\.|요\.)\s+/u)
    .map((item) => item.trim())
    .filter((item) => Array.from(item).length >= 18);
}

function ngrams(text = "", size = 5) {
  const tokens = normalizeText(text).toLowerCase().split(/\s+/).filter(Boolean);
  const grams = [];
  for (let index = 0; index <= tokens.length - size; index += 1) {
    grams.push(tokens.slice(index, index + size).join(" "));
  }
  return new Set(grams);
}

function ngramOverlap(a = "", b = "", size = 5) {
  const left = ngrams(a, size);
  const right = ngrams(b, size);
  if (!left.size || !right.size) return 0;
  let hit = 0;
  for (const gram of left) if (right.has(gram)) hit += 1;
  return hit / Math.max(1, Math.min(left.size, right.size));
}

function validateArticleTransformation({ draft, source, stage, jobDir }) {
  if (source?.mode !== "url" || !normalizeText(source.body)) {
    return { ok: true, sourceTransformQa: null };
  }
  const draftText = [
    draft.script,
    draft.hpsl?.hook?.narration,
    draft.hpsl?.point?.narration,
    draft.hpsl?.story?.narration,
    draft.hpsl?.lesson?.narration,
    ...(Array.isArray(draft.scenes) ? draft.scenes.map((scene) => scene.narration) : [])
  ].map(normalizeText).join(" ");

  let maxSimilarity = 0;
  let copiedSentence = "";
  for (const sentence of splitSourceSentences(source.body)) {
    const similarity = Math.max(
      jaccardSimilarity(sentence, draftText),
      ngramOverlap(sentence, draftText, 5)
    );
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
      copiedSentence = sentence;
    }
  }

  const sourceTransformQa = {
    maxSimilarity: Number(maxSimilarity.toFixed(3)),
    copiedSentencePreview: copiedSentence.slice(0, 120)
  };

  if (maxSimilarity >= 0.72) {
    return {
      ok: false,
      failureCode: "ARTICLE_TEXT_TOO_SIMILAR",
      reason: "Draft appears to copy article source wording too closely.",
      sourceTransformQa,
      stage,
      jobDir
    };
  }
  return { ok: true, sourceTransformQa };
}
```

Then call it inside `validateDraftQuality({ draft, source, ... })` after placeholder validation and before scene repetition checks. Include `sourceTransformQa` in the success return.

- [ ] **Step 4: Pass source into draft QA**

In `C:\Users\amd\hermes\electron\services\youtube-draft-service.mjs`, return article source context with the draft when URL mode is used, or write it to `jobDir/article-source.json`.

In `C:\Users\amd\hermes\youtube-workflow-stages.mjs`, pass the source context into:

```js
validateDraftQuality({ draft, job, source: context.articleSource || draft.source, stage: "research" })
assertDraftQuality({ draft, job, source: context.articleSource || draft.source, stage: "research" })
```

If the exact source object is not available in Gemini mode, store at least:

```js
source: {
  mode: job.sourceType,
  url: job.sourceType === "url" ? job.sourceValue : "",
  title: draft.source_title || "",
  body: draft.source_excerpt || ""
}
```

- [ ] **Step 5: Re-run QA check**

Run:

```powershell
node scripts/check-article-transform-qa.mjs
```

Expected: PASS.

---

## Task 10: Strict URL HPSL Contract

**Files:**
- Modify: `C:\Users\amd\hermes\scripts\youtube-draft-quality.mjs`
- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-url-hpsl-strict-contract.mjs`

- [ ] **Step 1: Write failing strict URL contract check**

Create `C:\Users\amd\hermes\scripts\check-url-hpsl-strict-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateDraftQuality } from "./youtube-draft-quality.mjs";

const result = validateDraftQuality({
  job: { sourceType: "url" },
  source: { mode: "url", body: "원문 기사입니다. 핵심 내용은 스마트 안경 출시입니다." },
  draft: {
    title: "스마트 안경",
    script: "스마트 안경 출시 이야기입니다.",
    scenes: [
      { order: 1, narration: "스마트 안경 출시 이야기입니다." },
      { order: 2, narration: "시장 반응을 살펴봅니다." },
      { order: 3, narration: "주의점도 있습니다." }
    ]
  },
  stage: "unit"
});

assert.equal(result.ok, false);
assert.equal(result.failureCode, "HPSL_REQUIRED_FOR_URL_SOURCE");

console.log(JSON.stringify({ ok: true, checked: "url-hpsl-strict-contract" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-url-hpsl-strict-contract.mjs
```

Expected: FAIL because non-HPSL URL drafts can still be normalized by fallback.

- [ ] **Step 3: Enforce strict URL draft QA**

In `C:\Users\amd\hermes\scripts\youtube-draft-quality.mjs`, add before `validateHpslStructure()` returns success:

```js
if ((job?.sourceType === "url" || source?.mode === "url") && String(draft.structure || "").toUpperCase() !== "HPSL") {
  return {
    ok: false,
    failureCode: "HPSL_REQUIRED_FOR_URL_SOURCE",
    reason: "URL article jobs must produce an explicit HPSL draft instead of relying on fallback splitting.",
    stage,
    jobDir
  };
}
```

- [ ] **Step 4: Make fallback explicit in workflow**

In `C:\Users\amd\hermes\youtube-workflow.mjs`, keep `normalizeHpsl()` for old keyword drafts, but when `job.sourceType === "url"` and `draftInput.structure` or `draftInput.hpsl` is missing, fail before Flow generation:

```js
if (job.sourceType === "url" && (!draftInput?.hpsl || String(draftInput?.structure || "").toUpperCase() !== "HPSL")) {
  throw new Error("URL article draft must include explicit HPSL sections before scene planning.");
}
```

- [ ] **Step 5: Re-run strict contract check**

Run:

```powershell
node scripts/check-url-hpsl-strict-contract.mjs
```

Expected: PASS.

---

## Task 11: Visual Prompt Grounding QA

**Files:**
- Modify: `C:\Users\amd\hermes\electron\services\script-planner.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-hpsl-visual-grounding.mjs`

- [ ] **Step 1: Write failing visual grounding check**

Create `C:\Users\amd\hermes\scripts\check-hpsl-visual-grounding.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { planScenesFromHpsl } from "../electron/services/script-planner.mjs";

const scenes = planScenesFromHpsl({
  title: "AI 반도체 공급망",
  hpsl: {
    hook: { goal: "시청자가 왜 봐야 하는지 궁금하게 만든다", narration: "AI 반도체 공급망이 다시 흔들리고 있습니다.", target_seconds: 7 },
    point: { goal: "핵심 결론을 말한다", narration: "문제는 칩 성능보다 패키징과 전력 공급 병목입니다.", target_seconds: 13 },
    story: { goal: "구체적인 상황으로 이해시킨다", narration: "데이터센터는 더 많은 GPU를 원하지만, 냉각 장비와 전력 계약이 따라오지 못하면 서버는 제때 켜지지 않습니다.", target_seconds: 30 },
    lesson: { goal: "실행 가능한 교훈을 남긴다", narration: "그래서 AI 뉴스는 모델 발표뿐 아니라 공급망과 전력 인프라까지 같이 봐야 합니다.", target_seconds: 10 }
  },
  targetSeconds: 60,
  characterProfile: "same Korean technology reporter"
});

for (const scene of scenes) {
  assert.match(scene.image_prompt, new RegExp(scene.section, "i"), "prompt should include the HPSL section name");
  assert.match(scene.image_prompt, /Section goal:/, "prompt should include the section goal");
  assert.match(scene.image_prompt, /Scene keywords:/, "prompt should include narration-derived keywords");
  assert.match(scene.image_prompt, /Action:/, "prompt should include visible action");
  assert.doesNotMatch(scene.image_prompt, /person simply speaking|talking presenter reading/i, "prompt must avoid plain narration presenter scenes");
}

const combined = scenes.map((scene) => scene.image_prompt).join("\n");
assert.match(combined, /GPU|data.?center|cooling|power|supply|infrastructure/i, "visual prompts should preserve topic-specific core keywords");

console.log(JSON.stringify({ ok: true, checked: "hpsl-visual-grounding" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-hpsl-visual-grounding.mjs
```

Expected: FAIL until HPSL section name/goal are explicitly embedded in prompts.

- [ ] **Step 3: Add explicit HPSL visual context**

In `C:\Users\amd\hermes\electron\services\script-planner.mjs`, change `planScenesFromHpsl()` prompt construction to pass section context:

```js
image_prompt: buildVisualStoryPrompt({
  title,
  narration: scene.narration,
  order: index + 1,
  characterProfile,
  section: scene.section,
  sectionGoal: scene.sectionGoal
})
```

Update `buildVisualStoryPrompt()` signature:

```js
function buildVisualStoryPrompt({ title, narration, order, characterProfile, section = "", sectionGoal = "" }) {
```

Add lines near the top of the returned prompt:

```js
section ? `HPSL section: ${section}.` : "",
sectionGoal ? `Section goal: ${sectionGoal}.` : "",
```

- [ ] **Step 4: Re-run visual grounding check**

Run:

```powershell
node scripts/check-hpsl-visual-grounding.mjs
```

Expected: PASS.

---

## Task 12: Workflow Diagnostics for Copyright and Visual Grounding

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
- Modify: `C:\Users\amd\hermes\package.json`
- Create: `C:\Users\amd\hermes\scripts\check-source-transform-observability.mjs`

- [ ] **Step 1: Write failing observability check**

Create `C:\Users\amd\hermes\scripts\check-source-transform-observability.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(workflow, /sourceTransformQa/, "workflow events should expose source transformation QA");
assert.match(workflow, /articleSimilarity|ARTICLE_TEXT_TOO_SIMILAR/, "workflow should preserve article similarity diagnostics");
assert.match(workflow, /visualGroundingQa/, "workflow events should expose visual grounding QA");
assert.match(packageJson, /check-article-transform-qa\.mjs/, "npm run check should include article transform QA");
assert.match(packageJson, /check-hpsl-visual-grounding\.mjs/, "npm run check should include visual grounding QA");

console.log(JSON.stringify({ ok: true, checked: "source-transform-observability" }));
```

- [ ] **Step 2: Run and confirm failure**

Run:

```powershell
node scripts/check-source-transform-observability.mjs
```

Expected: FAIL until workflow events and package checks are updated.

- [ ] **Step 3: Emit QA diagnostics**

In `C:\Users\amd\hermes\youtube-workflow.mjs`, after `initialQa` and `plannedQa`, emit:

```js
emit({
  type: "workflow-progress",
  jobId: job.id,
  phase: "draft",
  message: "기사 각색 및 HPSL QA가 완료되었습니다.",
  details: {
    sourceTransformQa: initialQa.sourceTransformQa || null,
    articleSimilarity: initialQa.sourceTransformQa?.maxSimilarity ?? null
  }
});
```

After HPSL scene planning, add:

```js
visualGroundingQa: {
  sceneCount: draft.scenes.length,
  scenesWithKeywords: draft.scenes.filter((scene) => /Scene keywords:/i.test(scene.image_prompt || "")).length,
  scenesWithSectionGoal: draft.scenes.filter((scene) => /Section goal:/i.test(scene.image_prompt || "")).length
}
```

- [ ] **Step 4: Add new checks to npm run check**

In `C:\Users\amd\hermes\package.json`, add to the `check` chain:

```text
node ./scripts/check-article-transform-qa.mjs
node ./scripts/check-url-hpsl-strict-contract.mjs
node ./scripts/check-hpsl-visual-grounding.mjs
node ./scripts/check-source-transform-observability.mjs
```

- [ ] **Step 5: Run verification**

Run:

```powershell
node scripts/check-article-transform-qa.mjs
node scripts/check-url-hpsl-strict-contract.mjs
node scripts/check-hpsl-visual-grounding.mjs
node scripts/check-source-transform-observability.mjs
npm.cmd run smoke:youtube-mock
npm.cmd run check
```

Expected: all PASS.

### Updated Acceptance Criteria

- URL 기사 입력은 원문 문장을 그대로 대본으로 복사하지 않는다.
- URL 기사 입력은 명시적인 HPSL draft를 생성해야 하며 fallback 4등분만으로 통과하지 않는다.
- 기사 원문과 최종 script/HPSL/scenes narration의 유사도가 기준치를 넘으면 `ARTICLE_TEXT_TOO_SIMILAR`로 실패한다.
- 영상 프롬프트는 각 scene narration의 핵심어, HPSL section 이름, HPSL section goal, 구체적 Action, Camera 지시를 포함한다.
- 영상 프롬프트는 사람이 나와서 대본을 읽는 장면을 기본값으로 만들지 않고, B-roll, 시각적 비유, 실제 사용 상황, 문제 해결 장면을 우선한다.
- workflow event details에 `sourceTransformQa`, `articleSimilarity`, `visualGroundingQa`가 남아 콘솔 UI와 `/diagnose`에서 추적 가능해야 한다.
