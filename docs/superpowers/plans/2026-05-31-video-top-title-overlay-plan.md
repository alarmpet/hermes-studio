# Video Top Title Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hermes Studio renders a readable top title or hook phrase on the final video, similar to Shorts-style header captions, without breaking existing subtitles, image mode, video mode, hybrid mode, or packaged builds.

**Architecture:** Electron UI forwards top-title options through the normalized YouTube job contract. `youtube-workflow.mjs` persists those options in `render-options.json`. `scripts/render-youtube-with-tts.mjs` generates a transparent PNG title layer with Sharp, then applies title overlay and subtitle burn-in together in one final FFmpeg `filter_complex` encode.

**Tech Stack:** Electron renderer HTML/CSS/JS, Node.js ESM, Sharp SVG-to-PNG, FFmpeg `overlay` and `subtitles`, existing Hermes job schema and check scripts.

---

## Review Disposition

`C:\Users\amd\hermes\HERMES_VIDEO_TITLE_OVERLAY_REVIEW.md` was technically useful despite mojibake in the file display. The following review items are valid and are incorporated:

- Longform default cannot rely on `Boolean(options.titleOverlayEnabled)` because defaults are merged before normalization.
- The final renderer should avoid two video re-encodes. Title overlay and subtitle burn-in should be one FFmpeg pass.
- SVG should avoid CSS `rgba(...)` in Sharp/librsvg inputs. Use hex color plus `fill-opacity`, `stroke-opacity`, and `stop-opacity`.
- Presets should model opacity as separate fields.
- Title wrapping should prefer token/word boundaries before falling back to character splitting.

The original PNG-overlay architecture is still valid. The review does not change the decision to avoid FFmpeg `drawtext` for Korean title text.

## UX Decision

The top title is not a lower subtitle. It is a fixed, first-glance topic header.

- Shorts default: enabled.
- Longform default: disabled unless the user explicitly enables it.
- Position: top-center only in v1.
- Text source: user-provided title first, otherwise generated `draft.title`.
- Lines: maximum two lines.
- Subtitles: remain lower-middle using existing subtitle ASS settings.
- Preview: separate top-title preview, not reused from subtitle preview.

Initial style presets:

- `bold-black-accent`: black header bar, yellow first line, white second line.
- `white-editorial`: white header card, black text, orange accent.
- `black-green-hook`: black header, green accent.
- `minimal-shadow`: transparent top fade, white text.

## Files

- Modify: `C:\Users\amd\hermes\youtube-job-schema.mjs`
- Modify: `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
- Modify: `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs`
- Modify: `C:\Users\amd\hermes\electron\renderer\index.html`
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\electron\renderer\styles.css`
- Modify: `C:\Users\amd\hermes\scripts\check-youtube-job-schema.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-studio-v2-ux.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-final-output-qa-observability.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-render-pipeline.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-local-studio-product.mjs`
- Modify: `C:\Users\amd\hermes\package.json`
- Modify: `C:\Users\amd\hermes\timeline.md`
- Create: `C:\Users\amd\hermes\electron\services\title-overlay-presets.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-title-overlay-render-contract.mjs`

## Task 1: Title Overlay Contract

**Files:**
- Create: `C:\Users\amd\hermes\electron\services\title-overlay-presets.mjs`
- Modify: `C:\Users\amd\hermes\youtube-job-schema.mjs`
- Modify: `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-youtube-job-schema.mjs`

- [ ] **Step 1: Create title overlay presets**

```js
export const TITLE_OVERLAY_PRESETS = [
  {
    id: "bold-black-accent",
    label: "Bold Black Accent",
    background: "#000000",
    backgroundOpacity: 0.86,
    primary: "#ffffff",
    accent: "#fde047",
    outline: "#000000",
    outlineOpacity: 1,
  },
  {
    id: "white-editorial",
    label: "White Editorial",
    background: "#ffffff",
    backgroundOpacity: 0.96,
    primary: "#111827",
    accent: "#f97316",
    outline: "#ffffff",
    outlineOpacity: 0.75,
  },
  {
    id: "black-green-hook",
    label: "Black Green Hook",
    background: "#000000",
    backgroundOpacity: 0.9,
    primary: "#ffffff",
    accent: "#22c55e",
    outline: "#000000",
    outlineOpacity: 1,
  },
  {
    id: "minimal-shadow",
    label: "Minimal Shadow",
    background: "#000000",
    backgroundOpacity: 0.72,
    primary: "#ffffff",
    accent: "#ffffff",
    outline: "#000000",
    outlineOpacity: 1,
  },
];

export const TITLE_OVERLAY_STYLE_IDS = TITLE_OVERLAY_PRESETS.map((preset) => preset.id);

export function getTitleOverlayPreset(id = "bold-black-accent") {
  return TITLE_OVERLAY_PRESETS.find((item) => item.id === id) || TITLE_OVERLAY_PRESETS[0];
}
```

- [ ] **Step 2: Extend default job options**

In `youtube-job-schema.mjs`, add:

```js
titleOverlayEnabled: true,
titleOverlayText: "",
titleOverlayStyleId: "bold-black-accent",
titleOverlayMaxLines: 2,
titleOverlaySafeTop: 84,
```

- [ ] **Step 3: Normalize the job options**

In `normalizeYouTubeJobRequest`, after aspect-ratio normalization:

```js
const TITLE_OVERLAY_STYLE_IDS = ["bold-black-accent", "white-editorial", "black-green-hook", "minimal-shadow"];
const hasExplicitTitleOverlayEnabled = Object.prototype.hasOwnProperty.call(explicitOptions, "titleOverlayEnabled");

options.titleOverlayEnabled = options.videoFormat === "longform"
  ? (hasExplicitTitleOverlayEnabled ? Boolean(explicitOptions.titleOverlayEnabled) : false)
  : options.titleOverlayEnabled !== false;
options.titleOverlayText = String(options.titleOverlayText || "").replace(/\s+/g, " ").trim().slice(0, 80);
options.titleOverlayStyleId = String(options.titleOverlayStyleId || "bold-black-accent");
if (!TITLE_OVERLAY_STYLE_IDS.includes(options.titleOverlayStyleId)) {
  throw new Error(`Unknown titleOverlayStyleId: ${options.titleOverlayStyleId}`);
}
options.titleOverlayMaxLines = Math.max(1, Math.min(2, Math.round(Number(options.titleOverlayMaxLines || 2))));
options.titleOverlaySafeTop = Math.max(
  0,
  Math.min(options.aspectRatio === "16:9" ? 90 : 160, Number(options.titleOverlaySafeTop ?? 84)),
);
```

- [ ] **Step 4: Forward desktop input**

In `buildDesktopJobRequest` options:

```js
titleOverlayEnabled: input.titleOverlayEnabled !== false,
titleOverlayText: input.titleOverlayText || "",
titleOverlayStyleId: input.titleOverlayStyleId || "bold-black-accent",
titleOverlayMaxLines: input.titleOverlayMaxLines || 2,
titleOverlaySafeTop: input.titleOverlaySafeTop ?? 84,
```

- [ ] **Step 5: Add schema assertions**

In `scripts/check-youtube-job-schema.mjs`:

```js
assert.equal(keywordJob.options.titleOverlayEnabled, true);
assert.equal(keywordJob.options.titleOverlayStyleId, "bold-black-accent");

const longformJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "역사 이야기",
  options: { videoFormat: "longform", scriptLengthMode: "custom", customDurationSeconds: 600 },
});
assert.equal(longformJob.options.titleOverlayEnabled, false, "longform title overlay should be opt-in by default");

const longformOptInJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "역사 이야기",
  options: { videoFormat: "longform", scriptLengthMode: "custom", customDurationSeconds: 600, titleOverlayEnabled: true },
});
assert.equal(longformOptInJob.options.titleOverlayEnabled, true, "longform should preserve explicit title overlay opt-in");
```

## Task 2: Render Options

**Files:**
- Modify: `C:\Users\amd\hermes\youtube-workflow.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-final-output-qa-observability.mjs`

- [ ] **Step 1: Persist title overlay render options**

In `buildRenderOptions(job)`:

```js
titleOverlay: {
  enabled: Boolean(job.options.titleOverlayEnabled),
  text: job.options.titleOverlayText || "",
  styleId: job.options.titleOverlayStyleId || "bold-black-accent",
  maxLines: job.options.titleOverlayMaxLines || 2,
  safeTop: job.options.titleOverlaySafeTop ?? 84,
},
```

- [ ] **Step 2: Assert observability contract**

In `scripts/check-final-output-qa-observability.mjs`:

```js
assert.match(renderScript, /titleOverlay/, "render report should expose title overlay metadata");
assert.match(workflow, /titleOverlay:\s*\{/, "workflow should write title overlay render options");
```

## Task 3: Renderer Implementation

**Files:**
- Modify: `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs`
- Modify: `C:\Users\amd\hermes\scripts\check-render-pipeline.mjs`
- Create: `C:\Users\amd\hermes\scripts\check-title-overlay-render-contract.mjs`

- [ ] **Step 1: Import Sharp and preset helper**

```js
import sharp from "sharp";
import { getTitleOverlayPreset } from "../electron/services/title-overlay-presets.mjs";
```

- [ ] **Step 2: Add XML, wrapping, and opacity helpers**

```js
function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compactTitleText(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[|｜].*$/u, "")
    .slice(0, 80);
}

function wrapTitle(text, maxChars, maxLines) {
  const lines = [];
  const tokens = compactTitleText(text).split(/(\s+)/u).filter(Boolean);
  let current = "";
  for (const token of tokens) {
    const next = current ? `${current}${token}` : token.trimStart();
    if (Array.from(next).length > maxChars && current.trim()) {
      lines.push(current.trim());
      current = token.trimStart();
    } else {
      current = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (current.trim() && lines.length < maxLines) lines.push(current.trim());
  return lines.flatMap((line) => {
    if (Array.from(line).length <= maxChars) return [line];
    const chunks = [];
    const chars = Array.from(line);
    for (let i = 0; i < chars.length; i += maxChars) chunks.push(chars.slice(i, i + maxChars).join(""));
    return chunks;
  }).slice(0, maxLines).filter(Boolean);
}

function gradientStopsSvg() {
  return [
    '<stop offset="0" stop-color="#000000" stop-opacity="0.78"/>',
    '<stop offset="1" stop-color="#000000" stop-opacity="0"/>',
  ].join("");
}

function svgOpacity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(1, parsed));
}
```

- [ ] **Step 3: Create the transparent title overlay PNG**

```js
async function createTitleOverlayImage({ draftTitle, outputPath }) {
  const overlay = RENDER_OPTIONS.titleOverlay || {};
  if (!overlay.enabled) return null;
  const title = compactTitleText(overlay.text || draftTitle);
  if (!title) return null;
  const preset = getTitleOverlayPreset(overlay.styleId);
  const isLandscape = TARGET_ASPECT_RATIO === "16:9";
  const safeTop = Math.max(0, Math.min(isLandscape ? 90 : 160, Number(overlay.safeTop ?? (isLandscape ? 40 : 84))));
  const bandHeight = isLandscape ? 150 : 260;
  const fontSize = isLandscape ? 64 : 86;
  const maxChars = isLandscape ? 19 : 13;
  const lines = wrapTitle(title, maxChars, Number(overlay.maxLines || 2));
  const textY = safeTop + Math.round(bandHeight * 0.34);
  const lineHeight = Math.round(fontSize * 1.08);
  const lineSvg = lines.map((line, index) => {
    const fill = index === 0 && preset.accent ? preset.accent : preset.primary;
    return `<text x="${TARGET_WIDTH / 2}" y="${textY + index * lineHeight}" text-anchor="middle" font-family="Malgun Gothic, Arial, sans-serif" font-size="${fontSize}" font-weight="900" fill="${fill}" stroke="${preset.outline}" stroke-opacity="${svgOpacity(preset.outlineOpacity)}" stroke-width="8" paint-order="stroke fill">${escapeXml(line)}</text>`;
  }).join("");
  const bg = preset.id === "minimal-shadow"
    ? `<rect x="0" y="0" width="${TARGET_WIDTH}" height="${safeTop + bandHeight}" fill="url(#topFade)"/>`
    : `<rect x="0" y="${safeTop}" width="${TARGET_WIDTH}" height="${bandHeight}" fill="${preset.background}" fill-opacity="${svgOpacity(preset.backgroundOpacity)}" rx="0"/>`;
  const svg = `<svg width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}" viewBox="0 0 ${TARGET_WIDTH} ${TARGET_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">${gradientStopsSvg()}</linearGradient></defs>
    ${bg}
    ${lineSvg}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  writeFileSync(join(JOB_DIR, "title-overlay.json"), JSON.stringify({
    enabled: true,
    title,
    styleId: preset.id,
    outputPath,
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    safeTop,
    bandHeight,
    lines,
  }, null, 2), "utf8");
  return outputPath;
}
```

- [ ] **Step 4: Apply title and subtitles in one final encode**

Replace the current final subtitle-only `run(ffmpegPath, [...])` block.

```js
const draftForTitle = existsSync(join(JOB_DIR, "draft.json"))
  ? JSON.parse(readFileSync(join(JOB_DIR, "draft.json"), "utf8"))
  : {};
const titleOverlayPath = join(JOB_DIR, "title-overlay.png");
const createdTitleOverlay = await createTitleOverlayImage({
  draftTitle: draftForTitle.title || "",
  outputPath: titleOverlayPath,
});
const subtitleFilter = `subtitles='${escapeFilterPath(srtPath)}':force_style='${subtitleForceStyle()}'`;
const finalFilterArgs = createdTitleOverlay
  ? [
      "-i", mergedPath,
      "-i", createdTitleOverlay,
      "-filter_complex", `[0:v][1:v]overlay=0:0[v_title];[v_title]${subtitleFilter}[v]`,
      "-map", "[v]",
      "-map", "0:a?",
    ]
  : [
      "-i", mergedPath,
      "-vf", subtitleFilter,
    ];

run(ffmpegPath, [
  "-y",
  ...finalFilterArgs,
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "20",
  "-c:a", "copy",
  "-movflags", "+faststart",
  finalPath,
]);
```

- [ ] **Step 5: Add render report metadata**

```js
titleOverlay: createdTitleOverlay
  ? JSON.parse(readFileSync(join(JOB_DIR, "title-overlay.json"), "utf8"))
  : { enabled: false },
```

- [ ] **Step 6: Add renderer contract checks**

Create `scripts/check-title-overlay-render-contract.mjs`.

```js
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const schema = readFileSync(resolve(root, "youtube-job-schema.mjs"), "utf8");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const renderer = readFileSync(resolve(root, "scripts/render-youtube-with-tts.mjs"), "utf8");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const app = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");

assert.match(schema, /hasExplicitTitleOverlayEnabled/, "schema should distinguish explicit longform title overlay opt-in");
assert.match(schema, /titleOverlayStyleId/, "schema should validate title overlay style");
assert.match(workflow, /titleOverlay:\s*\{/, "workflow should write title overlay render options");
assert.match(renderer, /createTitleOverlayImage/, "renderer should generate a title overlay PNG");
assert.match(renderer, /title-overlay\.png/, "renderer should persist the title overlay PNG");
assert.match(renderer, /filter_complex/, "renderer should use one final filter_complex encode for title and subtitles");
assert.match(renderer, /overlay=0:0\[v_title\].*subtitles=/s, "renderer should apply overlay before subtitle burn-in");
assert.doesNotMatch(renderer, /merged-scenes-titled\.mp4/, "renderer should not create a second re-encoded titled intermediate");
assert.match(renderer, /stop-opacity/, "SVG gradients should use stop-opacity instead of rgba stop-color");
assert.match(renderer, /fill-opacity/, "SVG backgrounds should use fill-opacity");
assert.match(renderer, /title-overlay\.json/, "renderer should persist title overlay metadata");
assert.match(html, /id="titleOverlayEnabled"/, "Studio UI should expose title overlay toggle");
assert.match(html, /id="titleOverlayPreview"/, "Studio UI should preview top title style");
assert.match(app, /titleOverlayText/, "renderer should submit manual title overlay text");

console.log(JSON.stringify({ ok: true, checked: "title-overlay-render-contract" }));
```

- [ ] **Step 7: Extend existing render pipeline check**

In `scripts/check-render-pipeline.mjs`:

```js
assert.match(scriptText, /createTitleOverlayImage/, "renderer should create a separate top-title overlay image");
assert.match(scriptText, /title-overlay\.png/, "renderer should persist the generated title overlay image");
assert.match(scriptText, /titleOverlay/, "render report should expose title overlay metadata");
assert.doesNotMatch(scriptText, /drawtext=.*title/i, "renderer should avoid brittle ffmpeg drawtext for Korean title text");
```

## Task 4: Studio UI

**Files:**
- Modify: `C:\Users\amd\hermes\electron\renderer\index.html`
- Modify: `C:\Users\amd\hermes\electron\renderer\app.js`
- Modify: `C:\Users\amd\hermes\electron\renderer\styles.css`
- Modify: `C:\Users\amd\hermes\scripts\check-studio-v2-ux.mjs`

- [ ] **Step 1: Add controls near subtitle settings**

```html
<section class="sub-panel title-overlay-panel">
  <h4>Top Title</h4>
  <label class="checkbox-line">
    <input id="titleOverlayEnabled" type="checkbox" checked>
    Show title at top of video
  </label>
  <div class="form-grid">
    <div class="field-group">
      <label for="titleOverlayText">Title text</label>
      <input id="titleOverlayText" type="text" maxlength="80" placeholder="Use generated title when empty">
    </div>
    <div class="field-group">
      <label for="titleOverlayStyleId">Title style</label>
      <select id="titleOverlayStyleId">
        <option value="bold-black-accent" selected>Bold Black Accent</option>
        <option value="white-editorial">White Editorial</option>
        <option value="black-green-hook">Black Green Hook</option>
        <option value="minimal-shadow">Minimal Shadow</option>
      </select>
    </div>
  </div>
  <div class="title-overlay-preview" id="titleOverlayPreview">
    <div id="titleOverlayPreviewText">Video title preview</div>
  </div>
</section>
```

- [ ] **Step 2: Wire renderer inputs**

```js
const titleOverlayEnabled = document.querySelector("#titleOverlayEnabled");
const titleOverlayText = document.querySelector("#titleOverlayText");
const titleOverlayStyleId = document.querySelector("#titleOverlayStyleId");
const titleOverlayPreviewText = document.querySelector("#titleOverlayPreviewText");
```

In `readJobInput()`:

```js
titleOverlayEnabled: Boolean(titleOverlayEnabled?.checked),
titleOverlayText: titleOverlayText?.value.trim() || "",
titleOverlayStyleId: titleOverlayStyleId?.value || "bold-black-accent",
titleOverlayMaxLines: 2,
titleOverlaySafeTop: getRequestedAspectRatio() === "16:9" ? 40 : 84,
```

- [ ] **Step 3: Add preview updater**

```js
function updateTitleOverlayPreview() {
  if (!titleOverlayPreviewText) return;
  const fallback = sourceValue.value.trim().slice(0, 24) || "Video title preview";
  titleOverlayPreviewText.textContent = titleOverlayText?.value.trim() || fallback;
  titleOverlayPreviewText.parentElement.dataset.style = titleOverlayStyleId?.value || "bold-black-accent";
  titleOverlayPreviewText.parentElement.dataset.enabled = titleOverlayEnabled?.checked ? "true" : "false";
}

for (const input of [titleOverlayEnabled, titleOverlayText, titleOverlayStyleId, sourceValue]) {
  input?.addEventListener("input", updateTitleOverlayPreview);
  input?.addEventListener("change", updateTitleOverlayPreview);
}
```

Call `updateTitleOverlayPreview()` from `loadConfig()`.

- [ ] **Step 4: Add CSS**

```css
.title-overlay-panel {
  margin: 12px 0 16px;
}

.title-overlay-preview {
  min-height: 160px;
  border: 1px solid var(--line);
  border-radius: 8px;
  overflow: hidden;
  background: linear-gradient(160deg, #2f6f6a, #1f2937 55%, #6b3f2a);
  display: grid;
  align-items: start;
}

.title-overlay-preview[data-enabled="false"] {
  opacity: .45;
}

#titleOverlayPreviewText {
  margin: 18px 22px 0;
  padding: 12px 16px;
  border-radius: 4px;
  color: #fff;
  background: rgba(0, 0, 0, .86);
  font-size: 22px;
  line-height: 1.08;
  font-weight: 900;
  text-align: center;
  text-shadow: -2px -2px 0 #000, 2px 2px 0 #000;
  word-break: keep-all;
  overflow-wrap: anywhere;
}

.title-overlay-preview[data-style="white-editorial"] #titleOverlayPreviewText {
  color: #111827;
  background: #fff;
  text-shadow: none;
}

.title-overlay-preview[data-style="black-green-hook"] #titleOverlayPreviewText {
  color: #22c55e;
  background: rgba(0,0,0,.9);
}

.title-overlay-preview[data-style="minimal-shadow"] #titleOverlayPreviewText {
  background: linear-gradient(180deg, rgba(0,0,0,.72), rgba(0,0,0,0));
}
```

- [ ] **Step 5: Add UI checks**

In `scripts/check-studio-v2-ux.mjs`:

```js
assert.match(html, /Top Title|titleOverlayEnabled/, "Studio should expose top title overlay controls");
assert.match(html, /titleOverlayPreview/, "Studio should show a top-title preview");
assert.match(app, /updateTitleOverlayPreview/, "Studio should preview title overlay style");
assert.match(app, /titleOverlayEnabled/, "Studio should submit title overlay options");
```

## Task 5: Package Check Wiring

**Files:**
- Modify: `C:\Users\amd\hermes\package.json`
- Modify: `C:\Users\amd\hermes\scripts\check-local-studio-product.mjs`
- Modify: `C:\Users\amd\hermes\timeline.md`

- [ ] **Step 1: Wire the new check**

Add `node ./scripts/check-title-overlay-render-contract.mjs` to `check:final-output-qa`.

- [ ] **Step 2: Check product contract**

In `scripts/check-local-studio-product.mjs`:

```js
assert.match(renderScript, /createTitleOverlayImage/, "final renderer should support top title overlays");
assert.match(renderScript, /filter_complex/, "title overlay and subtitles should be composed in one final ffmpeg pass");
assert.match(html, /titleOverlayEnabled/, "Studio should expose top title overlay controls");
```

- [ ] **Step 3: Update timeline**

Append:

```md
## 2026-05-31

- Planned video top title overlay for Hermes Studio.
- Decision: render Korean title text as a Sharp PNG layer and apply it with subtitles in one final FFmpeg pass.
- Added review constraints: longform explicit opt-in, SVG opacity compatibility, no `drawtext`, no double re-encode.
```

## Verification

Run:

```powershell
npm.cmd run check
npm.cmd run smoke:youtube-mock
npm.cmd run smoke:youtube-hybrid-mock
```

Then run final artifact verification on the latest mock output:

```powershell
node .\scripts\check-rendered-video.mjs <final-mp4-path>
```

Manual QA:

- Top title appears in the first frame.
- Title does not cover lower subtitles.
- Korean title text is readable and not mojibake.
- Long title wraps to at most two lines.
- Punctuation such as `:`, `/`, quotes, and parentheses does not break rendering.
- `title-overlay.png` dimensions match final output dimensions.
- `title-overlay.json.lines.length <= 2`.
- 9:16 title safe area and 16:9 title safe area both look intentional.
- Final video duration still matches subtitle end.

Package:

```powershell
npm.cmd run electron:pack
```

Packaged verification:

- `electron/services/title-overlay-presets.mjs` is included.
- `scripts/render-youtube-with-tts.mjs` imports the preset helper.
- `sharp` remains available through existing `asarUnpack`.
- No packaged render failure from missing title overlay module.

## Completion Criteria

- `npm.cmd run check` passes.
- Mock render contains top title and existing subtitles.
- Final render uses one FFmpeg final encode, not `merged-scenes-titled.mp4`.
- `render-report-v2.json` includes `titleOverlay`.
- Studio UI exposes toggle, manual title, style select, and preview.
- Packaged build succeeds.
- `timeline.md` records the feature.

