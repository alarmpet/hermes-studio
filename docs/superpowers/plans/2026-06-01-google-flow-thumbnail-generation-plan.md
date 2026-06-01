# Google Flow Thumbnail Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the brittle ChatGPT thumbnail path with Google Flow image generation plus local Korean text composition so thumbnails are stable, readable, and strongly hook-driven.

**Architecture:** Google Flow becomes the primary thumbnail background provider. Hermes generates hook headline metadata from the title, script, HPSL sections, and scene prompts, asks Flow for a clean no-text thumbnail background, then renders Korean headline/subheadline locally with `sharp` using safe-zone and two-line layout rules. ChatGPT thumbnail automation remains only as legacy code, not the default production path.

**Tech Stack:** Electron, Node.js ESM, Playwright Google Flow automation, existing `generateGoogleFlowVideoFromPrompt` image mode, `sharp`, existing YouTube job runner/stages, contract checks under `scripts/`.

---

## Decision Summary

The current ChatGPT browser thumbnail path keeps failing because ChatGPT web automation can be blocked by Cloudflare/human verification and UI changes. The new production path should use the already authenticated Google Flow profile because Flow is already required for scene media.

However, Google Flow must not be trusted to render Korean text. The thumbnail prompt should explicitly ask for **no readable text, no captions, no logos, no watermarks**. Hermes should render all Korean text locally with `sharp`. This gives us both: Flow's visual generation and reliable Korean typography.

## Target User Flow

1. User generates a video in Hermes Studio.
2. After final render, thumbnail generation starts.
3. Hermes derives:
   - a short hook headline,
   - 1-2 highlighted Korean keywords,
   - a short subheadline,
   - a Flow background prompt reflecting the title/script context.
4. Google Flow image mode creates a clean cinematic thumbnail background.
5. Hermes composes Korean text locally over that background.
6. Upload panel shows video, title, description, tags, and the generated thumbnail for review.
7. User can upload to YouTube.

## File Structure

- Modify: `C:\Users\amd\hermes\pipeline\youtube-thumbnail-prompt.mjs`
  - Build Flow thumbnail background prompts and Korean overlay text plans.
- Modify: `C:\Users\amd\hermes\pipeline\youtube-thumbnail.mjs`
  - Replace ChatGPT-primary thumbnail generation with Flow-primary generation.
  - Keep local fallback, but rename behavior so fallback means "no Flow background available".
- Modify: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`
  - Pass `flowProfileDir`, `chromePath`, and `flowTimeoutMs` into the thumbnail generator.
- Modify: `C:\Users\amd\hermes\scripts\check-chatgpt-thumbnail-pipeline.mjs`
  - Replace ChatGPT-primary assertions with Flow-primary thumbnail assertions.
- Modify: `C:\Users\amd\hermes\scripts\check-local-studio-product.mjs`
  - Update product contract to say Flow is thumbnail background provider and Korean text is local.
- Create: `C:\Users\amd\hermes\scripts\check-flow-thumbnail-pipeline.mjs`
  - Dedicated contract test for Flow thumbnail generation.
- Modify: `C:\Users\amd\hermes\package.json`
  - Add `check:flow-thumbnail` and wire it into `npm run check`.
- Leave unchanged in this plan: `C:\Users\amd\hermes\automation\chatgpt-thumbnail-source.mjs`
  - Keep file for diagnostics/legacy reference during this change. Removal is explicitly out of scope for this Flow thumbnail implementation.

---

### Task 1: Add Flow Thumbnail Prompt and Overlay Plan

**Files:**
- Modify: `C:\Users\amd\hermes\pipeline\youtube-thumbnail-prompt.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-flow-thumbnail-pipeline.mjs`

- [ ] **Step 1: Write the failing Flow thumbnail contract**

Create `C:\Users\amd\hermes\scripts\check-flow-thumbnail-pipeline.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const prompt = readFileSync(resolve(root, "pipeline/youtube-thumbnail-prompt.mjs"), "utf8");
const thumbnail = readFileSync(resolve(root, "pipeline/youtube-thumbnail.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");

assert.match(prompt, /buildFlowThumbnailPrompt/, "thumbnail prompt module should export a Flow background prompt builder");
assert.match(prompt, /buildThumbnailOverlayPlan/, "thumbnail prompt module should export a local Korean overlay plan builder");
assert.match(prompt, /no readable text/i, "Flow thumbnail background prompt must prohibit readable text");
assert.match(prompt, /hookHeadline/, "overlay plan should include a hook headline");
assert.match(prompt, /highlightKeywords/, "overlay plan should include highlighted keywords");
assert.match(thumbnail, /generateGoogleFlowVideoFromPrompt/, "thumbnail pipeline should call Google Flow image generation");
assert.match(thumbnail, /outputMode:\s*"image"/, "thumbnail pipeline must request Flow image mode");
assert.match(thumbnail, /composeFlowThumbnail/, "thumbnail pipeline should locally compose Korean text");
assert.doesNotMatch(thumbnail, /generateChatGptThumbnail\(/, "ChatGPT should not be the production thumbnail provider");
assert.match(stages, /flowTimeoutMs:\s*context\.flowTimeoutMs/, "workflow stages should pass Flow timeout into thumbnail generation");
assert.match(stages, /flowProfileDir:\s*context\.paths\?\.flowProfileDir/, "workflow stages should pass Flow profile dir into thumbnail generation");

console.log(JSON.stringify({ ok: true, checked: "flow-thumbnail-pipeline" }));
```

- [ ] **Step 2: Run the failing contract**

Run:

```powershell
node scripts/check-flow-thumbnail-pipeline.mjs
```

Expected: FAIL because `buildFlowThumbnailPrompt`, `buildThumbnailOverlayPlan`, and Flow thumbnail calls do not exist yet.

- [ ] **Step 3: Replace the ChatGPT prompt builder with Flow background and overlay builders**

Replace `C:\Users\amd\hermes\pipeline\youtube-thumbnail-prompt.mjs` with:

```js
export function buildFlowThumbnailPrompt({ title, script, hpsl, aspectRatio = "9:16", visualContext = "" }) {
  const overlay = buildThumbnailOverlayPlan({ title, script, hpsl });
  const context = compactText([
    title,
    hpsl?.hook?.narration,
    hpsl?.point?.narration,
    visualContext,
    script,
  ].filter(Boolean).join(" "), 360);
  const canvas = aspectRatio === "16:9"
    ? "16:9 horizontal YouTube thumbnail background"
    : "9:16 vertical YouTube Shorts thumbnail background";

  return [
    `${canvas}.`,
    "Create one high-impact cinematic editorial thumbnail background image.",
    `Topic context: ${context}`,
    `Visual hook mood: ${overlay.hookMood}.`,
    "Show a clear central visual metaphor or dramatic moment that reflects the topic.",
    "Use strong contrast, expressive lighting, clean composition, and an empty dark area near the top for Hermes text overlay.",
    "No readable text, no subtitles, no captions, no logos, no brand marks, no watermarks.",
    "Avoid depicting identifiable real people; use generic roles, objects, environments, and symbolic B-roll.",
  ].join("\n");
}

export function buildThumbnailOverlayPlan({ title, script, hpsl }) {
  const source = compactText([
    title,
    hpsl?.hook?.narration,
    hpsl?.point?.narration,
    script,
  ].filter(Boolean).join(" "), 520);
  const hookHeadline = makeHookHeadline(title || source);
  const subheadline = makeSubheadline(source, hookHeadline);
  const highlightKeywords = chooseHighlightKeywords(hookHeadline, source);

  return {
    hookHeadline,
    subheadline,
    highlightKeywords,
    hookMood: inferHookMood(source),
  };
}

function makeHookHeadline(value) {
  const text = compactText(value, 80)
    .replace(/[.!?。！？]+$/g, "")
    .replace(/입니다|합니다|했어요|이에요|예요$/g, "");
  const clean = text || "이 장면 놓치면 손해";
  return balanceHeadline(clean, 18);
}

function makeSubheadline(source, headline) {
  const withoutHeadline = compactText(source.replace(headline, ""), 120);
  if (/왜|충격|반전|비밀|주의|위험|변화/.test(withoutHeadline)) return balanceHeadline(withoutHeadline, 20);
  return "지금 확인해야 할 핵심";
}

function chooseHighlightKeywords(headline, source) {
  const candidates = Array.from(new Set(`${headline} ${source}`.match(/[가-힣A-Za-z0-9]{2,12}/g) || []));
  const scored = candidates
    .filter((word) => !/그리고|하지만|오늘은|이제|있는지|합니다|입니다|대한|관련/.test(word))
    .map((word) => ({
      word,
      score: (/[A-Z0-9]/.test(word) ? 2 : 0)
        + (/AI|구글|삼성|애플|돈|요금|위험|충격|반전|비밀|주의|폭등|하락/i.test(word) ? 4 : 0)
        + Math.min(word.length, 8),
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((item) => item.word);
}

function inferHookMood(source) {
  if (/위험|주의|경고|논란|충격|폭락|사고/.test(source)) return "urgent warning";
  if (/비밀|반전|숨은|몰랐/.test(source)) return "mysterious reveal";
  if (/AI|기술|미래|혁신|구글|애플|삼성/.test(source)) return "futuristic curiosity";
  return "curiosity-driven reveal";
}

function balanceHeadline(value, maxChars) {
  const text = compactText(value, maxChars);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim();
}

function compactText(value, maxChars) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}
```

- [ ] **Step 4: Run the prompt contract again**

Run:

```powershell
node scripts/check-flow-thumbnail-pipeline.mjs
```

Expected: still FAIL because `pipeline/youtube-thumbnail.mjs` has not been changed yet.

---

### Task 2: Replace ChatGPT Primary Thumbnail With Flow Background Generation

**Files:**
- Modify: `C:\Users\amd\hermes\pipeline\youtube-thumbnail.mjs`

- [ ] **Step 1: Replace imports**

In `C:\Users\amd\hermes\pipeline\youtube-thumbnail.mjs`, replace the ChatGPT import block:

```js
import sharp from "sharp";
import { generateChatGptThumbnail } from "../automation/chatgpt-thumbnail-source.mjs";
import { buildThumbnailPrompt } from "./youtube-thumbnail-prompt.mjs";
```

with:

```js
import sharp from "sharp";
import { generateGoogleFlowVideoFromPrompt } from "../automation/google-flow-media.mjs";
import { buildFlowThumbnailPrompt, buildThumbnailOverlayPlan } from "./youtube-thumbnail-prompt.mjs";
```

- [ ] **Step 2: Replace `createThumbnailForJob`**

Replace the existing `createThumbnailForJob` function with:

```js
export async function createThumbnailForJob({
  draft,
  paths,
  jobDir,
  chromePath,
  aspectRatio = "9:16",
  emit,
  flowTimeoutMs,
}) {
  const overlayPlan = buildThumbnailOverlayPlan({
    title: draft?.title,
    script: draft?.script,
    hpsl: draft?.hpsl,
  });
  const prompt = buildFlowThumbnailPrompt({
    title: draft?.title,
    script: draft?.script,
    hpsl: draft?.hpsl,
    aspectRatio,
    visualContext: summarizeSceneVisuals(draft?.scenes),
  });

  emit?.({
    type: "workflow-progress",
    phase: "thumbnail",
    message: "Google Flow에서 썸네일 배경 이미지를 생성하는 중입니다.",
    details: {
      provider: "google-flow-image",
      aspectRatio,
      hookHeadline: overlayPlan.hookHeadline,
      highlightKeywords: overlayPlan.highlightKeywords,
    },
  });

  const flow = await generateGoogleFlowVideoFromPrompt({
    prompt,
    jobDir,
    sceneOrder: "thumbnail",
    chromePath,
    profileDir: paths?.flowProfileDir,
    outputMode: "image",
    aspectRatio,
    timeoutMs: flowTimeoutMs,
    onProgress: ({ message, details } = {}) => {
      emit?.({
        type: details?.eventType === "flow-policy-warning" ? "workflow-warning" : "workflow-progress",
        phase: details?.eventType || "thumbnail-flow-progress",
        message,
        details: {
          ...(details || {}),
          provider: "google-flow-image",
          thumbnail: true,
        },
      });
    },
  }).catch((error) => ({
    ok: false,
    code: error.code || error.details?.code || "FLOW_THUMBNAIL_GENERATION_FAILED",
    error: error.message,
    details: error.details || {},
  }));

  if (flow?.path) {
    return composeFlowThumbnail({
      backgroundPath: flow.path,
      overlayPlan,
      jobDir,
      aspectRatio,
    });
  }

  const fallback = await createLocalCompositedThumbnail({
    title: draft?.title,
    script: draft?.script,
    jobDir,
    aspectRatio,
    reason: flow.error || flow.message || "Google Flow thumbnail background generation failed",
  });
  return {
    ...fallback,
    primaryProvider: "google-flow-image",
    primaryProviderFailure: {
      ok: false,
      code: flow.code || "FLOW_THUMBNAIL_GENERATION_FAILED",
      message: flow.error || flow.message || "",
      actionRequired: Boolean(flow.details?.actionRequired),
      resultPath: join(jobDir, "flow-thumbnail-result.json"),
      details: flow.details || {},
    },
  };
}
```

- [ ] **Step 3: Add local Flow thumbnail compositor**

Add this function above `createLocalCompositedThumbnail`:

```js
export async function composeFlowThumbnail({ backgroundPath, overlayPlan, jobDir, aspectRatio = "9:16" }) {
  await mkdir(jobDir, { recursive: true });
  const outputPath = join(jobDir, "thumbnail-flow.png");
  const width = aspectRatio === "16:9" ? 1280 : 1080;
  const height = aspectRatio === "16:9" ? 720 : 1920;
  const titleLines = wrapKoreanTitle(overlayPlan.hookHeadline, aspectRatio === "16:9" ? 15 : 11, 2);
  const subline = wrapKoreanTitle(overlayPlan.subheadline, aspectRatio === "16:9" ? 18 : 13, 1)[0] || "";
  const titleFont = aspectRatio === "16:9" ? 82 : 96;
  const subFont = aspectRatio === "16:9" ? 42 : 52;
  const topPad = Math.round(height * 0.055);
  const bandHeight = Math.round(height * (aspectRatio === "16:9" ? 0.29 : 0.22));
  const lineGap = Math.round(titleFont * 1.05);
  const firstLineY = topPad + Math.round(titleFont * 0.95);
  const sublineY = firstLineY + (titleLines.length * lineGap) + Math.round(subFont * 0.45);
  const titleSvg = buildOverlaySvg({
    width,
    height,
    bandHeight,
    titleLines,
    subline,
    titleFont,
    subFont,
    firstLineY,
    lineGap,
    sublineY,
    highlightKeywords: overlayPlan.highlightKeywords || [],
  });

  await sharp(backgroundPath)
    .resize(width, height, { fit: "cover", position: "center" })
    .composite([{ input: Buffer.from(titleSvg), top: 0, left: 0 }])
    .png()
    .toFile(outputPath);

  return {
    ok: true,
    provider: "google-flow-image",
    path: outputPath,
    sourcePath: backgroundPath,
    overlayPlan,
  };
}
```

- [ ] **Step 4: Add overlay SVG helpers**

Add these helpers near the bottom of `C:\Users\amd\hermes\pipeline\youtube-thumbnail.mjs`:

```js
function buildOverlaySvg({
  width,
  height,
  bandHeight,
  titleLines,
  subline,
  titleFont,
  subFont,
  firstLineY,
  lineGap,
  sublineY,
  highlightKeywords,
}) {
  const centerX = Math.round(width / 2);
  const titleSpans = titleLines.map((line, index) => {
    const y = firstLineY + index * lineGap;
    return `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="Malgun Gothic, Pretendard, Arial, sans-serif" font-size="${titleFont}" font-weight="900" stroke="#000000" stroke-width="10" paint-order="stroke" fill="#ffffff">${colorKeywordSpans(line, highlightKeywords)}</text>`;
  }).join("\n");

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#050505" stop-opacity="0.88"/>
          <stop offset="1" stop-color="#050505" stop-opacity="0.62"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="${width}" height="${bandHeight}" fill="url(#band)"/>
      ${titleSpans}
      <text x="${centerX}" y="${sublineY}" text-anchor="middle" font-family="Malgun Gothic, Pretendard, Arial, sans-serif" font-size="${subFont}" font-weight="850" stroke="#000000" stroke-width="7" paint-order="stroke" fill="#fde047">${escapeXml(subline)}</text>
    </svg>`;
}

function colorKeywordSpans(line, highlightKeywords) {
  const escaped = escapeXml(line);
  const keyword = (highlightKeywords || []).find((item) => item && line.includes(item));
  if (!keyword) return escaped;
  const safeKeyword = escapeXml(keyword);
  return escaped.replace(safeKeyword, `<tspan fill="#fde047">${safeKeyword}</tspan>`);
}

function wrapKoreanTitle(value, maxCharsPerLine, maxLines) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if ([...next].length <= maxCharsPerLine) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  return lines.slice(0, maxLines);
}

function summarizeSceneVisuals(scenes = []) {
  return scenes
    .slice(0, 5)
    .map((scene) => [scene.visual_intent, scene.main_subject, scene.action, scene.setting].filter(Boolean).join(", "))
    .filter(Boolean)
    .join(" | ")
    .slice(0, 360);
}
```

- [ ] **Step 5: Run the Flow thumbnail contract**

Run:

```powershell
node scripts/check-flow-thumbnail-pipeline.mjs
```

Expected: PASS after Task 3 updates stage context; until then it may fail on `youtube-workflow-stages.mjs`.

---

### Task 3: Pass Flow Context From Workflow Stages

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-workflow-stages.mjs`

- [ ] **Step 1: Update `generateThumbnail` call**

Replace:

```js
  return createThumbnailForJob({
    draft: result.assets?.draft,
    paths: context.paths,
    jobDir: result.assets?.jobDir,
    chromePath: context.chromePath,
    aspectRatio: result.job?.options?.aspectRatio || context.job?.options?.aspectRatio || "9:16",
    emit: context.emit,
  });
```

with:

```js
  return createThumbnailForJob({
    draft: result.assets?.draft,
    paths: context.paths,
    flowProfileDir: context.paths?.flowProfileDir,
    jobDir: result.assets?.jobDir,
    chromePath: context.chromePath,
    flowTimeoutMs: context.flowTimeoutMs,
    aspectRatio: result.job?.options?.aspectRatio || context.job?.options?.aspectRatio || "9:16",
    emit: context.emit,
  });
```

- [ ] **Step 2: Run the new contract**

Run:

```powershell
node scripts/check-flow-thumbnail-pipeline.mjs
```

Expected: PASS.

---

### Task 4: Update Existing Product Contracts

**Files:**
- Modify: `C:\Users\amd\hermes\scripts\check-chatgpt-thumbnail-pipeline.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-local-studio-product.mjs`
- Modify: `C:\Users\amd\hermes\package.json`

- [ ] **Step 1: Replace ChatGPT thumbnail contract with a legacy guard**

Replace `C:\Users\amd\hermes\scripts\check-chatgpt-thumbnail-pipeline.mjs` with:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "automation/chatgpt-thumbnail-source.mjs"), "utf8");
const thumbnail = readFileSync(resolve(root, "pipeline/youtube-thumbnail.mjs"), "utf8");

assert.match(source, /CHATGPT_HUMAN_VERIFICATION_REQUIRED/, "legacy ChatGPT diagnostics should still classify human verification failures");
assert.doesNotMatch(thumbnail, /generateChatGptThumbnail\(/, "production thumbnail pipeline should not call ChatGPT by default");
assert.match(thumbnail, /primaryProvider:\s*"google-flow-image"/, "production thumbnail primary provider should be Google Flow image");
assert.match(thumbnail, /composeFlowThumbnail/, "production thumbnail pipeline should locally compose Korean text");

console.log(JSON.stringify({ ok: true, checked: "chatgpt-thumbnail-legacy-disabled", root }));
```

- [ ] **Step 2: Update local product assertions**

In `C:\Users\amd\hermes\scripts\check-local-studio-product.mjs`, replace the thumbnail assertions:

```js
assert.match(thumbnailPrompt, /Use Korean headline text directly/, "thumbnail prompt should ask ChatGPT for Korean headline text");
assert.match(chatgptThumbnail, /generateChatGptThumbnail/, "ChatGPT thumbnail automation contract should exist");
assert.match(thumbnail, /generateChatGptThumbnail/, "thumbnail pipeline should keep ChatGPT as primary");
assert.match(thumbnail, /createLocalCompositedThumbnail/, "thumbnail pipeline should provide local sharp fallback");
assert.match(thumbnail, /sharp/, "thumbnail fallback should use sharp for local image composition");
assert.doesNotMatch(thumbnail, /Flow.*Korean text/i, "thumbnail pipeline should not rely on Flow for Korean text rendering");
```

with:

```js
assert.match(thumbnailPrompt, /buildFlowThumbnailPrompt/, "thumbnail prompt should build Google Flow background prompts");
assert.match(thumbnailPrompt, /no readable text/i, "Flow thumbnail prompt should prohibit generated text");
assert.match(chatgptThumbnail, /generateChatGptThumbnail/, "legacy ChatGPT thumbnail automation contract should remain for diagnostics");
assert.doesNotMatch(thumbnail, /generateChatGptThumbnail\(/, "thumbnail pipeline should not use ChatGPT as primary");
assert.match(thumbnail, /generateGoogleFlowVideoFromPrompt/, "thumbnail pipeline should use Google Flow image generation");
assert.match(thumbnail, /composeFlowThumbnail/, "thumbnail pipeline should locally compose Korean hook text");
assert.match(thumbnail, /sharp/, "thumbnail fallback and composition should use sharp");
assert.match(thumbnail, /primaryProvider:\s*"google-flow-image"/, "thumbnail primary provider should be Google Flow image");
```

- [ ] **Step 3: Add `check:flow-thumbnail`**

In `C:\Users\amd\hermes\package.json`, add the script:

```json
"check:flow-thumbnail": "node scripts/check-flow-thumbnail-pipeline.mjs"
```

Then in the long `check` command, replace:

```text
npm run check:chatgpt-thumbnail
```

with:

```text
npm run check:chatgpt-thumbnail && npm run check:flow-thumbnail
```

- [ ] **Step 4: Run thumbnail checks**

Run:

```powershell
npm.cmd run check:chatgpt-thumbnail
npm.cmd run check:flow-thumbnail
node scripts/check-local-studio-product.mjs
```

Expected: all PASS.

- [ ] **Step 5: Commit the contract and pipeline change**

Run:

```powershell
git add pipeline/youtube-thumbnail-prompt.mjs pipeline/youtube-thumbnail.mjs youtube-workflow-stages.mjs scripts/check-chatgpt-thumbnail-pipeline.mjs scripts/check-flow-thumbnail-pipeline.mjs scripts/check-local-studio-product.mjs package.json
git commit -m "feat: use Google Flow for thumbnail backgrounds"
```

---

### Task 5: Add Thumbnail Metadata Artifacts for Debugging and Upload Review

**Files:**
- Modify: `C:\Users\amd\hermes\pipeline\youtube-thumbnail.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-flow-thumbnail-pipeline.mjs`

- [ ] **Step 1: Extend the contract**

Add these assertions to `C:\Users\amd\hermes\scripts\check-flow-thumbnail-pipeline.mjs`:

```js
assert.match(thumbnail, /thumbnail-flow-metadata\.json/, "thumbnail pipeline should persist Flow thumbnail metadata");
assert.match(thumbnail, /hookHeadline/, "thumbnail metadata should persist the hook headline");
assert.match(thumbnail, /sourcePath/, "thumbnail metadata should persist the Flow background source path");
```

- [ ] **Step 2: Persist metadata after successful composition**

In `composeFlowThumbnail`, after `sharp(...).toFile(outputPath);`, add:

```js
  await writeFile(join(jobDir, "thumbnail-flow-metadata.json"), JSON.stringify({
    ok: true,
    provider: "google-flow-image",
    path: outputPath,
    sourcePath: backgroundPath,
    hookHeadline: overlayPlan.hookHeadline,
    subheadline: overlayPlan.subheadline,
    highlightKeywords: overlayPlan.highlightKeywords || [],
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
```

Also update the import:

```js
import { mkdir, writeFile } from "node:fs/promises";
```

- [ ] **Step 3: Run the Flow thumbnail contract**

Run:

```powershell
node scripts/check-flow-thumbnail-pipeline.mjs
```

Expected: PASS.

- [ ] **Step 4: Commit metadata persistence**

Run:

```powershell
git add pipeline/youtube-thumbnail.mjs scripts/check-flow-thumbnail-pipeline.mjs
git commit -m "feat: persist Flow thumbnail metadata"
```

---

### Task 6: Validate With Mock and Full Checks

**Files:**
- No source files should be modified in this task unless checks reveal a concrete issue.

- [ ] **Step 1: Run syntax and focused checks**

Run:

```powershell
node --check pipeline/youtube-thumbnail.mjs
node --check pipeline/youtube-thumbnail-prompt.mjs
npm.cmd run check:flow-thumbnail
npm.cmd run check:chatgpt-thumbnail
node scripts/check-local-studio-product.mjs
```

Expected: all PASS.

- [ ] **Step 2: Run full project check**

Run:

```powershell
npm.cmd run check
```

Expected: PASS.

- [ ] **Step 3: Run a mock YouTube workflow smoke test**

Run:

```powershell
npm.cmd run smoke:youtube-mock
```

Expected: PASS and a job output directory with `thumbnail-flow.png` or a local fallback thumbnail if mock mode bypasses live Flow.

- [ ] **Step 4: Package the app**

Run:

```powershell
npm.cmd run electron:pack
```

Expected: PASS. If it fails with `Access is denied` on `dist-electron\win-unpacked`, close the running Hermes Studio process from that same path and rerun.

- [ ] **Step 5: Commit verification notes if documentation changes were made**

If any docs or plan status notes were updated, run:

```powershell
git add docs/superpowers/plans/2026-06-01-google-flow-thumbnail-generation-plan.md
git commit -m "docs: plan Google Flow thumbnail generation"
```

---

## Rollback Plan

If Flow thumbnail generation proves unstable, keep the local `sharp` fallback active. The job should still complete with `thumbnail-local-fallback.png`, but the upload panel must show a warning that the Flow background failed and a local fallback was used.

Do not roll back to ChatGPT as the default provider unless the user explicitly requests it. ChatGPT remains too fragile for this production path.

## Self-Review

- Spec coverage: The plan covers Flow thumbnail generation, Korean text reliability, hook-driven title/subtitle generation, context-aware background prompts, upload-review artifacts, tests, full check, and packaging.
- Placeholder scan: No placeholder or deferred implementation items remain.
- Type consistency: The plan consistently uses `buildFlowThumbnailPrompt`, `buildThumbnailOverlayPlan`, `composeFlowThumbnail`, `generateGoogleFlowVideoFromPrompt`, and `primaryProvider: "google-flow-image"`.
- Risk note: Google Flow may still fail due to account/session/policy limits. The plan handles this with local fallback and metadata, but live Flow reliability still depends on the authenticated Flow account.
