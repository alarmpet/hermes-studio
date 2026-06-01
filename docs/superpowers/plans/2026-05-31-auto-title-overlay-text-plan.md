# Auto Title Overlay Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hermes Studio automatically generate the top video title text from the final draft title, HPSL hook/point, source keyword, or direct-script content when the user leaves `Title text` empty.

**Architecture:** Add a focused title overlay text resolver that runs after draft normalization and scene planning, because only then do we know the real script title, core message, and generated structure. Preserve manual user input as highest priority, persist generated text in `render-options.json`, `metadata.json`, `title-overlay.json`, and UI job output so the rendered video is reproducible.

**Tech Stack:** Electron renderer, shared YouTube job schema, Node.js ESM services, existing Hermes workflow/render pipeline, built-in `node:assert/strict` contract checks, Playwright Electron smoke workflow.

---

## File Structure

- Create: `electron/services/title-overlay-text-resolver.mjs`
  - Owns all automatic title text generation and sanitization.
  - Exports `resolveTitleOverlayText({ job, draft, sourceValue })`.
  - Does not call external LLMs; it uses already generated draft metadata and deterministic fallbacks.
- Modify: `youtube-workflow.mjs`
  - Import resolver.
  - Build final `renderOptions` after draft normalization has produced an automatic title overlay text.
  - Persist `metadata.titleOverlayTextSource`.
- Modify: `youtube-job-schema.mjs`
  - Add `titleOverlayMode: "auto" | "manual"` and normalize it.
  - Keep existing `titleOverlayText` field for manual overrides.
- Modify: `electron/services/youtube-job-service.mjs`
  - Pass `titleOverlayMode` from UI to normalized job options.
- Modify: `electron/renderer/index.html`
  - Change label/placeholder copy so users understand empty means automatic.
  - Add a compact read-only hint line: `Auto uses generated draft title when empty`.
- Modify: `electron/renderer/app.js`
  - Submit `titleOverlayMode: titleOverlayText ? "manual" : "auto"`.
  - Keep preview behavior but label empty preview as automatic.
- Modify: `scripts/check-title-overlay-render-contract.mjs`
  - Assert resolver exists, workflow imports it, and UI documents auto behavior.
- Create: `scripts/check-title-overlay-auto-text.mjs`
  - Contract tests for manual priority, draft title fallback, HPSL hook fallback, keyword fallback, Korean truncation, and unsafe punctuation cleanup.
- Modify: `scripts/run-title-overlay-ui-workflow.mjs`
  - Add a mode that leaves `#titleOverlayText` empty and verifies generated title text is persisted.
- Modify: `scripts/smoke-electron-youtube-mock-job.mjs`
  - Add an auto-title assertion while preserving the existing manual-title assertion through a second minimal job or a direct resolver check.
- Modify: `package.json`
  - Add `node scripts/check-title-overlay-auto-text.mjs` to `check:final-output-qa`.
- Modify: `timeline.md`
  - Add a dated entry for automatic top-title generation.

---

### Task 1: Add Deterministic Title Overlay Resolver

**Files:**
- Create: `C:\Users\amd\hermes\electron\services\title-overlay-text-resolver.mjs`
- Test: `C:\Users\amd\hermes\scripts\check-title-overlay-auto-text.mjs`

- [ ] **Step 1: Write the failing resolver contract test**

Create `scripts/check-title-overlay-auto-text.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { resolveTitleOverlayText } from "../electron/services/title-overlay-text-resolver.mjs";

const baseJob = {
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: {
    titleOverlayMode: "auto",
    titleOverlayText: "",
    titleOverlayMaxLines: 2,
  },
};

const draft = {
  title: "구글 글래스가 다시 주목받는 이유",
  hpsl: {
    hook: { narration: "구글 글래스는 실패한 제품처럼 보였습니다." },
    point: { narration: "하지만 AI 시대에는 전혀 다른 의미를 갖습니다." },
  },
  script: "구글 글래스는 실패한 제품처럼 보였습니다. 하지만 AI 시대에는 전혀 다른 의미를 갖습니다.",
};

assert.equal(
  resolveTitleOverlayText({
    job: { ...baseJob, options: { ...baseJob.options, titleOverlayMode: "manual", titleOverlayText: "직접 입력 제목" } },
    draft,
  }).text,
  "직접 입력 제목",
  "manual text must have highest priority",
);

assert.deepEqual(
  resolveTitleOverlayText({ job: baseJob, draft }),
  {
    text: "구글 글래스가 다시 주목받는 이유",
    source: "draft-title",
  },
  "auto mode should use draft.title first",
);

assert.equal(
  resolveTitleOverlayText({
    job: baseJob,
    draft: { ...draft, title: "", hpsl: { hook: draft.hpsl.hook } },
  }).source,
  "hpsl-hook",
  "auto mode should fall back to HPSL hook",
);

assert.deepEqual(
  resolveTitleOverlayText({
    job: baseJob,
    draft: { title: "", hpsl: {}, script: "" },
  }),
  {
    text: "구글 글래스",
    source: "source-value",
  },
  "auto mode should fall back to source keyword",
);

const longTitle = "이것은 너무 길어서 상단 타이틀로 쓰면 화면을 덮어버릴 가능성이 매우 높은 제목입니다";
const resolved = resolveTitleOverlayText({
  job: baseJob,
  draft: { title: longTitle, hpsl: {}, script: "" },
});
assert.ok(resolved.text.length <= 34, "auto title should be short enough for a two-line Shorts title");
assert.doesNotMatch(resolved.text, /[{}\[\]<>]/, "auto title should strip noisy bracket punctuation");

console.log(JSON.stringify({ ok: true, checked: "title-overlay-auto-text" }));
```

- [ ] **Step 2: Run the test and verify it fails**

Run:

```powershell
node scripts\check-title-overlay-auto-text.mjs
```

Expected: FAIL with `Cannot find module ... title-overlay-text-resolver.mjs`.

- [ ] **Step 3: Implement the resolver**

Create `electron/services/title-overlay-text-resolver.mjs`:

```js
const MAX_AUTO_TITLE_CHARS = 34;

export function resolveTitleOverlayText({ job = {}, draft = {}, sourceValue = "" } = {}) {
  const options = job.options || {};
  const manualText = cleanTitle(options.titleOverlayText || "");
  if (options.titleOverlayMode === "manual" && manualText) {
    return { text: manualText.slice(0, 80), source: "manual" };
  }

  const candidates = [
    ["draft-title", draft.title],
    ["hpsl-hook", draft.hpsl?.hook?.narration],
    ["hpsl-point", draft.hpsl?.point?.narration],
    ["script-first-sentence", firstSentence(draft.script)],
    ["source-value", sourceValue || job.sourceValue],
  ];

  for (const [source, value] of candidates) {
    const text = shortenAutoTitle(cleanTitle(value));
    if (text) return { text, source };
  }

  return { text: "오늘의 핵심 이야기", source: "default" };
}

function firstSentence(text = "") {
  return String(text).split(/(?<=[.!?。！？]|[.?!]\s|다\.)/u)[0] || "";
}

function cleanTitle(value = "") {
  return String(value)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[{}\[\]<>]/g, "")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenAutoTitle(value = "") {
  const cleaned = cleanTitle(value);
  if (!cleaned) return "";
  if (cleaned.length <= MAX_AUTO_TITLE_CHARS) return cleaned;
  const withoutEnding = cleaned
    .replace(/(입니다|습니다|했죠|하죠|합니다|됩니다|이에요|예요)[.!?。！？]?$/u, "")
    .trim();
  const target = withoutEnding || cleaned;
  return `${target.slice(0, MAX_AUTO_TITLE_CHARS - 1).trim()}…`;
}
```

- [ ] **Step 4: Run the resolver test and verify it passes**

Run:

```powershell
node scripts\check-title-overlay-auto-text.mjs
```

Expected: PASS with `{"ok":true,"checked":"title-overlay-auto-text"}`.

---

### Task 2: Add Schema Support for Auto vs Manual Mode

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-job-schema.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-youtube-job-schema.mjs`

- [ ] **Step 1: Write failing schema assertions**

Add these assertions to `scripts/check-youtube-job-schema.mjs` after the existing title overlay assertions:

```js
assert.equal(keywordJob.options.titleOverlayMode, "auto", "title overlay should default to auto mode");

const manualTitleJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: { titleOverlayText: "직접 쓴 상단 제목", titleOverlayMode: "manual" },
});
assert.equal(manualTitleJob.options.titleOverlayMode, "manual");
assert.equal(manualTitleJob.options.titleOverlayText, "직접 쓴 상단 제목");

assert.throws(
  () => normalizeYouTubeJobRequest({
    sourceType: "keyword",
    sourceValue: "구글 글래스",
    options: { titleOverlayMode: "bad-mode" },
  }),
  /Unknown titleOverlayMode/,
);
```

- [ ] **Step 2: Run schema check and verify it fails**

Run:

```powershell
node scripts\check-youtube-job-schema.mjs
```

Expected: FAIL because `titleOverlayMode` is not normalized.

- [ ] **Step 3: Implement schema normalization**

In `youtube-job-schema.mjs`, add to `DEFAULT_YOUTUBE_JOB_OPTIONS`:

```js
  titleOverlayMode: "auto",
```

Then add this after `options.titleOverlayEnabled` normalization:

```js
  options.titleOverlayMode = String(options.titleOverlayMode || (options.titleOverlayText ? "manual" : "auto")).toLowerCase();
  if (!["auto", "manual"].includes(options.titleOverlayMode)) {
    throw new Error(`Unknown titleOverlayMode: ${options.titleOverlayMode}`);
  }
  if (options.titleOverlayText && options.titleOverlayMode === "auto") {
    options.titleOverlayMode = "manual";
  }
```

- [ ] **Step 4: Run schema check and verify it passes**

Run:

```powershell
node scripts\check-youtube-job-schema.mjs
```

Expected: PASS with `{"ok":true,"checked":"youtube-job-schema"}`.

---

### Task 3: Resolve Auto Text After Draft Generation

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-title-overlay-render-contract.mjs`

- [ ] **Step 1: Add failing workflow contract assertions**

Add these assertions to `scripts/check-title-overlay-render-contract.mjs`:

```js
assert.match(workflow, /resolveTitleOverlayText/, "workflow should resolve automatic title overlay text after draft normalization");
assert.match(workflow, /titleOverlayTextSource/, "workflow metadata should expose the title overlay text source");
assert.match(workflow, /renderOptions\.titleOverlay\.text\s*=\s*resolvedTitleOverlay\.text/, "workflow should write resolved title into render options");
```

- [ ] **Step 2: Run contract check and verify it fails**

Run:

```powershell
node scripts\check-title-overlay-render-contract.mjs
```

Expected: FAIL because workflow does not import or call the resolver.

- [ ] **Step 3: Update workflow to resolve the text**

In `youtube-workflow.mjs`, add the import:

```js
import { resolveTitleOverlayText } from "./electron/services/title-overlay-text-resolver.mjs";
```

Inside `generateYouTubeWorkflowAssets`, after `let draft = normalizeYouTubeDraft(draftInput);` and after draft scene planning has finished, add:

```js
  const resolvedTitleOverlay = resolveTitleOverlayText({
    job,
    draft,
    sourceValue: job.sourceValue,
  });
  renderOptions.titleOverlay.text = resolvedTitleOverlay.text;
  renderOptions.titleOverlay.source = resolvedTitleOverlay.source;
  job.options.titleOverlayResolvedText = resolvedTitleOverlay.text;
  job.options.titleOverlayTextSource = resolvedTitleOverlay.source;
```

In the `metadata` object, add:

```js
    titleOverlayTextSource: job.options.titleOverlayTextSource || "",
```

- [ ] **Step 4: Run contract check and resolver check**

Run:

```powershell
node scripts\check-title-overlay-render-contract.mjs
node scripts\check-title-overlay-auto-text.mjs
```

Expected: both pass.

---

### Task 4: Wire UI Submission and Copy

**Files:**
- Modify: `C:\Users\amd\hermes\electron\renderer\index.html`
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-studio-v2-ux.mjs`

- [ ] **Step 1: Add failing UI contract assertions**

In `scripts/check-studio-v2-ux.mjs`, add:

```js
assert.match(html, /Auto uses generated draft title when empty/, "Top Title UI should explain automatic generated title behavior");
assert.match(app, /titleOverlayMode/, "Studio should submit titleOverlayMode");
assert.match(service, /titleOverlayMode/, "job service should forward titleOverlayMode");
```

If `service` is not already read in the script, add:

```js
const service = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");
```

- [ ] **Step 2: Run UI check and verify it fails**

Run:

```powershell
node scripts\check-studio-v2-ux.mjs
```

Expected: FAIL because the UI and service do not yet include the new mode/hint.

- [ ] **Step 3: Update UI copy**

In `electron/renderer/index.html`, change the `Title text` input placeholder:

```html
<input id="titleOverlayText" type="text" maxlength="80" placeholder="Auto from generated draft title">
```

Add this directly under the input:

```html
<small class="field-hint">Auto uses generated draft title when empty.</small>
```

- [ ] **Step 4: Submit title overlay mode from renderer**

In `electron/renderer/app.js`, inside `readJobInput()`, replace the title overlay lines with:

```js
    titleOverlayEnabled: Boolean(titleOverlayEnabled?.checked),
    titleOverlayMode: titleOverlayText?.value.trim() ? "manual" : "auto",
    titleOverlayText: titleOverlayText?.value.trim() || "",
    titleOverlayStyleId: titleOverlayStyleId?.value || "bold-black-accent",
```

In `updateTitleOverlayPreview()`, use this copy when the field is empty:

```js
  titleOverlayPreviewText.textContent = titleOverlayText?.value.trim() || "Auto: generated title";
```

- [ ] **Step 5: Forward mode through job service**

In `electron/services/youtube-job-service.mjs`, add:

```js
      titleOverlayMode: input.titleOverlayMode || (input.titleOverlayText ? "manual" : "auto"),
```

near the existing `titleOverlayText` mapping.

- [ ] **Step 6: Run UI check**

Run:

```powershell
node scripts\check-studio-v2-ux.mjs
```

Expected: PASS.

---

### Task 5: Verify Render Artifacts Use Generated Title

**Files:**
- Modify: `C:\Users\amd\hermes\scripts\run-title-overlay-ui-workflow.mjs`
- Modify: `C:\Users\amd\hermes\scripts\smoke-electron-youtube-mock-job.mjs`

- [ ] **Step 1: Update UI workflow to leave title text empty**

In `scripts/run-title-overlay-ui-workflow.mjs`, replace:

```js
  const titleText = "상단 제목 테스트";
```

with:

```js
  const expectedAutoTitle = "구글 글래스의 숨은 반전";
```

Leave the field empty:

```js
  await page.locator("#titleOverlayEnabled").check();
  await page.locator("#titleOverlayText").fill("");
```

Update the test script draft input so the direct script first line or mock draft title can resolve to `expectedAutoTitle`. If the workflow only uses direct script text, use this first sentence:

```js
const directScript = "구글 글래스의 숨은 반전. 실패한 제품처럼 보였던 기술이 AI 시대에 다시 주목받고 있습니다.";
```

Update assertions:

```js
    && titleOverlay?.enabled === true
    && titleOverlay?.title === expectedAutoTitle,
```

- [ ] **Step 2: Update mock smoke to assert auto metadata**

In `scripts/smoke-electron-youtube-mock-job.mjs`, add a second minimal resolver-driven assertion:

```js
assert.equal(titleOverlay.source, "draft-title", "mock job should record generated title source");
assert.ok(titleOverlay.title.length > 0, "mock job should render a non-empty generated title");
```

If the existing smoke job intentionally uses manual text, keep that test and add a new job request with `titleOverlayText: ""` and `titleOverlayMode: "auto"`.

- [ ] **Step 3: Run UI workflow and smoke test**

Run:

```powershell
node scripts\run-title-overlay-ui-workflow.mjs
npm.cmd run smoke:youtube-mock
```

Expected:
- UI workflow exits 0.
- `title-overlay.json` contains `source: "draft-title"` or `source: "script-first-sentence"`.
- Final mp4 exists.
- Smoke test exits 0.

---

### Task 6: Add Checks to Package Script and Timeline

**Files:**
- Modify: `C:\Users\amd\hermes\package.json`
- Modify: `C:\Users\amd\hermes\timeline.md`

- [ ] **Step 1: Add auto-title check to package scripts**

In `package.json`, append this command to `check:final-output-qa`:

```json
"node scripts/check-title-overlay-auto-text.mjs"
```

The final chain should include both:

```json
"node scripts/check-title-overlay-render-contract.mjs && node scripts/check-title-overlay-auto-text.mjs"
```

- [ ] **Step 2: Add timeline entry**

Add to `timeline.md`:

```markdown
## 2026-05-31 - Feature - Auto Top Title Text

- Added deterministic automatic top-title text resolution for empty `Title text` fields.
- Preserved manual title text as highest priority.
- Persisted generated title text and source in render artifacts so final videos can be audited.
- Added schema, UI, workflow, and render contract checks for automatic title overlay behavior.
```

- [ ] **Step 3: Run final verification**

Run:

```powershell
node scripts\check-title-overlay-auto-text.mjs
node scripts\check-title-overlay-render-contract.mjs
node scripts\check-studio-v2-ux.mjs
npm.cmd run check:final-output-qa
npm.cmd run check
```

Expected:
- All commands exit 0.
- `npm.cmd run check` includes `check-title-overlay-auto-text.mjs`.

---

## Acceptance Criteria

- If the user enters `Title text`, the final video uses exactly that text.
- If `Title text` is empty, Hermes uses the generated draft title first.
- If the draft title is empty or unusable, Hermes falls back to HPSL hook, HPSL point, first script sentence, source keyword/URL title, then `오늘의 핵심 이야기`.
- Generated text is short enough for the top overlay and strips noisy URL/bracket punctuation.
- The generated source is saved for debugging in `render-options.json`, `metadata.json`, and `title-overlay.json`.
- The UI clearly explains that an empty title field means automatic generation.
- Existing title overlay styles and manual behavior remain unchanged.

## Self-Review

- Spec coverage: The plan covers automatic text source priority, manual override, UI copy, workflow persistence, render artifacts, and tests.
- Placeholder scan: No placeholder implementation steps remain; every code-changing step includes exact snippets and commands.
- Type consistency: The plan consistently uses `titleOverlayMode`, `titleOverlayText`, `titleOverlayTextSource`, and `resolveTitleOverlayText`.
- Scope check: This plan is focused on title text generation only; it does not change title visual styles or external LLM prompting.
