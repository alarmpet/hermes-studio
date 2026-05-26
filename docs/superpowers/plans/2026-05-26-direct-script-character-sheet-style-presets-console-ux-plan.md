# Direct Script, Character Sheet, Style Presets, Console UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a third input mode where the user can paste a completed script, split it into sentence-based scenes, generate Google Flow image/video prompts per sentence, attach a character sheet/reference image, choose a visual style preset, and manage the workflow through a clearer studio console.

**Architecture:** Extend the existing `keyword`/`url` job contract with `script` input mode and keep all three modes on the same `youtube-hpsl-v2` runtime. Direct-script mode bypasses Gemini research/draft rewriting and uses a new direct script draft service that preserves the user's narration while using the existing `script-planner` for sentence-proportional scenes. Character sheets and style presets become explicit job options that flow from Electron UI -> schema -> planner -> Google Flow automation.

**Tech Stack:** Electron renderer/main IPC, Node ESM services, existing Google Flow Playwright automation, local JSON preset catalog, Sharp/FFmpeg render pipeline, existing check scripts.

---

## References Checked

- Google Flow help says Text to Video prompts should describe subject, action, environment, lighting, and style; it also says Ingredients to Video is the most reliable way to keep characters and key objects consistent across shots: https://support.google.com/labs/answer/16353334?hl=en
- Google Flow image help confirms generated or uploaded images can be added to a prompt as ingredients/assets: https://support.google.com/labs/answer/16729550?hl=en
- Runway's official prompting guide recommends direct visual prompts and a stable structure like camera movement followed by establishing scene and details: https://help.runwayml.com/hc/en-us/articles/30586818553107-Gen-3-Alpha-Prompting-Guide
- Runway's camera reference provides camera terminology examples useful for style preset metadata: https://help.runwayml.com/hc/en-us/articles/47313504791059-Camera-Terms-Prompts-Examples
- GitHub prompt collections such as `awesome-ai-video-prompts` and `AI-Video-Prompt` are useful as inspiration for local style preset categories, but the app should ship a curated local catalog rather than fetching GitHub at runtime: https://github.com/geekjourneyx/awesome-ai-video-prompts and https://github.com/Lcorinst/AI-Video-Prompt
- OpenAI Responses API is the current OpenAI interface for stateful multimodal workflows with text/image inputs, tools, structured text outputs, and built-in image generation: https://platform.openai.com/docs/api-reference/responses/create?api-mode=responses
- OpenAI Structured Outputs should be preferred over older JSON mode when an OpenAI model is used to emit scene JSON, because it enforces a supplied JSON Schema and exposes safety refusals programmatically: https://platform.openai.com/docs/guides/structured-outputs?lang=javascript
- OpenAI image generation can be used through the Responses API `image_generation` tool or the Image API; it supports image inputs by URL, base64 data URL, or File ID, which is useful for a future optional API-based thumbnail/reference-image flow: https://platform.openai.com/docs/guides/image-generation?lang=javascript

## Review Items Evaluated From `HERMES_STUDIO_V2_DIRECT_SCRIPT_REVIEW.md`

- **Accepted:** Direct-script mode needs a real-time length/time validation indicator. The current plan allowed arbitrary script text and target duration, but did not protect users from 40-character scripts stretched to 60 seconds or 500-character scripts compressed into 30 seconds.
- **Accepted:** Character reference images should be copied into the job directory before the workflow starts. Passing renderer-side temporary file paths directly to later Playwright/Flow steps is fragile and can break if the original file is moved, permission-limited, or unavailable.
- **Accepted:** Google Flow Ingredients upload must be modeled as a guarded UI workflow, not just `input[type=file].first()`. Flow requires mode switching and Add Image/Upload UI steps before file inputs are reliably available.
- **Accepted with adjustment:** Style presets should support DB-backed custom presets later, but the default app must not depend only on SQLite/Python for core startup. The robust design is: local curated presets as source-of-truth fallback, optional SQLite overlay for custom user presets.
- **Accepted:** Console UX should restore recent job events from the existing SQLite `task_events` table. The codebase already mirrors workflow events with `workflow-db-events.mjs` and `bot_db_helper.py get-recent-events`, so this is low-risk and useful.

## OpenAI Developers Review Items

- **Accepted:** Do not make OpenAI API mandatory for this feature. The user's prior constraint is to avoid API cost where possible, so the direct-script, Flow, character-sheet, style, and console work must function without `OPENAI_API_KEY`.
- **Accepted:** If OpenAI API is added later for thumbnail generation, prompt QA, or scene JSON generation, use the Responses API as the integration target. The plan should not add new Chat Completions JSON-mode code for new work.
- **Accepted:** Any OpenAI-generated scene contract must use Structured Outputs with `text.format.type = "json_schema"` and strict schemas. This is safer than relying on prompt instructions plus `json_object`.
- **Accepted:** API-based thumbnail/image generation should be an optional provider behind a switch such as `thumbnailProvider: "chatgpt-browser" | "openai-api" | "local-fallback"`. The default remains ChatGPT browser or local fallback until the user explicitly configures an OpenAI key and accepts API cost.
- **Accepted:** Character/reference images used with an optional OpenAI image provider should be sent as file IDs, URLs, or base64 data URLs according to the OpenAI image input contract. Do not pass local filesystem paths directly to the API.

---

## File Structure

- Modify `youtube-job-schema.mjs`: allow `sourceType: "script"`; add `options.characterSheet`, `options.stylePresetId`, `options.stylePreset`.
- Create `electron/services/direct-script-draft-service.mjs`: convert pasted script into a normalized draft while preserving narration.
- Create `electron/services/direct-script-duration.mjs`: estimate recommended narration duration from Korean script length and expose validation warnings.
- Create `electron/services/character-sheet-ingest.mjs`: copy selected reference images into `jobDir/character_sheets/` and return stable copied paths.
- Modify `electron/services/youtube-job-service.mjs`: pass direct script options through and label progress correctly.
- Modify `youtube-workflow-stages.mjs`: route `script` source to direct draft service instead of Gemini research.
- Modify `electron/services/script-planner.mjs`: inject style preset and character sheet into prompt building; keep sentence-level scene planning.
- Create `electron/services/style-presets.mjs`: local preset catalog, validation, and optional SQLite custom-preset overlay.
- Modify `bot_db_helper.py`: add `style_presets` table and commands for listing/upserting custom style presets.
- Create `electron/services/workflow-history-service.mjs`: load recent `task_events`/`task_failures` for a job and render them in the console.
- Create `electron/services/openai-provider-contract.mjs`: optional provider contract for future OpenAI API thumbnail/prompt QA integration; disabled unless explicitly configured.
- Create `automation/google-flow-ingredients.mjs`: focused helper for attaching reference images to Flow when character sheet images exist.
- Modify `automation/google-flow-media.mjs`: accept `ingredientImagePaths` and call the helper before submitting each scene.
- Modify `electron/renderer/index.html`: add `Script` source tab, script editor affordances, character sheet panel, style preset selector/gallery, improved console controls.
- Modify `electron/renderer/app.js`: read/write new controls, preview scene split, render style/character summaries, filter console logs.
- Modify `electron/renderer/styles.css`: make the Studio UI denser and easier to scan.
- Add tests:
  - `scripts/check-direct-script-source-mode.mjs`
  - `scripts/check-character-sheet-contract.mjs`
  - `scripts/check-style-presets-contract.mjs`
  - `scripts/check-direct-script-duration-validation.mjs`
  - `scripts/check-character-sheet-ingest.mjs`
  - `scripts/check-console-history-restore.mjs`
  - `scripts/check-openai-provider-optional-contract.mjs`
  - update `scripts/check-desktop-progress-feedback.mjs`
  - update `scripts/check-youtube-job-schema.mjs`
  - update `scripts/check-visual-storytelling-prompts.mjs`

---

## Task 1: Job Schema For Script Input

**Files:**
- Modify: `C:/Users/amd/hermes/youtube-job-schema.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-youtube-job-schema.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-direct-script-source-mode.mjs`

- [ ] **Step 1: Write failing schema test**

Add `scripts/check-direct-script-source-mode.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const job = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "첫 문장입니다. 두 번째 문장입니다. 마지막 교훈입니다.",
  options: {
    scriptLengthMode: "custom",
    customDurationSeconds: 45,
    stylePresetId: "cinematic-tech-news",
    characterSheet: {
      mode: "text-and-image",
      profileText: "A consistent Korean female tech reporter in her 30s, short black bob hair, navy blazer.",
      referenceImagePaths: ["C:/Users/amd/hermes/tests/fixtures/character-sheet.png"],
    },
  },
});

assert.equal(job.sourceType, "script");
assert.equal(job.options.scriptStructure, "direct-script");
assert.equal(job.options.sceneStrategy, "sentence-proportional");
assert.equal(job.options.stylePresetId, "cinematic-tech-news");
assert.equal(job.options.characterSheet.profileText.includes("Korean female tech reporter"), true);

console.log(JSON.stringify({ ok: true, checked: "direct-script-source-mode" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/check-direct-script-source-mode.mjs`

Expected: FAIL because `sourceType` is normalized to `keyword` and `direct-script` is not accepted.

- [ ] **Step 3: Implement schema changes**

In `youtube-job-schema.mjs`, update source normalization:

```js
const sourceType = ["keyword", "url", "script"].includes(input.sourceType) ? input.sourceType : "keyword";
```

Allow `scriptStructure`:

```js
options.scriptStructure = sourceType === "script"
  ? "direct-script"
  : String(options.scriptStructure || "hpsl").toLowerCase();
if (!["hpsl", "direct-script"].includes(options.scriptStructure)) {
  throw new Error(`Unknown scriptStructure: ${options.scriptStructure}`);
}
```

Add defaults:

```js
stylePresetId: "cinematic-tech-news",
stylePreset: {},
characterSheet: {
  mode: "none",
  profileText: "",
  referenceImagePaths: [],
},
```

Normalize the new options:

```js
options.stylePresetId = String(options.stylePresetId || "cinematic-tech-news");
options.characterSheet = normalizeCharacterSheet(options.characterSheet);
```

Add helper:

```js
function normalizeCharacterSheet(value = {}) {
  const mode = ["none", "text", "image", "text-and-image"].includes(value.mode) ? value.mode : "none";
  return {
    mode,
    profileText: String(value.profileText || "").trim(),
    referenceImagePaths: Array.isArray(value.referenceImagePaths)
      ? value.referenceImagePaths.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
      : [],
  };
}
```

- [ ] **Step 4: Run tests**

Run:

```powershell
node scripts/check-direct-script-source-mode.mjs
node scripts/check-youtube-job-schema.mjs
```

Expected: both PASS.

---

## Task 2: Direct Script Draft Service

**Files:**
- Create: `C:/Users/amd/hermes/electron/services/direct-script-draft-service.mjs`
- Modify: `C:/Users/amd/hermes/youtube-workflow-stages.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-direct-script-source-mode.mjs`

- [ ] **Step 1: Extend failing test for draft preservation**

Add to `scripts/check-direct-script-source-mode.mjs`:

```js
import { buildDirectScriptDraft } from "../electron/services/direct-script-draft-service.mjs";

const draft = buildDirectScriptDraft(job);
assert.equal(draft.structure, "direct-script");
assert.equal(draft.script, job.sourceValue);
assert.ok(draft.scenes.length >= 3, "direct script should become sentence-based scenes");
assert.equal(draft.scenes[0].narration, "첫 문장입니다.");
assert.ok(draft.scenes[0].image_prompt.includes("cinematic") || draft.scenes[0].image_prompt.includes("Visual category"));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/check-direct-script-source-mode.mjs`

Expected: FAIL because `direct-script-draft-service.mjs` does not exist.

- [ ] **Step 3: Implement direct script draft**

Create `electron/services/direct-script-draft-service.mjs`:

```js
import { SCRIPT_LENGTH_PRESETS } from "../../youtube-job-schema.mjs";
import { planScenesFromScript } from "./script-planner.mjs";

export function buildDirectScriptDraft(job) {
  const script = String(job.sourceValue || "").trim();
  if (!script) throw new Error("Direct script input is empty.");
  const preset = SCRIPT_LENGTH_PRESETS[job.options.scriptLengthPreset] || SCRIPT_LENGTH_PRESETS.standard;
  const targetSeconds = job.options.scriptLengthMode === "custom"
    ? Number(job.options.customDurationSeconds || preset.targetSeconds)
    : preset.targetSeconds;
  const title = inferTitle(script);
  const characterProfile = job.options.characterSheet?.profileText || "";
  const scenes = planScenesFromScript({
    script,
    title,
    targetSeconds,
    customDurationSeconds: targetSeconds,
    characterProfile,
    stylePreset: job.options.stylePreset,
    characterSheet: job.options.characterSheet,
  });
  return {
    title,
    structure: "direct-script",
    duration_seconds: targetSeconds,
    character_profile: characterProfile,
    script,
    scenes,
  };
}

function inferTitle(script) {
  const first = script.split(/[.!?\n]/).map((item) => item.trim()).find(Boolean) || "직접 입력 대본";
  return first.slice(0, 40);
}
```

- [ ] **Step 4: Route workflow**

In `youtube-workflow-stages.mjs`, import:

```js
import { buildDirectScriptDraft } from "./electron/services/direct-script-draft-service.mjs";
```

In `createDefaultYouTubeStages`, change draft stage:

```js
draft: (job, context) => job.sourceType === "script"
  ? buildDirectScriptDraft(job)
  : buildGeminiResearchDraft(job, context),
```

- [ ] **Step 5: Run test**

Run: `node scripts/check-direct-script-source-mode.mjs`

Expected: PASS.

---

## Task 3: Style Preset Catalog

**Files:**
- Create: `C:/Users/amd/hermes/electron/services/style-presets.mjs`
- Modify: `C:/Users/amd/hermes/bot_db_helper.py`
- Modify: `C:/Users/amd/hermes/youtube-job-schema.mjs`
- Modify: `C:/Users/amd/hermes/electron/main.mjs`
- Modify: `C:/Users/amd/hermes/electron/preload.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-style-presets-contract.mjs`

- [ ] **Step 1: Write failing style preset test**

Create `scripts/check-style-presets-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { listStylePresets, getStylePreset } from "../electron/services/style-presets.mjs";

const presets = listStylePresets();
assert.ok(presets.length >= 8, "should ship at least 8 curated style presets");
for (const id of [
  "cinematic-tech-news",
  "documentary-handheld",
  "clean-explainer",
  "product-macro",
  "futuristic-interface",
  "warm-human-story",
  "noir-investigation",
  "animated-clay",
]) {
  const preset = getStylePreset(id);
  assert.equal(preset.id, id);
  assert.ok(preset.promptSuffix.includes("Camera"));
  assert.ok(preset.promptSuffix.includes("Lighting"));
}

console.log(JSON.stringify({ ok: true, checked: "style-presets-contract" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/check-style-presets-contract.mjs`

Expected: FAIL because service does not exist.

- [ ] **Step 3: Implement preset catalog**

Create `electron/services/style-presets.mjs`:

```js
export const STYLE_PRESETS = [
  preset("cinematic-tech-news", "Cinematic Tech News", "polished realistic tech-news B-roll", "smooth dolly or slow push-in", "cool neutral studio lighting", "teal, steel, white"),
  preset("documentary-handheld", "Documentary Handheld", "observational documentary realism", "subtle handheld natural motion", "available light with soft contrast", "natural skin tones"),
  preset("clean-explainer", "Clean Explainer", "simple visual metaphor with clean composition", "locked-off or gentle pan", "bright even lighting", "white, graphite, accent color"),
  preset("product-macro", "Product Macro", "macro product detail, tactile surfaces", "slow macro tracking shot", "controlled studio highlights", "black, chrome, deep accent"),
  preset("futuristic-interface", "Futuristic Interface", "near-future interface environment without readable UI text", "slow orbit or parallax", "soft neon rim lighting", "cyan, emerald, graphite"),
  preset("warm-human-story", "Warm Human Story", "human-centered everyday realism", "gentle eye-level follow shot", "warm window light", "warm amber, soft blue"),
  preset("noir-investigation", "Noir Investigation", "dramatic investigative mood", "slow push through shadows", "low-key contrast lighting", "black, white, muted gold"),
  preset("animated-clay", "Animated Clay", "tactile clay animation style", "static camera with small handmade motion", "soft tabletop lighting", "colorful matte clay"),
];

function preset(id, label, aesthetic, camera, lighting, colorPalette) {
  return {
    id,
    label,
    description: aesthetic,
    aesthetic,
    camera,
    lighting,
    colorPalette,
    promptSuffix: `Style: ${aesthetic}. Camera: ${camera}. Lighting: ${lighting}. Color palette: ${colorPalette}. Keep composition clear and avoid readable text, logos, watermarks, or UI labels.`,
  };
}

export function listStylePresets() {
  return STYLE_PRESETS;
}

export function getStylePreset(id = "cinematic-tech-news") {
  return STYLE_PRESETS.find((item) => item.id === id) || STYLE_PRESETS[0];
}
```

- [ ] **Step 4: Add optional SQLite custom preset storage**

The review document suggested moving presets into SQLite. That is valid for user-defined presets, but the base 8 presets must remain local so the packaged app can render its first screen even if Python/SQLite is unavailable. Add `style_presets` as an overlay table in `bot_db_helper.py`:

```python
conn.execute(
    """
    CREATE TABLE IF NOT EXISTS style_presets (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        aesthetic TEXT NOT NULL,
        camera TEXT,
        lighting TEXT,
        color_palette TEXT,
        prompt_suffix TEXT NOT NULL,
        is_custom INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """
)
```

Add command:

```python
def list_style_presets() -> None:
    init_db()
    with connect() as conn:
        rows = conn.execute(
            """
            SELECT id, label, aesthetic, camera, lighting, color_palette, prompt_suffix, is_custom
            FROM style_presets
            ORDER BY is_custom ASC, label ASC
            """
        ).fetchall()
    print_json([dict(row) for row in rows])
```

Add parser:

```python
sub.add_parser("list-style-presets")
```

and dispatcher:

```python
elif args.cmd == "list-style-presets":
    list_style_presets()
```

Update `electron/services/style-presets.mjs` to expose:

```js
export function listStylePresets({ dbHelperPath = "", pythonBin = "python" } = {}) {
  const dbPresets = listDbStylePresets({ dbHelperPath, pythonBin });
  const merged = new Map(STYLE_PRESETS.map((preset) => [preset.id, preset]));
  for (const preset of dbPresets) merged.set(preset.id, normalizePreset(preset));
  return Array.from(merged.values());
}
```

`listDbStylePresets` must catch spawn/JSON failures and return `[]` so UI startup never depends on DB health.

- [ ] **Step 5: Expose through IPC**

In `electron/main.mjs`:

```js
import { listStylePresets } from "./services/style-presets.mjs";
ipcMain.handle("presets:styles", async () => listStylePresets({
  dbHelperPath: join(paths.appRoot, "bot_db_helper.py"),
}));
```

In `electron/preload.mjs`:

```js
stylePresets: () => ipcRenderer.invoke("presets:styles"),
```

- [ ] **Step 6: Run test**

Run: `node scripts/check-style-presets-contract.mjs`

Expected: PASS.

---

## Task 4: Prompt Builder Uses Style Presets And Character Sheet

**Files:**
- Modify: `C:/Users/amd/hermes/electron/services/script-planner.mjs`
- Modify: `C:/Users/amd/hermes/youtube-workflow.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-visual-storytelling-prompts.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-character-sheet-contract.mjs`

- [ ] **Step 1: Write failing character sheet test**

Create `scripts/check-character-sheet-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { planScenesFromScript } from "../electron/services/script-planner.mjs";
import { getStylePreset } from "../electron/services/style-presets.mjs";

const scenes = planScenesFromScript({
  title: "스마트 글래스",
  script: "첫 장면입니다. 둘째 장면입니다. 셋째 장면입니다.",
  targetSeconds: 30,
  customDurationSeconds: 30,
  characterProfile: "A consistent Korean male engineer in his 30s, black hair, gray jacket.",
  stylePreset: getStylePreset("documentary-handheld"),
  characterSheet: {
    mode: "text-and-image",
    profileText: "A consistent Korean male engineer in his 30s, black hair, gray jacket.",
    referenceImagePaths: ["C:/Users/amd/hermes/tests/fixtures/character-sheet.png"],
  },
});

assert.ok(scenes.length >= 3);
assert.ok(scenes[0].image_prompt.includes("documentary realism"));
assert.ok(scenes[0].image_prompt.includes("Korean male engineer"));
assert.ok(scenes[0].flow_prompt_safety);

console.log(JSON.stringify({ ok: true, checked: "character-sheet-contract" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/check-character-sheet-contract.mjs`

Expected: FAIL because `stylePreset` is ignored.

- [ ] **Step 3: Modify planner signatures**

In `script-planner.mjs`, update function signatures:

```js
export function planScenesFromScript({ script, title, targetSeconds, customDurationSeconds, characterProfile, stylePreset, characterSheet }) {
```

and:

```js
export function planScenesFromHpsl({ title, hpsl = {}, targetSeconds = 60, characterProfile, stylePreset, characterSheet }) {
```

- [ ] **Step 4: Inject style and character rules**

Update `buildVisualStoryPrompt` call sites to pass `stylePreset` and `characterSheet`. Update builder:

```js
function buildVisualStoryPrompt({ title, narration, order, visualCategory, characterProfile, stylePreset, characterSheet }) {
  const visual = inferVisualKeywords({ title, narration });
  return [
    "9:16 cinematic YouTube shorts scene.",
    `Visual category: ${visualCategory}.`,
    `Narration context: ${narration}`,
    `Main visual idea: ${visual.mainSubject}.`,
    `Visible action: ${visual.action}.`,
    `Scene keywords: ${visual.keywords.join(", ")}.`,
    stylePreset?.promptSuffix || "",
    characterPrompt(characterProfile, characterSheet),
    "No subtitles, no readable text, no logos, no watermarks.",
  ].filter(Boolean).join(" ");
}

function characterPrompt(characterProfile, characterSheet = {}) {
  const profile = characterSheet.profileText || characterProfile;
  if (!profile) return "Use objects, environments, demonstrations, and visual metaphors over a talking presenter.";
  return `Character consistency: if a recurring human is needed, use this exact character sheet: ${profile}. Do not change age, gender, ethnicity, hairstyle, outfit, or role between scenes. If reference images are attached in Flow, match the same identity and outfit.`;
}
```

- [ ] **Step 5: Run tests**

Run:

```powershell
node scripts/check-character-sheet-contract.mjs
node scripts/check-visual-storytelling-prompts.mjs
```

Expected: both PASS.

---

## Task 5: Google Flow Character Reference Images

**Files:**
- Create: `C:/Users/amd/hermes/automation/google-flow-ingredients.mjs`
- Create: `C:/Users/amd/hermes/electron/services/character-sheet-ingest.mjs`
- Modify: `C:/Users/amd/hermes/automation/google-flow-media.mjs`
- Modify: `C:/Users/amd/hermes/electron/services/youtube-job-service.mjs`
- Modify: `C:/Users/amd/hermes/youtube-workflow-stages.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-character-sheet-contract.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-character-sheet-ingest.mjs`

- [ ] **Step 1: Extend failing test for Flow ingredients**

Add to `scripts/check-character-sheet-contract.mjs`:

```js
import { buildFlowIngredientPlan } from "../automation/google-flow-ingredients.mjs";

const ingredientPlan = buildFlowIngredientPlan({
  characterSheet: {
    mode: "text-and-image",
    profileText: "A consistent Korean male engineer.",
    referenceImagePaths: ["C:/Users/amd/hermes/tests/fixtures/character-sheet.png"],
  },
});
assert.equal(ingredientPlan.enabled, true);
assert.equal(ingredientPlan.paths.length, 1);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/check-character-sheet-contract.mjs`

Expected: FAIL because helper does not exist.

- [ ] **Step 3: Write failing ingestion test**

Create `scripts/check-character-sheet-ingest.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ingestCharacterSheet } from "../electron/services/character-sheet-ingest.mjs";

const root = join(tmpdir(), `hermes-character-ingest-${Date.now()}`);
const sourceDir = join(root, "source");
const jobDir = join(root, "job");
mkdirSync(sourceDir, { recursive: true });
const imagePath = join(sourceDir, "hero.png");
writeFileSync(imagePath, Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));

const result = await ingestCharacterSheet({
  jobDir,
  characterSheet: {
    mode: "image",
    profileText: "A stable presenter.",
    referenceImagePaths: [imagePath],
  },
});

assert.equal(result.referenceImagePaths.length, 1);
assert.ok(result.referenceImagePaths[0].includes("character_sheets"));
assert.ok(existsSync(result.referenceImagePaths[0]));
assert.equal(result.profileText, "A stable presenter.");

rmSync(root, { recursive: true, force: true });
console.log(JSON.stringify({ ok: true, checked: "character-sheet-ingest" }));
```

- [ ] **Step 4: Run ingestion test to verify it fails**

Run: `node scripts/check-character-sheet-ingest.mjs`

Expected: FAIL because service does not exist.

- [ ] **Step 5: Implement character sheet ingestion**

Create `electron/services/character-sheet-ingest.mjs`:

```js
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, extname, join } from "node:path";

const ALLOWED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function ingestCharacterSheet({ jobDir, characterSheet = {} } = {}) {
  const outputDir = join(jobDir, "character_sheets");
  const sourcePaths = Array.isArray(characterSheet.referenceImagePaths)
    ? characterSheet.referenceImagePaths.filter(Boolean).slice(0, 4)
    : [];
  await mkdir(outputDir, { recursive: true });
  const copied = [];
  for (let index = 0; index < sourcePaths.length; index += 1) {
    const sourcePath = sourcePaths[index];
    const ext = extname(sourcePath).toLowerCase();
    if (!ALLOWED_IMAGE_EXTENSIONS.has(ext)) continue;
    if (!existsSync(sourcePath)) continue;
    const targetPath = join(outputDir, `${String(index + 1).padStart(2, "0")}-${safeBaseName(sourcePath)}`);
    await copyFile(sourcePath, targetPath);
    copied.push(targetPath);
  }
  return {
    ...characterSheet,
    mode: copied.length && characterSheet.profileText ? "text-and-image" : copied.length ? "image" : characterSheet.profileText ? "text" : "none",
    referenceImagePaths: copied,
  };
}

function safeBaseName(path) {
  return basename(path).replace(/[^a-zA-Z0-9._-]/g, "_");
}
```

- [ ] **Step 6: Use copied paths in job service**

In `electron/services/youtube-job-service.mjs`, import:

```js
import { ingestCharacterSheet } from "./character-sheet-ingest.mjs";
```

After `jobDir` is created and before stages are built:

```js
job.options.characterSheet = await ingestCharacterSheet({
  jobDir,
  characterSheet: job.options.characterSheet,
});
```

This ensures Flow receives stable `jobDir/character_sheets/*` paths, not fragile renderer file paths.

- [ ] **Step 7: Implement ingredient plan helper**

Create `automation/google-flow-ingredients.mjs`:

```js
import { existsSync } from "node:fs";

export function buildFlowIngredientPlan({ characterSheet = {} } = {}) {
  const paths = Array.isArray(characterSheet.referenceImagePaths)
    ? characterSheet.referenceImagePaths.filter((path) => existsSync(path)).slice(0, 4)
    : [];
  return {
    enabled: paths.length > 0,
    paths,
    mode: paths.length ? "ingredients-to-video" : "text-to-video",
  };
}

export async function attachFlowIngredients(page, paths = []) {
  if (!paths.length) return { attached: 0 };
  let attached = 0;
  for (const filePath of paths) {
    await openIngredientsUpload(page);
    const input = page.locator("input[type=file]").last();
    await input.waitFor({ state: "attached", timeout: 10000 });
    await input.setInputFiles(filePath);
    await page.waitForTimeout(800);
    attached += 1;
  }
  return { attached };
}

async function openIngredientsUpload(page) {
  const buttons = [
    page.getByText(/Ingredients to Video|재료|Ingredients/i).first(),
    page.getByText(/Add Image|이미지 추가|Upload|업로드/i).first(),
    page.locator("button").filter({ hasText: /Add|Upload|Image|이미지|업로드/i }).first(),
  ];
  for (const button of buttons) {
    try {
      await button.click({ timeout: 3000 });
      return;
    } catch {}
  }
  throw new Error("Google Flow Ingredients upload control was not found.");
}
```

- [ ] **Step 8: Thread ingredient paths into Flow automation**

In `youtube-workflow-stages.mjs`, when calling `generateGoogleFlowVideoFromPrompt`, pass:

```js
ingredientImagePaths: context.job?.options?.characterSheet?.referenceImagePaths || [],
```

In `automation/google-flow-media.mjs`, import and call before submit:

```js
import { attachFlowIngredients } from "./google-flow-ingredients.mjs";
await attachFlowIngredients(page, ingredientImagePaths || []);
```

- [ ] **Step 9: Save diagnostics on ingredient failure**

In `automation/google-flow-media.mjs`, wrap ingredient attachment:

```js
try {
  const ingredientResult = await attachFlowIngredients(page, ingredientImagePaths || []);
  if (ingredientResult.attached) {
    await page.screenshot({ path: join(outputDir, `scene_${sceneOrder}_flow_ingredients_attached.png`), fullPage: true });
  }
} catch (error) {
  await page.screenshot({ path: join(outputDir, `scene_${sceneOrder}_flow_ingredients_failed.png`), fullPage: true }).catch(() => {});
  await writeFile(join(outputDir, `scene_${sceneOrder}_flow_ingredients_error.json`), JSON.stringify({
    message: error.message,
    ingredientImagePaths,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
}
```

Then continue with text-only prompt fallback rather than failing the whole video.

- [ ] **Step 10: Run tests**

Run:

```powershell
node scripts/check-character-sheet-contract.mjs
node scripts/check-character-sheet-ingest.mjs
node --check automation/google-flow-media.mjs
```

Expected: PASS.

---

## Task 6: Electron UI For Script, Character Sheet, Style Presets

**Files:**
- Modify: `C:/Users/amd/hermes/electron/renderer/index.html`
- Modify: `C:/Users/amd/hermes/electron/renderer/app.js`
- Modify: `C:/Users/amd/hermes/electron/renderer/styles.css`
- Create: `C:/Users/amd/hermes/electron/services/direct-script-duration.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-local-studio-product.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-studio-v2-ux.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-direct-script-duration-validation.mjs`

- [ ] **Step 1: Write failing UI checks**

Add assertions to `scripts/check-studio-v2-ux.mjs`:

```js
assert.match(html, /value="script"/, "source selector should include direct script mode");
assert.match(html, /id="characterSheetText"/, "UI should include character sheet text input");
assert.match(html, /id="characterSheetImages"/, "UI should include character sheet image picker");
assert.match(html, /id="stylePresetId"/, "UI should include style preset selector");
assert.match(html, /id="sceneSplitPreview"/, "UI should preview sentence-to-scene split");
assert.match(renderer, /stylePresets\(\)/, "renderer should load style presets from IPC");
assert.match(renderer, /characterSheet/, "renderer should submit character sheet options");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/check-studio-v2-ux.mjs`

Expected: FAIL because controls do not exist.

- [ ] **Step 3: Add direct script duration validation test**

Create `scripts/check-direct-script-duration-validation.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { estimateDirectScriptDuration } from "../electron/services/direct-script-duration.mjs";

const short = estimateDirectScriptDuration({
  script: "짧은 문장입니다.",
  targetSeconds: 60,
});
assert.equal(short.severity, "warning");
assert.ok(short.message.includes("짧"));

const long = estimateDirectScriptDuration({
  script: "이 문장은 테스트용입니다. ".repeat(80),
  targetSeconds: 30,
});
assert.equal(long.severity, "warning");
assert.ok(long.message.includes("깁") || long.message.includes("빠"));

const balanced = estimateDirectScriptDuration({
  script: "이 영상은 직접 입력 대본을 기반으로 장면을 나누고 자연스럽게 렌더링하는 테스트입니다. 핵심은 문장별 프롬프트와 적절한 음성 길이를 맞추는 것입니다.",
  targetSeconds: 30,
});
assert.equal(balanced.severity, "ok");

console.log(JSON.stringify({ ok: true, checked: "direct-script-duration-validation" }));
```

- [ ] **Step 4: Run validation test to verify it fails**

Run: `node scripts/check-direct-script-duration-validation.mjs`

Expected: FAIL because service does not exist.

- [ ] **Step 5: Implement duration estimator**

Create `electron/services/direct-script-duration.mjs`:

```js
export function estimateDirectScriptDuration({ script = "", targetSeconds = 60 } = {}) {
  const compactLength = String(script || "").replace(/\s+/g, "").length;
  const estimatedSeconds = Math.max(3, Math.round(compactLength / 5.5));
  const ratio = estimatedSeconds / Math.max(1, Number(targetSeconds || 60));
  if (ratio < 0.55) {
    return {
      severity: "warning",
      estimatedSeconds,
      ratio,
      message: `대본이 설정 시간보다 짧습니다. 예상 음성 ${estimatedSeconds}초 / 목표 ${targetSeconds}초라 영상이 늘어지거나 반복될 수 있습니다.`,
    };
  }
  if (ratio > 1.35) {
    return {
      severity: "warning",
      estimatedSeconds,
      ratio,
      message: `대본이 설정 시간보다 깁니다. 예상 음성 ${estimatedSeconds}초 / 목표 ${targetSeconds}초라 TTS가 빠르거나 잘릴 수 있습니다.`,
    };
  }
  return {
    severity: "ok",
    estimatedSeconds,
    ratio,
    message: `예상 음성 ${estimatedSeconds}초 / 목표 ${targetSeconds}초`,
  };
}
```

- [ ] **Step 6: Add source mode UI**

In `index.html`, add a third segmented option:

```html
<label><input type="radio" name="sourceType" value="script"><span>Script</span></label>
```

Change label text dynamically in `app.js`:

```js
function updateSourceModeUi() {
  const type = getSourceType();
  sourceLabel.textContent = type === "script" ? "직접 입력 대본" : type === "url" ? "기사 URL" : "키워드";
  sourceValue.placeholder = type === "script"
    ? "완성된 한국어 대본을 붙여넣으세요. 문장 단위로 장면이 생성됩니다."
    : type === "url"
      ? "https://..."
      : "예: 최신 AI 뉴스";
}
```

- [ ] **Step 7: Add real-time duration indicator to script preview**

Add a block below `sceneSplitPreview`:

```html
<div id="scriptDurationValidation" class="duration-validation">직접 대본 모드에서 예상 음성 길이가 표시됩니다.</div>
```

In `app.js`, import-equivalent logic can be duplicated for renderer simplicity:

```js
function estimateScriptSeconds(script) {
  return Math.max(3, Math.round(String(script || "").replace(/\s+/g, "").length / 5.5));
}

function updateScriptDurationValidation() {
  if (getSourceType() !== "script") {
    scriptDurationValidation.textContent = "직접 대본 모드에서 예상 음성 길이가 표시됩니다.";
    scriptDurationValidation.className = "duration-validation";
    return;
  }
  const target = effectiveTargetSeconds();
  const estimated = estimateScriptSeconds(sourceValue.value);
  const ratio = estimated / Math.max(1, target);
  const warning = ratio < 0.55 || ratio > 1.35;
  scriptDurationValidation.className = warning ? "duration-validation is-warning" : "duration-validation is-ok";
  scriptDurationValidation.textContent = warning
    ? `주의: 예상 음성 ${estimated}초 / 목표 ${target}초입니다. 대본 길이나 목표 시간을 조정하세요.`
    : `적정: 예상 음성 ${estimated}초 / 목표 ${target}초`;
}
```

Call `updateScriptDurationValidation()` from source mode, script text, duration preset, and custom duration input handlers.

- [ ] **Step 8: Add character sheet controls**

Add panel:

```html
<section class="sub-panel character-panel">
  <h4>Character Sheet</h4>
  <textarea id="characterSheetText" rows="4" placeholder="예: 30대 한국인 여성 테크 리포터, 단발 검은 머리, 네이비 재킷..."></textarea>
  <input id="characterSheetImages" type="file" accept="image/*" multiple>
  <div id="characterSheetSummary">참조 이미지 없음</div>
</section>
```

- [ ] **Step 9: Add style preset controls**

Add:

```html
<div class="field-group">
  <label for="stylePresetId">영상 스타일 프리셋</label>
  <select id="stylePresetId"></select>
  <div id="stylePresetPreview" class="preset-preview"></div>
</div>
```

In `app.js`, load presets:

```js
async function populateStylePresets() {
  const presets = await window.hermes.stylePresets();
  stylePresetId.replaceChildren(...presets.map((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    option.dataset.description = preset.description;
    return option;
  }));
  updateStylePresetPreview();
}
```

- [ ] **Step 10: Read new job input**

Update `readJobInput()`:

```js
stylePresetId: stylePresetId.value,
characterSheet: {
  mode: characterSheetImages.files.length && characterSheetText.value.trim()
    ? "text-and-image"
    : characterSheetImages.files.length
      ? "image"
      : characterSheetText.value.trim()
        ? "text"
        : "none",
  profileText: characterSheetText.value.trim(),
  referenceImagePaths: Array.from(characterSheetImages.files).map((file) => file.path).filter(Boolean),
},
```

- [ ] **Step 11: Scene split preview**

Add `sceneSplitPreview` block and renderer preview:

```js
function updateSceneSplitPreview() {
  if (getSourceType() !== "script") {
    sceneSplitPreview.textContent = "직접 대본 모드에서 문장별 장면 미리보기가 표시됩니다.";
    return;
  }
  const sentences = sourceValue.value.split(/(?<=[.!?。！？])\s+/).map((item) => item.trim()).filter(Boolean);
  sceneSplitPreview.textContent = `${sentences.length}개 문장 감지 · 문장 단위 Flow 프롬프트 생성`;
}
```

- [ ] **Step 12: Run UI tests**

Run:

```powershell
node scripts/check-studio-v2-ux.mjs
node scripts/check-local-studio-product.mjs
node scripts/check-direct-script-duration-validation.mjs
```

Expected: PASS.

---

## Task 7: Console UI/UX Upgrade

**Files:**
- Modify: `C:/Users/amd/hermes/electron/renderer/index.html`
- Modify: `C:/Users/amd/hermes/electron/renderer/app.js`
- Modify: `C:/Users/amd/hermes/electron/renderer/styles.css`
- Modify: `C:/Users/amd/hermes/electron/services/job-progress-events.mjs`
- Create: `C:/Users/amd/hermes/electron/services/workflow-history-service.mjs`
- Modify: `C:/Users/amd/hermes/electron/main.mjs`
- Modify: `C:/Users/amd/hermes/electron/preload.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-desktop-progress-feedback.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-console-history-restore.mjs`

- [ ] **Step 1: Write failing console UX checks**

Add to `scripts/check-desktop-progress-feedback.mjs`:

```js
assert.match(html, /id="consoleFilters"/, "console should have stage/severity filters");
assert.match(html, /id="artifactPanel"/, "console should expose generated artifacts");
assert.match(renderer, /renderConsoleEvent/, "renderer should format console events for humans");
assert.match(renderer, /eventSeverity/, "renderer should classify event severity");
assert.match(renderer, /copyJobSummary/, "renderer should support copying a job summary");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/check-desktop-progress-feedback.mjs`

Expected: FAIL because console UI is still raw log-first.

- [ ] **Step 3: Write failing history restore test**

Create `scripts/check-console-history-restore.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getRecentWorkflowEvents } from "../electron/services/workflow-history-service.mjs";

const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
const preload = readFileSync(new URL("../electron/preload.mjs", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../electron/renderer/app.js", import.meta.url), "utf8");

assert.equal(typeof getRecentWorkflowEvents, "function");
assert.match(main, /workflow:recentEvents/, "main should expose workflow history IPC");
assert.match(preload, /workflowRecentEvents/, "preload should expose workflow history to renderer");
assert.match(renderer, /restoreConsoleHistory/, "renderer should restore console history when opening a job");

const events = getRecentWorkflowEvents({
  dbHelperPath: "C:/Users/amd/hermes/bot_db_helper.py",
  jobId: "missing-job-for-test",
  limit: 5,
});
assert.ok(Array.isArray(events), "history lookup should return an array even when no events exist");

console.log(JSON.stringify({ ok: true, checked: "console-history-restore" }));
```

- [ ] **Step 4: Run history test to verify it fails**

Run: `node scripts/check-console-history-restore.mjs`

Expected: FAIL because service and IPC do not exist.

- [ ] **Step 5: Implement workflow history service**

Create `electron/services/workflow-history-service.mjs`:

```js
import { spawnSync } from "node:child_process";

export function getRecentWorkflowEvents({ dbHelperPath, pythonBin = "python", jobId = "", limit = 50 } = {}) {
  if (!dbHelperPath || !jobId) return [];
  const result = spawnSync(pythonBin, [
    dbHelperPath,
    "get-recent-events",
    String(limit),
    "desktop",
    "0",
    "--job-id",
    jobId,
  ], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) return [];
  try {
    return JSON.parse(result.stdout);
  } catch {
    return [];
  }
}
```

- [ ] **Step 6: Expose history IPC**

In `electron/main.mjs`:

```js
import { getRecentWorkflowEvents } from "./services/workflow-history-service.mjs";

ipcMain.handle("workflow:recentEvents", async (_event, jobId) => getRecentWorkflowEvents({
  dbHelperPath: join(paths.appRoot, "bot_db_helper.py"),
  jobId,
}));
```

In `electron/preload.mjs`:

```js
workflowRecentEvents: (jobId) => ipcRenderer.invoke("workflow:recentEvents", jobId),
```

- [ ] **Step 7: Add console layout**

Add to console panel:

```html
<div id="consoleFilters" class="console-filters">
  <button data-filter="all" class="is-active">All</button>
  <button data-filter="warning">Warnings</button>
  <button data-filter="error">Errors</button>
  <button data-filter="artifact">Artifacts</button>
</div>
<div id="artifactPanel" class="artifact-panel"></div>
<button id="copyJobSummaryBtn" class="secondary-button compact-button" type="button">Copy Summary</button>
```

- [ ] **Step 8: Format logs**

In `app.js`, replace raw-only append with:

```js
function eventSeverity(event) {
  if (/failed|error/i.test(event.type || event.message || "")) return "error";
  if (event.type === "workflow-warning" || event.status === "action-required") return "warning";
  if (event.details?.finalPath || event.details?.thumbnailPath) return "artifact";
  return "info";
}

function renderConsoleEvent(event) {
  return {
    title: event.phase || event.type || "event",
    severity: eventSeverity(event),
    message: event.message || event.label || "",
    detail: event.details || event.input || null,
  };
}
```

- [ ] **Step 9: Add artifact panel**

When events contain paths:

```js
function updateArtifactPanel(details = {}) {
  const paths = [details.finalPath, details.thumbnailPath, details.jobDir].filter(Boolean);
  for (const targetPath of paths) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = targetPath.split(/[\\/]/).pop();
    button.addEventListener("click", () => window.hermes.openPath(targetPath));
    artifactPanel.prepend(button);
  }
}
```

- [ ] **Step 10: Restore history when selecting a job**

In `app.js`, add:

```js
async function restoreConsoleHistory(jobId) {
  const events = await window.hermes.workflowRecentEvents(jobId);
  for (const event of events.reverse()) {
    appendLog(`History: ${event.event_type}`, event.data || event);
  }
}
```

When rendering the jobs list, make each job item restore history:

```js
button.addEventListener("click", async () => {
  await restoreConsoleHistory(job.id);
  if (job.jobDir) {
    latestOutputPath = job.jobDir;
    latestOutput.disabled = false;
    latestOutput.textContent = job.jobDir;
  }
});
```

- [ ] **Step 11: Copy summary**

Add:

```js
async function copyJobSummary() {
  const text = [
    `State: ${jobState.textContent}`,
    `Progress: ${jobProgressPercent.textContent}`,
    `Message: ${currentProgressMessage.textContent}`,
    `Output: ${latestOutputPath}`,
  ].join("\n");
  await navigator.clipboard.writeText(text);
}
```

- [ ] **Step 12: Run console tests**

Run:

```powershell
node scripts/check-desktop-progress-feedback.mjs
node scripts/check-console-history-restore.mjs
```

Expected: PASS.

---

## Task 8: End-To-End Verification And Packaging

**Files:**
- Modify: `C:/Users/amd/hermes/package.json`
- Modify: `C:/Users/amd/hermes/scripts/check-packaged-runtime-contract.mjs`

- [ ] **Step 1: Add new checks to package script**

Update `package.json`:

```json
"check:studio-inputs": "node scripts/check-direct-script-source-mode.mjs && node scripts/check-character-sheet-contract.mjs && node scripts/check-style-presets-contract.mjs"
```

Add `npm run check:studio-inputs` into the main `check` chain after `check:visual-storytelling`.

After review incorporation, the final script should be:

```json
"check:studio-inputs": "node scripts/check-direct-script-source-mode.mjs && node scripts/check-direct-script-duration-validation.mjs && node scripts/check-character-sheet-contract.mjs && node scripts/check-character-sheet-ingest.mjs && node scripts/check-style-presets-contract.mjs && node scripts/check-console-history-restore.mjs"
```

- [ ] **Step 2: Packaged runtime contract**

In `scripts/check-packaged-runtime-contract.mjs`, assert packaged app includes:

```js
readFileSync(join(extractDir, "electron/services/direct-script-draft-service.mjs"), "utf8");
readFileSync(join(extractDir, "electron/services/direct-script-duration.mjs"), "utf8");
readFileSync(join(extractDir, "electron/services/character-sheet-ingest.mjs"), "utf8");
readFileSync(join(extractDir, "electron/services/style-presets.mjs"), "utf8");
readFileSync(join(extractDir, "electron/services/workflow-history-service.mjs"), "utf8");
readFileSync(join(extractDir, "automation/google-flow-ingredients.mjs"), "utf8");
```

- [ ] **Step 3: Run source checks**

Run:

```powershell
npm.cmd run check:studio-inputs
npm.cmd run smoke:youtube-mock
npm.cmd run check
```

Expected: all PASS.

- [ ] **Step 4: Rebuild app**

Run:

```powershell
Get-Process | Where-Object { $_.ProcessName -eq 'Hermes YouTube Studio' } | Stop-Process -Force
npm.cmd run electron:pack
node scripts/check-packaged-runtime-contract.mjs
```

Expected: pack succeeds and packaged runtime contract PASS.

- [ ] **Step 5: Manual smoke test**

Run desktop app and submit a direct script job in Mock Media Mode:

```text
sourceType: Script
script: "첫 장면입니다. 두 번째 장면입니다. 마지막 교훈입니다."
stylePresetId: cinematic-tech-news
characterSheetText: "A consistent Korean female tech reporter in her 30s, short black bob hair, navy blazer."
mockMediaMode: checked
```

Expected:
- UI shows direct script mode.
- Scene split preview shows 3 sentences.
- Job completes.
- `draft.json` has `structure: "direct-script"`.
- `draft.json.scenes[*].image_prompt` includes style and character rules.
- Console shows readable progress, warnings, and final artifacts.

---

## Task 9: Optional OpenAI Provider Contract

**Files:**
- Create: `C:/Users/amd/hermes/electron/services/openai-provider-contract.mjs`
- Modify: `C:/Users/amd/hermes/youtube-job-schema.mjs`
- Modify: `C:/Users/amd/hermes/package.json`
- Modify: `C:/Users/amd/hermes/scripts/check-packaged-runtime-contract.mjs`
- Test: `C:/Users/amd/hermes/scripts/check-openai-provider-optional-contract.mjs`

This task is a contract guard, not a full paid API implementation. It prevents future work from accidentally making OpenAI API required or using older JSON-mode patterns. The actual API provider can be implemented later only after the user explicitly configures an API key and accepts cost.

- [ ] **Step 1: Write failing optional-provider test**

Create `scripts/check-openai-provider-optional-contract.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { OPENAI_PROVIDER_MODES, buildOpenAiSceneSchema, shouldUseOpenAiProvider } from "../electron/services/openai-provider-contract.mjs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

assert.deepEqual(OPENAI_PROVIDER_MODES, ["disabled", "thumbnail-api", "scene-json-api", "prompt-qa-api"]);

const defaultJob = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다.",
});
assert.equal(defaultJob.options.openaiProviderMode, "disabled");
assert.equal(shouldUseOpenAiProvider(defaultJob.options), false, "OpenAI API must be off by default");

const schema = buildOpenAiSceneSchema();
assert.equal(schema.type, "json_schema");
assert.equal(schema.strict, true);
assert.equal(schema.schema.type, "object");
assert.ok(schema.schema.required.includes("scenes"));
assert.ok(schema.schema.properties.scenes.items.required.includes("image_prompt"));

console.log(JSON.stringify({ ok: true, checked: "openai-provider-optional-contract" }));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/check-openai-provider-optional-contract.mjs`

Expected: FAIL because `openai-provider-contract.mjs` does not exist.

- [ ] **Step 3: Implement provider contract**

Create `electron/services/openai-provider-contract.mjs`:

```js
export const OPENAI_PROVIDER_MODES = ["disabled", "thumbnail-api", "scene-json-api", "prompt-qa-api"];

export function shouldUseOpenAiProvider(options = {}) {
  return OPENAI_PROVIDER_MODES.includes(options.openaiProviderMode)
    && options.openaiProviderMode !== "disabled"
    && Boolean(options.openaiApiKeyConfigured);
}

export function buildOpenAiSceneSchema() {
  return {
    type: "json_schema",
    name: "hermes_scene_plan",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["title", "script", "scenes"],
      properties: {
        title: { type: "string" },
        script: { type: "string" },
        scenes: {
          type: "array",
          minItems: 1,
          maxItems: 18,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["order", "narration", "visual_category", "image_prompt", "duration_seconds"],
            properties: {
              order: { type: "integer", minimum: 1 },
              narration: { type: "string" },
              visual_category: { type: "string" },
              image_prompt: { type: "string" },
              duration_seconds: { type: "number", minimum: 1 },
            },
          },
        },
      },
    },
  };
}
```

- [ ] **Step 4: Add schema defaults**

In `youtube-job-schema.mjs`, add:

```js
openaiProviderMode: "disabled",
openaiApiKeyConfigured: false,
```

Normalize:

```js
if (!["disabled", "thumbnail-api", "scene-json-api", "prompt-qa-api"].includes(options.openaiProviderMode)) {
  throw new Error(`Unknown openaiProviderMode: ${options.openaiProviderMode}`);
}
options.openaiApiKeyConfigured = Boolean(options.openaiApiKeyConfigured);
```

- [ ] **Step 5: Document future API implementation guardrails**

When the optional provider is implemented later, use the Responses API:

```js
const response = await openai.responses.create({
  model: "gpt-5",
  input: [
    {
      role: "user",
      content: [
        { type: "input_text", text: prompt },
        ...referenceImages.map((imageUrl) => ({ type: "input_image", image_url: imageUrl })),
      ],
    },
  ],
  text: { format: buildOpenAiSceneSchema() },
});
```

For optional thumbnail generation, use the Responses API `image_generation` tool or Image API only when `openaiProviderMode === "thumbnail-api"` and a key is configured. For reference images, pass URL/base64 data URL/File ID, never local paths.

- [ ] **Step 6: Add checks**

Update `package.json` `check:studio-inputs`:

```json
"check:studio-inputs": "node scripts/check-direct-script-source-mode.mjs && node scripts/check-direct-script-duration-validation.mjs && node scripts/check-character-sheet-contract.mjs && node scripts/check-character-sheet-ingest.mjs && node scripts/check-style-presets-contract.mjs && node scripts/check-console-history-restore.mjs && node scripts/check-openai-provider-optional-contract.mjs"
```

Update `scripts/check-packaged-runtime-contract.mjs`:

```js
readFileSync(join(extractDir, "electron/services/openai-provider-contract.mjs"), "utf8");
```

- [ ] **Step 7: Run tests**

Run:

```powershell
node scripts/check-openai-provider-optional-contract.mjs
npm.cmd run check:studio-inputs
npm.cmd run check
```

Expected: all PASS.

---

## Self-Review

- Direct script source mode is covered by Tasks 1, 2, and 6.
- Sentence-based scene prompt generation is covered by Tasks 2 and 4 using existing `planScenesFromScript`.
- Direct script duration validation is covered by Task 6 using `direct-script-duration.mjs`.
- Character sheet text, copied reference image lifecycle, and Flow Ingredients attachment are covered by Tasks 1, 4, 5, and 6.
- Style presets based on web/GitHub research are covered by Task 3 and injected in Task 4. The review suggestion to store presets in DB is partially incorporated as a custom-preset overlay while local base presets remain the startup-safe fallback.
- Console UI/UX improvements and event history restoration from SQLite `task_events` are covered by Task 7.
- Packaging and desktop verification are covered by Task 8.
- OpenAI Developers review is covered by Task 9. OpenAI API remains optional and disabled by default, with future API work constrained to Responses API, Structured Outputs, and image input contracts.
- No live GitHub/web fetching is planned at runtime. This is intentional: presets should be curated, stable, testable, and policy-safe.
