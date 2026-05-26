# Google Flow Output Mode And Style Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Hermes Studio choose whether each scene is generated in Google Flow as a Veo video or as a Flow image, then render both paths into a final YouTube Shorts video while keeping style and character consistency.

**Architecture:** Add a `flowOutputMode: "video" | "image"` job option from Electron UI through schema, workflow stages, Google Flow automation, and render normalization. Video mode keeps the current Veo media path. Image mode switches Google Flow to image generation, downloads scene images, converts them into short motion clips with ffmpeg, then sends those clips into the existing final render pipeline. Style presets gain stronger consistency metadata, including a new Stickman preset and a reusable `styleLock` block inserted into every scene prompt.

**Tech Stack:** Electron renderer/main IPC, Node ESM services, Playwright Google Flow automation, ffmpeg-static, existing HPSL/direct-script scene planner, existing check scripts.

---

## Important Clarification

The UI choice is not “make the final output a video file or image file.” The final output remains a rendered YouTube Shorts video in both cases.

- **Video mode:** Google Flow generates scene videos directly through Veo. Hermes downloads the video files and renders them with TTS/subtitles.
- **Image mode:** Google Flow generates scene images. Hermes downloads the images, creates motion video clips from each image, then renders those clips with TTS/subtitles.

This gives the user a practical fallback when Flow video generation fails or is slow, while still producing a final mp4.

---

## File Structure

- Modify `C:/Users/amd/hermes/youtube-job-schema.mjs`: add `flowOutputMode` option, validation, defaults, and persisted job contract.
- Modify `C:/Users/amd/hermes/electron/renderer/index.html`: add a “Google Flow 생성 방식” segmented control with `Video` and `Image`.
- Modify `C:/Users/amd/hermes/electron/renderer/app.js`: read the new control, show mode-specific help text, and include mode in job payload and console logs.
- Modify `C:/Users/amd/hermes/electron/renderer/styles.css`: style the new segmented control and mode hints.
- Modify `C:/Users/amd/hermes/electron/services/style-presets.mjs`: add `stickman-explainer` and style consistency fields.
- Modify `C:/Users/amd/hermes/bot_db_helper.py`: extend the optional `style_presets` SQLite overlay with consistency metadata columns and return those fields from `list-style-presets`.
- Modify `C:/Users/amd/hermes/electron/services/script-planner.mjs`: inject `styleLock`, character consistency, and output-mode-specific prompt rules into every scene prompt.
- Modify `C:/Users/amd/hermes/automation/google-flow-media.mjs`: split generator configuration into video/image mode helpers and collect either new video URLs or new image URLs.
- Create `C:/Users/amd/hermes/automation/google-flow-output-mode.mjs`: focused mode selection helper for Flow UI controls.
- Create `C:/Users/amd/hermes/electron/services/image-scene-renderer.mjs`: convert a generated image into a 9:16 mp4 scene clip using ffmpeg.
- Create `C:/Users/amd/hermes/electron/services/ffmpeg-bin-resolver.mjs`: resolve ffmpeg from injected context, packaged Electron resources, PATH, or workspace fallback.
- Modify `C:/Users/amd/hermes/youtube-workflow-stages.mjs`: choose video or image generation based on `job.options.flowOutputMode`, normalize media to scene mp4 paths.
- Modify `C:/Users/amd/hermes/scripts/check-youtube-job-schema.mjs`: verify schema accepts both modes and rejects unknown modes.
- Create `C:/Users/amd/hermes/scripts/check-flow-output-mode-contract.mjs`: verify UI, schema, stages, and Flow automation are wired for image/video mode.
- Modify `C:/Users/amd/hermes/scripts/check-style-presets-contract.mjs`: verify Stickman preset and style consistency metadata.
- Modify `C:/Users/amd/hermes/scripts/check-visual-storytelling-prompts.mjs`: verify prompts include style lock and do not drift across scenes.
- Modify `C:/Users/amd/hermes/package.json`: add the new check script to `check:studio-inputs` or `check`.

---

## Review Items Evaluated From `HERMES_GOOGLE_FLOW_OUTPUT_MODE_REVIEW.md`

- **Accepted:** Image-mode ffmpeg conversion needs a more stable filter chain than a bare high-resolution `zoompan`. The implementation should pre-normalize to a controlled intermediate canvas, use conservative zoom increments, output yuv420p, and set `-preset veryfast` plus `-threads 0` to avoid slow packaged renders.
- **Accepted:** Google Flow image mode must not depend on the exact model name `Nano Banana`. The automation may use it as a loose optional match, but the robust path is to select the image generation type first and then accept whichever image model Flow exposes.
- **Accepted:** The SQLite `style_presets` overlay must include the same consistency metadata as the local preset catalog: `character_continuity`, `world_continuity`, `negative_prompt`, and `preferred_output_modes`. The current DB table only has the older prompt fields.
- **Accepted:** Image-to-video render failures should include actionable diagnostics. The service should keep the ffmpeg command context small enough for logs, include stderr tail text, and allow the existing workflow DB failure mirror to persist it.
- **Accepted with adjustment:** Add ffmpeg path fallback detection for packaged Electron. The renderer service should still prefer the injected `context.ffmpegBin`, but if it is absent it should try Electron resources, system PATH, and workspace `node_modules/ffmpeg-static`.
- **Rejected:** Do not make SQLite the primary source of built-in style presets. Hermes already uses a safer local curated preset catalog with optional DB overlay; changing ownership to DB-first would make startup and packaging more fragile.

---

## UX Design

Add a new Studio control near the style preset selector:

```html
<div class="field-group">
  <label>Google Flow 생성 방식</label>
  <div class="segmented" id="flowOutputMode">
    <label><input type="radio" name="flowOutputMode" value="video" checked><span>Video</span></label>
    <label><input type="radio" name="flowOutputMode" value="image"><span>Image</span></label>
  </div>
  <div id="flowOutputModeHint" class="preset-preview">
    Video: Google Flow에서 장면별 Veo 영상을 생성해 최종 렌더합니다.
  </div>
</div>
```

Mode help text:

- Video: “Google Flow에서 장면별 Veo 영상을 생성해 최종 렌더합니다. 품질은 좋지만 느리고 실패 가능성이 더 큽니다.”
- Image: “Google Flow에서 장면별 이미지를 생성한 뒤 Hermes가 움직이는 클립으로 변환해 최종 렌더합니다. 빠르고 안정적이며 스타일 일관성이 좋습니다.”

Recommended default: `video`, because the current workflow already expects scene videos. Add a future user preference only after this first version is stable.

---

## Style Consistency Design

Each style preset should include both visual taste and consistency rules:

```js
{
  id: "stickman-explainer",
  label: "Stickman Explainer",
  description: "clean black-and-white stickman explainer animation style",
  aesthetic: "minimal black stick figures, white background, simple visual metaphors",
  camera: "locked-off whiteboard-style composition with gentle digital pan",
  lighting: "flat clean high-key lighting",
  colorPalette: "white, black, one accent color",
  characterContinuity: "same simple stickman proportions, round head, thin black limbs, no facial detail drift",
  worldContinuity: "same whiteboard canvas, same line thickness, same accent color across every scene",
  negativePrompt: "no realistic humans, no photorealistic faces, no readable text, no logos, no watermarks",
  promptSuffix: "Style: minimal black stickman explainer. Keep the same stickman proportions, round head, thin black limbs, whiteboard background, line thickness, and one accent color across every scene. No readable text, logos, watermarks, or photorealistic people."
}
```

For all presets, add:

- `characterContinuity`
- `worldContinuity`
- `negativePrompt`
- `preferredOutputModes`, for example `["image", "video"]`

The scene planner should build a stable style lock:

```js
function buildStyleLock(stylePreset = {}) {
  return [
    `GLOBAL STYLE LOCK: ${stylePreset.aesthetic || "clear cinematic shorts visuals"}.`,
    `Character continuity: ${stylePreset.characterContinuity || "keep the same presenter identity, age, wardrobe, and body type across scenes"}.`,
    `World continuity: ${stylePreset.worldContinuity || "keep the same visual language, palette, lighting, and camera rules across scenes"}.`,
    `Negative constraints: ${stylePreset.negativePrompt || "no readable text, no logos, no watermarks"}.`,
  ].join(" ");
}
```

This block must be appended to every scene prompt, not only the first scene.

---

## Task 1: Add Flow Output Mode To Job Schema

**Files:**
- Modify: `C:/Users/amd/hermes/youtube-job-schema.mjs`
- Modify: `C:/Users/amd/hermes/scripts/check-youtube-job-schema.mjs`
- Create: `C:/Users/amd/hermes/scripts/check-flow-output-mode-contract.mjs`

- [ ] **Step 1: Write the failing schema assertions**

Add to `scripts/check-flow-output-mode-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const root = new URL("..", import.meta.url);
const schema = readFileSync(new URL("../youtube-job-schema.mjs", import.meta.url), "utf8");
const rendererHtml = readFileSync(new URL("../electron/renderer/index.html", import.meta.url), "utf8");
const rendererApp = readFileSync(new URL("../electron/renderer/app.js", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");
const flow = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");

const videoJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: { flowOutputMode: "video" },
});
assert.equal(videoJob.options.flowOutputMode, "video");

const imageJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: { flowOutputMode: "image" },
});
assert.equal(imageJob.options.flowOutputMode, "image");

assert.throws(() => normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: { flowOutputMode: "gif" },
}), /Unknown flowOutputMode/);

assert.match(schema, /flowOutputMode/, "schema should define flowOutputMode");
assert.match(rendererHtml, /name="flowOutputMode"/, "UI should expose flow output mode");
assert.match(rendererApp, /flowOutputMode/, "renderer should submit flow output mode");
assert.match(stages, /flowOutputMode/, "workflow stages should branch by flow output mode");
assert.match(flow, /outputMode/, "Google Flow automation should receive outputMode");

console.log(JSON.stringify({ ok: true, checked: "flow-output-mode-contract", root: root.pathname }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node scripts/check-flow-output-mode-contract.mjs
```

Expected: FAIL because `flowOutputMode` is not wired yet.

- [ ] **Step 3: Add schema option**

In `youtube-job-schema.mjs`, add:

```js
flowOutputMode: "video",
```

Then add validation:

```js
options.flowOutputMode = String(options.flowOutputMode || "video").toLowerCase();
if (!["video", "image"].includes(options.flowOutputMode)) {
  throw new Error(`Unknown flowOutputMode: ${options.flowOutputMode}`);
}
```

- [ ] **Step 4: Run schema checks**

Run:

```powershell
node scripts/check-youtube-job-schema.mjs
node scripts/check-flow-output-mode-contract.mjs
```

Expected: schema check passes or fails only on UI/stage/Flow wiring that later tasks will fix.

---

## Task 2: Add Studio UI Mode Selector

**Files:**
- Modify: `C:/Users/amd/hermes/electron/renderer/index.html`
- Modify: `C:/Users/amd/hermes/electron/renderer/app.js`
- Modify: `C:/Users/amd/hermes/electron/renderer/styles.css`
- Modify: `C:/Users/amd/hermes/scripts/check-studio-v2-ux.mjs`

- [ ] **Step 1: Add UI test assertions**

Add to `scripts/check-studio-v2-ux.mjs`:

```js
assert.match(html, /name="flowOutputMode"/, "UI should expose Google Flow output mode choice");
assert.match(html, /flowOutputModeHint/, "UI should explain video versus image generation mode");
assert.match(app, /updateFlowOutputModeHint/, "renderer should update Flow output mode hint");
assert.match(app, /flowOutputMode:\s*getFlowOutputMode\(\)/, "job payload should include Flow output mode");
```

- [ ] **Step 2: Add HTML control**

Add the segmented control near `stylePresetId` in `electron/renderer/index.html`:

```html
<div class="field-group">
  <label>Google Flow 생성 방식</label>
  <div class="segmented" id="flowOutputModeControl">
    <label><input type="radio" name="flowOutputMode" value="video" checked><span>Video</span></label>
    <label><input type="radio" name="flowOutputMode" value="image"><span>Image</span></label>
  </div>
  <div id="flowOutputModeHint" class="preset-preview"></div>
</div>
```

- [ ] **Step 3: Add renderer helpers**

Add to `electron/renderer/app.js`:

```js
const flowOutputModeHint = document.querySelector("#flowOutputModeHint");

function getFlowOutputMode() {
  return document.querySelector("input[name='flowOutputMode']:checked")?.value || "video";
}

function updateFlowOutputModeHint() {
  if (!flowOutputModeHint) return;
  flowOutputModeHint.textContent = getFlowOutputMode() === "image"
    ? "Image: Google Flow에서 장면별 이미지를 생성하고 Hermes가 움직이는 클립으로 변환해 렌더합니다."
    : "Video: Google Flow에서 장면별 Veo 영상을 생성해 그대로 렌더합니다.";
}

for (const input of document.querySelectorAll("input[name='flowOutputMode']")) {
  input.addEventListener("change", updateFlowOutputModeHint);
}
```

In `readJobInput()`, add:

```js
flowOutputMode: getFlowOutputMode(),
```

In `loadConfig()`, call:

```js
updateFlowOutputModeHint();
```

- [ ] **Step 4: Run UI checks**

Run:

```powershell
node --check electron/renderer/app.js
node scripts/check-studio-v2-ux.mjs
node scripts/check-flow-output-mode-contract.mjs
```

Expected: UI checks pass; Flow/stage assertions may remain failing until later tasks.

---

## Task 3: Add Stickman And Style Consistency Metadata

**Files:**
- Modify: `C:/Users/amd/hermes/electron/services/style-presets.mjs`
- Modify: `C:/Users/amd/hermes/bot_db_helper.py`
- Modify: `C:/Users/amd/hermes/scripts/check-style-presets-contract.mjs`

- [ ] **Step 1: Add failing style preset assertions**

Add to `scripts/check-style-presets-contract.mjs`:

```js
const stickman = presets.find((item) => item.id === "stickman-explainer");
assert.ok(stickman, "style presets should include Stickman Explainer");
assert.match(stickman.promptSuffix, /stickman|whiteboard/i, "Stickman preset should force stickman/whiteboard style");
assert.match(stickman.characterContinuity, /same|consistent|proportions/i, "Stickman preset should define character continuity");
assert.match(stickman.worldContinuity, /same|consistent|whiteboard|line/i, "Stickman preset should define world continuity");
for (const preset of presets) {
  assert.ok(preset.characterContinuity, `${preset.id} should define characterContinuity`);
  assert.ok(preset.worldContinuity, `${preset.id} should define worldContinuity`);
  assert.ok(preset.negativePrompt, `${preset.id} should define negativePrompt`);
  assert.ok(Array.isArray(preset.preferredOutputModes), `${preset.id} should expose preferredOutputModes`);
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node scripts/check-style-presets-contract.mjs
```

Expected: FAIL until metadata is added.

- [ ] **Step 3: Expand preset model**

Change `preset()` signature in `electron/services/style-presets.mjs`:

```js
function preset(id, label, aesthetic, camera, lighting, colorPalette, extra = {}) {
  const characterContinuity = extra.characterContinuity || "keep the same character identity, age, wardrobe, body type, and visual proportions across every scene";
  const worldContinuity = extra.worldContinuity || `keep the same ${colorPalette} palette, lighting style, camera language, and scene design across every scene`;
  const negativePrompt = extra.negativePrompt || "no readable text, no logos, no watermarks, no random character identity changes";
  return {
    id,
    label,
    description: aesthetic,
    aesthetic,
    camera,
    lighting,
    colorPalette,
    characterContinuity,
    worldContinuity,
    negativePrompt,
    preferredOutputModes: extra.preferredOutputModes || ["video", "image"],
    promptSuffix: extra.promptSuffix || `Style: ${aesthetic}. Camera: ${camera}. Lighting: ${lighting}. Color palette: ${colorPalette}. Character continuity: ${characterContinuity}. World continuity: ${worldContinuity}. Negative constraints: ${negativePrompt}.`,
  };
}
```

Add the Stickman preset:

```js
preset(
  "stickman-explainer",
  "Stickman Explainer",
  "minimal black stickman explainer animation on a clean whiteboard canvas",
  "locked-off whiteboard composition with gentle digital pan",
  "flat clean high-key lighting",
  "white, black, one accent color",
  {
    characterContinuity: "same simple stickman proportions, round head, thin black limbs, consistent line thickness, no gender or age drift",
    worldContinuity: "same whiteboard canvas, same black line weight, same single accent color, simple icon-like props",
    negativePrompt: "no realistic humans, no photorealistic faces, no complex backgrounds, no readable text, no logos, no watermarks",
    preferredOutputModes: ["image", "video"],
  },
),
```

- [ ] **Step 4: Update DB normalization**

In `normalizePreset()`, include:

```js
characterContinuity: String(item.characterContinuity || item.character_continuity || "").trim(),
worldContinuity: String(item.worldContinuity || item.world_continuity || "").trim(),
negativePrompt: String(item.negativePrompt || item.negative_prompt || "").trim(),
preferredOutputModes: Array.isArray(item.preferredOutputModes || item.preferred_output_modes)
  ? (item.preferredOutputModes || item.preferred_output_modes)
  : ["video", "image"],
```

- [ ] **Step 5: Extend SQLite style preset overlay**

In `bot_db_helper.py`, extend `style_presets` with the metadata columns. Because existing local DBs may already have the table, add migration-safe `ALTER TABLE` calls after table creation:

```python
def ensure_column(conn, table: str, column: str, definition: str) -> None:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    existing = {row["name"] for row in rows}
    if column not in existing:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
```

Call it inside `init_db()` after `CREATE TABLE IF NOT EXISTS style_presets`:

```python
ensure_column(conn, "style_presets", "character_continuity", "TEXT")
ensure_column(conn, "style_presets", "world_continuity", "TEXT")
ensure_column(conn, "style_presets", "negative_prompt", "TEXT")
ensure_column(conn, "style_presets", "preferred_output_modes", "TEXT NOT NULL DEFAULT '[\"video\", \"image\"]'")
```

Then update `list_style_presets()`:

```sql
SELECT id, label, aesthetic, camera, lighting, color_palette,
       character_continuity, world_continuity, negative_prompt,
       preferred_output_modes, prompt_suffix, is_custom
FROM style_presets
ORDER BY is_custom ASC, label ASC
```

Do not seed every built-in preset into SQLite. Built-ins stay in `style-presets.mjs`; SQLite remains a custom overlay.

- [ ] **Step 6: Add DB schema assertions**

In `scripts/check-style-presets-contract.mjs`, add a static DB helper check:

```js
const dbHelper = readFileSync(new URL("../bot_db_helper.py", import.meta.url), "utf8");
assert.match(dbHelper, /character_continuity/, "style preset DB should store character continuity");
assert.match(dbHelper, /world_continuity/, "style preset DB should store world continuity");
assert.match(dbHelper, /negative_prompt/, "style preset DB should store negative prompts");
assert.match(dbHelper, /preferred_output_modes/, "style preset DB should store preferred output modes");
```

- [ ] **Step 7: Run style checks**

Run:

```powershell
node scripts/check-style-presets-contract.mjs
python bot_db_helper.py init
python bot_db_helper.py list-style-presets
```

Expected: PASS.

---

## Task 4: Make Scene Prompts Respect Mode And Style Lock

**Files:**
- Modify: `C:/Users/amd/hermes/electron/services/script-planner.mjs`
- Modify: `C:/Users/amd/hermes/scripts/check-visual-storytelling-prompts.mjs`

- [ ] **Step 1: Add failing prompt assertions**

Add assertions that generated scene prompts contain:

```js
assert.match(prompt, /GLOBAL STYLE LOCK/i, "scene prompt should include a global style lock");
assert.match(prompt, /Character continuity/i, "scene prompt should include character continuity");
assert.match(prompt, /World continuity/i, "scene prompt should include world continuity");
assert.match(prompt, /Negative constraints/i, "scene prompt should include negative constraints");
```

Add a Stickman-specific fixture:

```js
assert.match(stickmanScene.image_prompt, /stickman|whiteboard/i, "stickman scene should retain stickman style");
assert.doesNotMatch(stickmanScene.image_prompt, /photorealistic|realistic human/i, "stickman scene should block realistic human drift");
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node scripts/check-visual-storytelling-prompts.mjs
```

Expected: FAIL until style lock is inserted.

- [ ] **Step 3: Add style lock helper**

In `electron/services/script-planner.mjs`, add:

```js
function buildStyleLock(stylePreset = {}, outputMode = "video") {
  const modeInstruction = outputMode === "image"
    ? "Generate one strong still image that can be animated later with slow pan/zoom."
    : "Generate a short cinematic motion shot with clear subject action.";
  return [
    `GLOBAL STYLE LOCK: ${stylePreset.aesthetic || "clear cinematic YouTube Shorts visuals"}.`,
    `Output mode: ${outputMode}. ${modeInstruction}`,
    `Character continuity: ${stylePreset.characterContinuity || "keep the same character identity, age, wardrobe, body type, and visual proportions across every scene"}.`,
    `World continuity: ${stylePreset.worldContinuity || "keep the same palette, lighting, camera language, and scene design across every scene"}.`,
    `Negative constraints: ${stylePreset.negativePrompt || "no readable text, no logos, no watermarks, no random character identity changes"}.`,
  ].join(" ");
}
```

Pass `job.options.flowOutputMode` from `buildDirectScriptDraft()` and `buildGeminiResearchDraft()` into `planScenesFromScript()` and `planScenesFromHpsl()` as a `flowOutputMode` argument. Then pass that same value into `buildVisualStoryPrompt()`.

- [ ] **Step 4: Apply style lock to every prompt**

Where `buildVisualStoryPrompt()` currently appends `stylePreset.promptSuffix`, append:

```js
const styleLock = buildStyleLock(stylePreset, flowOutputMode);
return `${basePrompt} ${styleLock}`;
```

Do not only add it to scene 1. Every scene must receive the same lock.

- [ ] **Step 5: Run prompt checks**

Run:

```powershell
node scripts/check-visual-storytelling-prompts.mjs
node scripts/check-hpsl-scene-planner.mjs
```

Expected: PASS.

---

## Task 5: Split Google Flow Automation Into Video And Image Modes

**Files:**
- Create: `C:/Users/amd/hermes/automation/google-flow-output-mode.mjs`
- Modify: `C:/Users/amd/hermes/automation/google-flow-media.mjs`
- Modify: `C:/Users/amd/hermes/scripts/check-flow-output-mode-contract.mjs`

- [ ] **Step 1: Create mode helper**

Create `automation/google-flow-output-mode.mjs`:

```js
export async function configureFlowOutputMode(page, outputMode = "video") {
  if (outputMode === "image") return configureFlowImage(page);
  return configureFlowVideo(page);
}

async function configureFlowVideo(page) {
  return configureFlowGenerator(page, {
    targetLabels: ["동영상", "video"],
    generatorLabels: ["Veo 3.1 - Lite", "Veo"],
    aspectLabels: ["9:16", "crop_9_16"],
    countLabels: ["1x"],
  });
}

async function configureFlowImage(page) {
  return configureFlowGenerator(page, {
    targetLabels: ["이미지", "image"],
    generatorLabels: ["Image", "이미지", "Nano Banana"],
    aspectLabels: ["9:16", "crop_9_16"],
    countLabels: ["1x"],
    allowGeneratorFallback: true,
  });
}

async function configureFlowGenerator(page, config) {
  return page.evaluate(async (config) => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const visible = (el) => {
      const style = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return !el.disabled && style.visibility !== "hidden" && style.display !== "none" && rect.width > 8 && rect.height > 8;
    };
    const textOf = (el) => [
      el.innerText,
      el.textContent,
      el.getAttribute("aria-label"),
      el.getAttribute("title"),
    ].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
    const controls = () => Array.from(document.querySelectorAll("button,[role='button'],[role='option'],[aria-label],div,span"))
      .filter(visible)
      .map((el) => ({ el, text: textOf(el), rect: el.getBoundingClientRect() }))
      .filter((item) => item.text);
    const bodyText = () => document.body?.innerText || "";
    const openGeneratorMenu = async () => {
      const candidates = controls().filter((item) => {
        const text = item.text;
        return item.el.matches("button,[role='button']")
          && item.rect.y > window.innerHeight * 0.72
          && /Nano Banana|Veo|crop_9_16|1x|9:16|동영상|이미지|video|image/i.test(text);
      }).sort((a, b) => (b.rect.width * b.rect.height) - (a.rect.width * a.rect.height));
      const target = candidates[0];
      if (!target) return { ok: false, reason: "Generator settings button not found" };
      target.el.click();
      await wait(500);
      return { ok: true, text: target.text };
    };
    const clickMatch = async (needles, options = {}) => {
      const lowerNeedles = needles.map((needle) => needle.toLowerCase());
      const matches = controls().filter((item) => {
        const text = item.text.toLowerCase();
        return lowerNeedles.some((needle) => options.exact ? text === needle : text.includes(needle));
      });
      const match = matches[0];
      if (!match) return { ok: false, reason: `No control matched: ${needles.join(", ")}` };
      const clickable = match.el.closest("button,[role='button'],[role='option']") || match.el;
      clickable.click();
      await wait(options.delay ?? 300);
      return { ok: true, text: match.text };
    };

    const results = [];
    results.push(await openGeneratorMenu());
    results.push(await clickMatch(config.targetLabels));
    await wait(300);
    results.push(await openGeneratorMenu());
    const generatorResult = await clickMatch(config.generatorLabels);
    if (!generatorResult.ok && config.allowGeneratorFallback) {
      results.push({ ok: true, warning: "Image model label not found; continuing with currently selected image model." });
    } else {
      results.push(generatorResult);
    }
    await wait(300);
    results.push(await openGeneratorMenu());
    results.push(await clickMatch(config.aspectLabels));
    await wait(300);
    results.push(await openGeneratorMenu());
    results.push(await clickMatch(config.countLabels, { exact: true }));

    return { ok: results.some((item) => item.ok), results, summary: bodyText().slice(-500) };
  }, config);
}
```

This helper intentionally uses broad text matching because Flow labels can move or be localized. Image mode must not hard-fail only because `Nano Banana` is renamed or hidden; selecting the image generation type is the required step, while exact model matching is a best-effort preference. Store screenshots in the caller when mode selection itself fails.

- [ ] **Step 2: Update `google-flow-media.mjs` signature**

Change:

```js
export async function generateGoogleFlowVideoFromPrompt({
```

to keep backward compatibility but accept:

```js
export async function generateGoogleFlowVideoFromPrompt({
  outputMode = "video",
```

Then call:

```js
await configureFlowOutputMode(page, outputMode);
```

Remove or stop using the old local `configureFlowVideo()` after the new helper is stable.

- [ ] **Step 3: Collect media by selected mode**

Before submit:

```js
const before = await collectMediaUrls(page);
const beforeUrls = new Set(outputMode === "image" ? before.images : before.videos);
```

During wait:

```js
const currentUrls = outputMode === "image" ? last.images : last.videos;
const newMedia = currentUrls.filter((url) => !beforeUrls.has(url));
if (newMedia.length > 0 && percents.length === 0) break;
```

Error reason:

```js
const reason = outputMode === "image" ? "no-new-image-url" : "no-new-video-url";
throw new Error(`Flow did not expose a new ${outputMode} URL. Screenshot: ${screenshotPath}`);
```

Download message:

```js
onProgress?.({
  message: `장면 ${sceneOrder} Google Flow ${outputMode === "image" ? "이미지" : "영상"}를 다운로드하는 중입니다.`,
  details: { outputMode, detectedMediaCount: newMedia.length },
});
```

- [ ] **Step 4: Run automation syntax checks**

Run:

```powershell
node --check automation/google-flow-output-mode.mjs
node --check automation/google-flow-media.mjs
node scripts/check-flow-output-mode-contract.mjs
```

Expected: PASS after stage wiring is added in Task 6.

---

## Task 6: Convert Flow Images Into Scene Video Clips

**Files:**
- Create: `C:/Users/amd/hermes/electron/services/ffmpeg-bin-resolver.mjs`
- Create: `C:/Users/amd/hermes/electron/services/image-scene-renderer.mjs`
- Modify: `C:/Users/amd/hermes/youtube-workflow-stages.mjs`
- Create: `C:/Users/amd/hermes/scripts/check-image-scene-renderer-contract.mjs`

- [ ] **Step 1: Write failing renderer contract test**

Create `scripts/check-image-scene-renderer-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderImageSceneClip } from "../electron/services/image-scene-renderer.mjs";
import { resolveFfmpegBin } from "../electron/services/ffmpeg-bin-resolver.mjs";

assert.equal(typeof renderImageSceneClip, "function");
assert.equal(typeof resolveFfmpegBin, "function");

const service = readFileSync(new URL("../electron/services/image-scene-renderer.mjs", import.meta.url), "utf8");
const resolver = readFileSync(new URL("../electron/services/ffmpeg-bin-resolver.mjs", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");

assert.match(service, /zoompan|scale|crop/, "image scene renderer should create motion from still images");
assert.match(service, /9:16|1080|1920/, "image scene renderer should target Shorts aspect ratio");
assert.match(service, /veryfast/, "image scene renderer should use fast packaged-safe encoding");
assert.match(service, /threads/, "image scene renderer should allow ffmpeg thread scheduling");
assert.match(service, /stderrTail/, "image scene renderer should report compact stderr diagnostics");
assert.match(resolver, /resourcesPath|ffmpeg-static|PATH/, "ffmpeg resolver should support packaged and local fallbacks");
assert.match(stages, /renderImageSceneClip/, "workflow stages should normalize image outputs to video clips");

console.log(JSON.stringify({ ok: true, checked: "image-scene-renderer-contract" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```powershell
node scripts/check-image-scene-renderer-contract.mjs
```

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement image-to-video service**

Create `electron/services/ffmpeg-bin-resolver.mjs`:

```js
import { existsSync } from "node:fs";
import { join } from "node:path";

export function resolveFfmpegBin(candidate = "") {
  const candidates = [
    candidate,
    process.env.FFMPEG_PATH,
    process.resourcesPath ? join(process.resourcesPath, "app.asar.unpacked", "node_modules", "ffmpeg-static", "ffmpeg.exe") : "",
    "C:/Users/amd/hermes/node_modules/ffmpeg-static/ffmpeg.exe",
    "ffmpeg",
  ].filter(Boolean);
  return candidates.find((item) => item === "ffmpeg" || existsSync(item)) || "";
}
```

Create `electron/services/image-scene-renderer.mjs`:

```js
import { spawnSync } from "node:child_process";
import { resolveFfmpegBin } from "./ffmpeg-bin-resolver.mjs";

function tailText(text = "", limit = 2200) {
  const value = String(text || "");
  return value.length > limit ? value.slice(-limit) : value;
}

export function renderImageSceneClip({
  ffmpegBin,
  imagePath,
  outputPath,
  durationSeconds = 8,
  motionPreset = "slow-zoom-in",
}) {
  const resolvedFfmpegBin = resolveFfmpegBin(ffmpegBin);
  if (!resolvedFfmpegBin) throw new Error("ffmpegBin is required for image scene rendering.");
  if (!imagePath) throw new Error("imagePath is required for image scene rendering.");
  if (!outputPath) throw new Error("outputPath is required for image scene rendering.");

  const duration = Math.max(3, Math.min(30, Number(durationSeconds || 8)));
  const scaleAndCrop = "scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304";
  const zoomExpr = motionPreset === "slow-pan-left"
    ? "zoompan=z='1.10':x='iw*0.05-(iw*0.08)*on/(25*d)':y='ih*0.02':d=1:s=1080x1920:fps=25"
    : "zoompan=z='min(zoom+0.0012,1.15)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=25";

  const args = [
    "-y",
    "-loop", "1",
    "-t", String(duration),
    "-i", imagePath,
    "-vf", `${scaleAndCrop},${zoomExpr},format=yuv420p`,
    "-an",
    "-r", "25",
    "-threads", "0",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    outputPath,
  ];
  const result = spawnSync(resolvedFfmpegBin, args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });

  if (result.status !== 0) {
    const stderrTail = tailText(result.stderr);
    const stdoutTail = tailText(result.stdout);
    throw new Error(`Image scene render failed: code=${result.status}\nffmpeg=${resolvedFfmpegBin}\nargs=${args.join(" ")}\nSTDOUT_TAIL:\n${stdoutTail}\nSTDERR_TAIL:\n${stderrTail}`);
  }
  return { path: outputPath, durationSeconds: duration, motionPreset, ffmpegBin: resolvedFfmpegBin };
}
```

- [ ] **Step 4: Normalize image mode in workflow stages**

In `youtube-workflow-stages.mjs`, pass mode into Flow:

```js
const outputMode = job?.options?.flowOutputMode || "video";
const media = await generateGoogleFlowVideoFromPrompt({
  outputMode,
  ...
});
```

After download:

```js
if (outputMode === "image") {
  const renderPath = join(jobDir, `scene_${scene.order}.mp4`);
  const rendered = renderImageSceneClip({
    ffmpegBin: context.ffmpegBin,
    imagePath: media.path,
    outputPath: renderPath,
    durationSeconds: scene.duration_seconds || 8,
    motionPreset: scene.order % 2 === 0 ? "slow-pan-left" : "slow-zoom-in",
  });
  return {
    path: renderPath,
    originalPath: media.path,
    bytes: media.bytes,
    contentType: "video/mp4",
    sourceContentType: media.contentType,
    flowOutputMode: "image",
    motionPreset: rendered.motionPreset,
  };
}
```

Video mode should keep the existing copy behavior.

- [ ] **Step 5: Run renderer checks**

Run:

```powershell
node scripts/check-image-scene-renderer-contract.mjs
node scripts/check-flow-output-mode-contract.mjs
node scripts/check-youtube-job-runner.mjs
```

Expected: PASS.

---

## Task 7: Progress, Logs, And QA Labels

**Files:**
- Modify: `C:/Users/amd/hermes/youtube-workflow-stages.mjs`
- Modify: `C:/Users/amd/hermes/electron/renderer/app.js`
- Modify: `C:/Users/amd/hermes/scripts/check-desktop-progress-feedback.mjs`

- [ ] **Step 1: Update progress assertions**

Add to `scripts/check-desktop-progress-feedback.mjs`:

```js
assert.match(renderer, /flowOutputMode/i, "console should surface Flow output mode");
assert.match(stages, /Google Flow .*이미지|Google Flow .*영상|outputMode/, "stages should emit image/video specific progress");
```

- [ ] **Step 2: Emit mode-specific progress**

In `generateSceneMedia()`, update messages:

```js
const outputModeLabel = outputMode === "image" ? "이미지" : "영상";
context.emit?.({
  type: "workflow-progress",
  jobId: job?.id || context.job?.id || "",
  phase: "flow-submit",
  message: `장면 ${scene.order} Google Flow ${outputModeLabel} 생성 요청을 준비하는 중입니다.`,
  details: { sceneOrder: scene.order, flowOutputMode: outputMode },
});
```

When image conversion starts:

```js
context.emit?.({
  type: "workflow-progress",
  jobId: job?.id || context.job?.id || "",
  phase: "render",
  message: `장면 ${scene.order} Flow 이미지를 움직이는 영상 클립으로 변환하는 중입니다.`,
  details: { sceneOrder: scene.order, flowOutputMode: "image" },
});
```

- [ ] **Step 3: Preserve image-render diagnostics for DB failure mirroring**

Wrap image clip rendering so failures are emitted as workflow failures before being rethrown:

```js
try {
  const rendered = renderImageSceneClip({
    ffmpegBin: context.ffmpegBin,
    imagePath: media.path,
    outputPath: renderPath,
    durationSeconds: scene.duration_seconds || 8,
    motionPreset: scene.order % 2 === 0 ? "slow-pan-left" : "slow-zoom-in",
  });
  return {
    path: renderPath,
    originalPath: media.path,
    bytes: media.bytes,
    contentType: "video/mp4",
    sourceContentType: media.contentType,
    flowOutputMode: "image",
    motionPreset: rendered.motionPreset,
  };
} catch (error) {
  context.emit?.({
    type: "workflow-progress",
    status: "failed",
    jobId: job?.id || context.job?.id || "",
    phase: "render",
    message: `Flow image scene render failed: ${error.message}`,
    details: {
      sceneOrder: scene.order,
      flowOutputMode: "image",
      imagePath: media.path,
    },
  });
  throw error;
}
```

The existing `workflow-db-events.mjs` mirrors failed workflow events into `task_failures`, so this makes image-render failures searchable from the console history without adding a second DB writer.

- [ ] **Step 4: Surface mode in console event rendering**

In `renderConsoleEvent()`, when `event.details?.flowOutputMode` exists, append it to the message:

```js
message: [event.message || event.label || "", event.details?.flowOutputMode ? `mode=${event.details.flowOutputMode}` : ""].filter(Boolean).join(" "),
```

- [ ] **Step 5: Run progress checks**

Run:

```powershell
node scripts/check-desktop-progress-feedback.mjs
```

Expected: PASS.

---

## Task 8: Package And Regression Checks

**Files:**
- Modify: `C:/Users/amd/hermes/package.json`
- Modify: `C:/Users/amd/hermes/scripts/check-packaged-runtime-contract.mjs`

- [ ] **Step 1: Add package checks**

In `package.json`, add the new scripts to `check`:

```json
"check:flow-output-mode": "node scripts/check-flow-output-mode-contract.mjs && node scripts/check-image-scene-renderer-contract.mjs"
```

Then include:

```json
"npm run check:flow-output-mode"
```

inside the main `check` chain.

- [ ] **Step 2: Update packaged runtime contract**

In `scripts/check-packaged-runtime-contract.mjs`, assert packaged app contains:

```js
const packagedOutputMode = readFileSync(join(extractDir, "automation/google-flow-output-mode.mjs"), "utf8");
const packagedImageRenderer = readFileSync(join(extractDir, "electron/services/image-scene-renderer.mjs"), "utf8");
const packagedFfmpegResolver = readFileSync(join(extractDir, "electron/services/ffmpeg-bin-resolver.mjs"), "utf8");
assert.match(packagedOutputMode, /configureFlowOutputMode/, "packaged runtime should include Flow output mode helper");
assert.match(packagedImageRenderer, /renderImageSceneClip/, "packaged runtime should include image scene renderer");
assert.match(packagedFfmpegResolver, /resolveFfmpegBin/, "packaged runtime should include ffmpeg path resolver");
```

- [ ] **Step 3: Run focused checks**

Run:

```powershell
node --check automation/google-flow-output-mode.mjs
node --check automation/google-flow-media.mjs
node --check electron/services/ffmpeg-bin-resolver.mjs
node --check electron/services/image-scene-renderer.mjs
node scripts/check-flow-output-mode-contract.mjs
node scripts/check-image-scene-renderer-contract.mjs
node scripts/check-style-presets-contract.mjs
node scripts/check-visual-storytelling-prompts.mjs
node scripts/check-studio-v2-ux.mjs
```

Expected: all PASS.

- [ ] **Step 4: Run full check**

Run:

```powershell
npm.cmd run check
```

Expected: PASS.

- [ ] **Step 5: Rebuild installer**

If the app passes checks:

```powershell
npm.cmd run electron:pack
```

If build fails with `Access is denied` inside `dist-electron/win-unpacked`, close or terminate old `Hermes YouTube Studio` processes and retry:

```powershell
Get-Process | Where-Object { $_.ProcessName -eq "Hermes YouTube Studio" } | Stop-Process -Force
npm.cmd run electron:pack
```

- [ ] **Step 6: Verify packaged runtime**

Run:

```powershell
node scripts/check-packaged-runtime-contract.mjs
node scripts/check-desktop-shortcut-launcher.mjs
```

Expected: PASS.

---

## Acceptance Criteria

- Studio has a visible `Google Flow 생성 방식` control with `Video` and `Image`.
- Job payload includes `options.flowOutputMode`.
- Video mode preserves the current Flow Veo generation path.
- Image mode switches Flow to image generation, downloads images, converts them to 9:16 mp4 scene clips, and renders a normal final video.
- Stickman style preset exists and clearly prevents realistic human drift.
- Every style preset contains continuity metadata.
- Every scene prompt includes the same style lock and character/world continuity rules.
- Console progress clearly says whether the current scene is using Flow image or Flow video generation.
- Full `npm.cmd run check` passes.
- Rebuilt installer includes the new files.

---

## Implementation Notes

- Keep the exported name `generateGoogleFlowVideoFromPrompt()` for now to avoid a broad rename. Internally it can handle `outputMode`. A later cleanup can rename it to `generateGoogleFlowMediaFromPrompt()`.
- Image mode should be treated as a stability fallback, not as a lower-quality path. Many news/explainer Shorts will look better with consistent stylized images plus controlled motion than with inconsistent generated video clips.
- Stickman style should strongly prefer image mode in UI copy, because image generation plus Hermes motion gives the most consistent stickman look.
- Do not add new paid API usage for this feature.
- Do not make style presets fetch from GitHub at runtime. Keep curated local presets stable and optionally allow DB overlays later.

---

## Self-Review

- Spec coverage: The plan covers UI selection, schema propagation, Flow video/image branching, image-to-video rendering, Stickman preset, style continuity, progress labels, checks, and packaging.
- Placeholder scan: No implementation step relies on undefined future work; each new module has concrete code shape and command-level verification.
- Type consistency: The same property name `flowOutputMode` is used in schema, renderer, stages, progress details, and tests.
- Scope check: This is a single cohesive enhancement because image mode, video mode, and style consistency all meet at the same scene media generation boundary.
