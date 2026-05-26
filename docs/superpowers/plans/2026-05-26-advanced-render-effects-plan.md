# Advanced Render Effects Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add selectable, polished zoom/pan, motion, and scene transition effects to Hermes Studio rendering while keeping subtitles, TTS sync, and Flow video/image modes stable.

**Architecture:** Keep the current ffmpeg-based pipeline and add a small effect engine around it. Scene clips remain normalized to 1080x1920, 30fps, yuv420p; image scenes receive richer Ken Burns-style motion; final scene stitching can optionally use transition-aware composition instead of plain concat.

**Tech Stack:** Electron renderer UI, Node.js `.mjs` services, ffmpeg filters (`zoompan`, `scale`, `crop`, `fade`, `xfade`, `tblend`, `minterpolate` only where safe), existing packaged `ffmpeg-static`.

---

## Research Notes

- FFmpeg `zoompan` is appropriate for still-image motion but expressions must use stable variables; avoid invalid symbolic expressions such as `30*d` in production filters. Use concrete frame counts computed in Node.
- FFmpeg `xfade` supports many transition types and is a good fit for high-end transitions after clips are normalized.
- FFmpeg filter docs list transition filters and frame interpolation options, but the latter can create artifacts and heavy CPU load, so `minterpolate` should be an optional "cinematic smooth" setting, not the default.
- GitHub examples around ffmpeg slideshow/Ken Burns workflows mostly use the same basic pattern: generate normalized scene clips first, then compose. Hermes should follow that proven shape rather than making Flow automation responsible for visual polish.
- External review validation: the VFR/PTS warning is technically valid for Flow-downloaded video, so video normalization must add `setsar=1,setpts=PTS-STARTPTS`. The xfade boundary guard is also valid and should be implemented before timeline transitions are enabled. The SQLite column proposal is useful for searchable Telegram history, but desktop jobs already persist full option JSON, so DB columns should be a separate compatibility task rather than a prerequisite for render effects.

Source references:
- [FFmpeg filters documentation](https://www.ffmpeg.org/ffmpeg-filters.html)
- [FFmpeg xfade filter documentation](https://www.ffmpeg.org/ffmpeg-filters.html#xfade)
- [FFmpeg zoompan filter documentation](https://www.ffmpeg.org/ffmpeg-filters.html#zoompan)
- [FFmpeg minterpolate filter documentation](https://www.ffmpeg.org/ffmpeg-filters.html#minterpolate)

## Current Pipeline Map

- `electron/services/image-scene-renderer.mjs`: Converts Flow image outputs into motion `scene_N.mp4` clips.
- `electron/services/scene-video-normalizer.mjs`: Normalizes Flow video outputs into `scene_N.mp4`.
- `youtube-workflow-stages.mjs`: Chooses per-scene `video` or `image` mode and calls the correct renderer.
- `scripts/render-youtube-with-tts.mjs`: Generates TTS, syncs per-scene audio, concatenates scenes, burns subtitles, writes render reports.
- `youtube-job-schema.mjs`: Stores render options submitted by Electron.
- `electron/renderer/index.html`, `electron/renderer/app.js`, `electron/renderer/styles.css`: Studio controls and progress UI.

## Effect Model

Add three user-facing render effect levels:

1. **Clean**
   - Stable slow zoom/pan.
   - Short fade in/out.
   - Lowest artifact risk.

2. **Cinematic**
   - Varied push-in, pull-back, diagonal drift, tilt reveal, parallax-feel crop moves.
   - Short scene-to-scene crossfade or smooth wipe.
   - Default recommendation.

3. **Dynamic Shorts**
   - Faster hook motion, whip-pan simulation, punch zoom, flash fade, directional xfade.
   - Use only for the first few hook scenes or fast topics.
   - Strong guardrails to avoid motion sickness and subtitle overlap.

Per-scene effect assignment should use the scene metadata:

- `section: hook` gets more energetic motion.
- `section: point/story` gets cleaner explanatory motion.
- `section: lesson` gets calmer pull-back or settle motion.
- `visual_category` can bias the effect: product close-up uses push-in, process/demo uses pan/tilt, abstract risk uses slow drift.

## Transition Model

Use two transition strategies:

- **Scene-local transitions:** fade in/out inside each scene clip. This is already safe because it does not change timeline duration.
- **Timeline xfade transitions:** optional final composition mode that overlaps visual tails while keeping TTS/subtitle timing aligned.

For xfade without audio desync:

- Let `transitionSeconds = 0.25` to `0.45`.
- For scenes 1..N-1, render the video clip as `audioDuration + transitionSeconds`.
- Render the last scene as `audioDuration`.
- Apply `xfade` at offsets equal to cumulative audio duration.
- Concatenate audio normally without overlap.
- Final visual duration remains equal to total narration duration because every visual overlap consumes the extra tail that was added to the previous scene.

This avoids the common xfade bug where the final video becomes shorter than the audio/subtitle timeline.

## Guardrails

- Never apply heavy shake or fast zoom under subtitles.
- Keep motion crop safe: no generated black borders, no text/logos in frame.
- Default transition duration must be below 0.5 seconds.
- Disable xfade automatically if scene count is 1 or if any normalized clip is missing/0 bytes.
- Normalize Flow video clips with `setsar=1,setpts=PTS-STARTPTS` before any transition graph is built.
- Validate xfade offsets against actual probed clip durations before invoking ffmpeg; fallback to plain concat if any boundary is unsafe.
- If final duration differs from subtitle end by more than 0.5 seconds, fail with a clear render report.
- If ffmpeg filter complexity fails, fallback to scene-local fades and plain concat, but mark `advancedEffectsFallback: true` in the report.
- Keep `minterpolate` disabled by default. Only expose it later as an explicit opt-in with a speed warning.

---

### Task 1: Add Render Effect Schema

**Files:**
- Modify: `C:/Users/amd/hermes/youtube-job-schema.mjs`
- Modify: `C:/Users/amd/hermes/scripts/check-youtube-job-schema.mjs`

- [ ] **Step 1: Write the failing schema assertions**

Add assertions to `scripts/check-youtube-job-schema.mjs`:

```js
const effectsJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: {
    renderEffectPreset: "cinematic",
    transitionPreset: "smooth-crossfade",
    transitionSeconds: 0.35,
  },
});
assert.equal(effectsJob.options.renderEffectPreset, "cinematic");
assert.equal(effectsJob.options.transitionPreset, "smooth-crossfade");
assert.equal(effectsJob.options.transitionSeconds, 0.35);
assert.throws(() => normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { renderEffectPreset: "chaos" },
}), /Unknown renderEffectPreset/);
```

- [ ] **Step 2: Run the failing test**

Run:

```powershell
node scripts/check-youtube-job-schema.mjs
```

Expected: fail because the new options are not normalized yet.

- [ ] **Step 3: Add schema defaults and validation**

In `youtube-job-schema.mjs`, add defaults:

```js
renderEffectPreset: "cinematic",
transitionPreset: "scene-fade",
transitionSeconds: 0.3,
motionIntensity: "medium",
```

Add validators:

```js
const RENDER_EFFECT_PRESETS = ["clean", "cinematic", "dynamic-shorts"];
const TRANSITION_PRESETS = ["none", "scene-fade", "smooth-crossfade", "directional-wipe", "hook-whip"];
const MOTION_INTENSITIES = ["low", "medium", "high"];
```

Normalize:

```js
options.transitionSeconds = Math.max(0, Math.min(0.6, Number(options.transitionSeconds ?? 0.3)));
options.smoothFrameInterpolation = Boolean(options.smoothFrameInterpolation);
```

Do not enable `smoothFrameInterpolation` from any default. It is only a future opt-in escape hatch for `minterpolate`, and the first implementation should leave it unused in the render path.

- [ ] **Step 4: Verify schema test passes**

Run:

```powershell
node scripts/check-youtube-job-schema.mjs
```

Expected: pass.

---

### Task 2: Add Studio UI Controls

**Files:**
- Modify: `C:/Users/amd/hermes/electron/renderer/index.html`
- Modify: `C:/Users/amd/hermes/electron/renderer/app.js`
- Modify: `C:/Users/amd/hermes/electron/renderer/styles.css`
- Modify: `C:/Users/amd/hermes/scripts/check-studio-v2-ux.mjs`

- [ ] **Step 1: Write failing UI contract assertions**

Add to `scripts/check-studio-v2-ux.mjs`:

```js
assert.match(html, /id="renderEffectPreset"/, "Studio should expose render effect preset");
assert.match(html, /id="transitionPreset"/, "Studio should expose transition preset");
assert.match(html, /id="transitionSeconds"/, "Studio should expose transition duration");
assert.match(renderer, /renderEffectPreset:\s*renderEffectPreset\?\.value/, "renderer should submit render effect preset");
assert.match(renderer, /transitionPreset:\s*transitionPreset\?\.value/, "renderer should submit transition preset");
assert.match(renderer, /transitionSeconds:\s*Number/, "renderer should submit numeric transition seconds");
```

- [ ] **Step 2: Run failing UI test**

Run:

```powershell
node scripts/check-studio-v2-ux.mjs
```

Expected: fail.

- [ ] **Step 3: Add compact controls**

In `electron/renderer/index.html`, add controls near Flow output mode:

```html
<label for="renderEffectPreset">렌더 효과</label>
<select id="renderEffectPreset">
  <option value="clean">Clean</option>
  <option value="cinematic" selected>Cinematic</option>
  <option value="dynamic-shorts">Dynamic Shorts</option>
</select>

<label for="transitionPreset">화면 전환</label>
<select id="transitionPreset">
  <option value="scene-fade">Scene Fade</option>
  <option value="smooth-crossfade" selected>Smooth Crossfade</option>
  <option value="directional-wipe">Directional Wipe</option>
  <option value="hook-whip">Hook Whip</option>
  <option value="none">None</option>
</select>

<label for="transitionSeconds">전환 길이(초)</label>
<input id="transitionSeconds" type="number" min="0" max="0.6" step="0.05" value="0.3">
```

- [ ] **Step 4: Submit options from renderer**

In `electron/renderer/app.js`, add DOM refs and include in `readJobInput()`:

```js
const renderEffectPreset = document.querySelector("#renderEffectPreset");
const transitionPreset = document.querySelector("#transitionPreset");
const transitionSeconds = document.querySelector("#transitionSeconds");
```

```js
renderEffectPreset: renderEffectPreset?.value || "cinematic",
transitionPreset: transitionPreset?.value || "scene-fade",
transitionSeconds: Number(transitionSeconds?.value || 0.3),
```

- [ ] **Step 5: Add restrained UI styling**

Add CSS that matches the existing compact Studio controls:

```css
.effect-preview {
  font-size: 12px;
  color: var(--muted);
  line-height: 1.4;
}
```

- [ ] **Step 6: Verify UI contract**

Run:

```powershell
node scripts/check-studio-v2-ux.mjs
node --check electron/renderer/app.js
```

Expected: pass.

---

### Task 3: Create Effect Preset Service

**Files:**
- Create: `C:/Users/amd/hermes/electron/services/render-effect-presets.mjs`
- Create: `C:/Users/amd/hermes/scripts/check-render-effect-presets.mjs`
- Modify: `C:/Users/amd/hermes/package.json`

- [ ] **Step 1: Write the failing preset test**

Create `scripts/check-render-effect-presets.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { chooseSceneMotionPreset, getTransitionConfig } from "../electron/services/render-effect-presets.mjs";

assert.equal(chooseSceneMotionPreset({ renderEffectPreset: "clean", order: 1, section: "hook" }).name, "slow-zoom-in");
assert.equal(chooseSceneMotionPreset({ renderEffectPreset: "cinematic", order: 2, visualCategory: "product" }).fps, 30);
assert.match(chooseSceneMotionPreset({ renderEffectPreset: "dynamic-shorts", order: 1, section: "hook" }).name, /push|whip|punch/);
assert.equal(getTransitionConfig({ transitionPreset: "smooth-crossfade", transitionSeconds: 0.35 }).filter, "xfade");
assert.equal(getTransitionConfig({ transitionPreset: "none" }).seconds, 0);

console.log("Render effect presets contract OK");
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
node scripts/check-render-effect-presets.mjs
```

Expected: fail because the service does not exist.

- [ ] **Step 3: Implement preset service**

Create `electron/services/render-effect-presets.mjs`:

```js
const MOTION_LIBRARY = {
  clean: ["slow-zoom-in", "slow-pan-left", "slow-pan-right"],
  cinematic: ["cinematic-push-in", "diagonal-drift", "tilt-reveal", "slow-pull-back"],
  "dynamic-shorts": ["hook-punch-zoom", "whip-pan-soft", "fast-push-in", "snap-drift"],
};

export function chooseSceneMotionPreset({ renderEffectPreset = "cinematic", order = 1, section = "", visualCategory = "" } = {}) {
  const library = MOTION_LIBRARY[renderEffectPreset] || MOTION_LIBRARY.cinematic;
  let index = (Number(order || 1) - 1) % library.length;
  if (section === "hook" && renderEffectPreset === "dynamic-shorts") index = 0;
  if (/product|device|object/i.test(visualCategory)) index = library.indexOf("cinematic-push-in") >= 0 ? library.indexOf("cinematic-push-in") : index;
  return { name: library[index], fps: 30 };
}

export function getTransitionConfig({ transitionPreset = "scene-fade", transitionSeconds = 0.3 } = {}) {
  const seconds = transitionPreset === "none" ? 0 : Math.max(0, Math.min(0.6, Number(transitionSeconds || 0.3)));
  const transitionMap = {
    none: { filter: "concat", transition: "none" },
    "scene-fade": { filter: "fade", transition: "fade" },
    "smooth-crossfade": { filter: "xfade", transition: "fade" },
    "directional-wipe": { filter: "xfade", transition: "smoothleft" },
    "hook-whip": { filter: "xfade", transition: "hblur" },
  };
  return { ...(transitionMap[transitionPreset] || transitionMap["scene-fade"]), seconds };
}
```

- [ ] **Step 4: Register the test**

Add to `package.json` `check:flow-output-mode` or the main `check`:

```json
"node scripts/check-render-effect-presets.mjs"
```

- [ ] **Step 5: Verify**

Run:

```powershell
node scripts/check-render-effect-presets.mjs
node --check electron/services/render-effect-presets.mjs
```

Expected: pass.

---

### Task 4: Upgrade Image Motion Renderer

**Files:**
- Modify: `C:/Users/amd/hermes/electron/services/image-scene-renderer.mjs`
- Modify: `C:/Users/amd/hermes/scripts/check-image-scene-renderer-contract.mjs`

- [ ] **Step 1: Write failing assertions for advanced motion**

Add to `scripts/check-image-scene-renderer-contract.mjs`:

```js
assert.match(service, /cinematic-push-in/, "renderer should support cinematic push-in motion");
assert.match(service, /diagonal-drift/, "renderer should support diagonal drift motion");
assert.match(service, /tilt-reveal/, "renderer should support tilt reveal motion");
assert.match(service, /hook-punch-zoom/, "renderer should support hook punch zoom motion");
assert.match(service, /buildZoomPanExpression/, "renderer should build expressions through a helper");
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
node scripts/check-image-scene-renderer-contract.mjs
```

Expected: fail.

- [ ] **Step 3: Add expression builder**

In `image-scene-renderer.mjs`, add:

```js
function buildZoomPanExpression({ motionPreset, frameCount }) {
  const progress = `min(on/${frameCount},1)`;
  const presets = {
    "slow-zoom-in": `zoompan=z='min(1.0+0.12*${progress},1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30`,
    "slow-pan-left": `zoompan=z='1.10':x='iw*0.06-(iw*0.10)*${progress}':y='ih*0.02':d=1:s=1080x1920:fps=30`,
    "slow-pan-right": `zoompan=z='1.10':x='iw*0.00+(iw*0.10)*${progress}':y='ih*0.02':d=1:s=1080x1920:fps=30`,
    "cinematic-push-in": `zoompan=z='min(1.02+0.18*${progress},1.20)':x='iw/2-(iw/zoom/2)':y='ih*0.08-(ih*0.04)*${progress}':d=1:s=1080x1920:fps=30`,
    "slow-pull-back": `zoompan=z='max(1.18-0.12*${progress},1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30`,
    "diagonal-drift": `zoompan=z='1.14':x='iw*0.02+(iw*0.08)*${progress}':y='ih*0.00+(ih*0.06)*${progress}':d=1:s=1080x1920:fps=30`,
    "tilt-reveal": `zoompan=z='1.12':x='iw/2-(iw/zoom/2)':y='ih*0.12-(ih*0.10)*${progress}':d=1:s=1080x1920:fps=30`,
    "hook-punch-zoom": `zoompan=z='if(lt(${progress},0.18),1.0+0.35*${progress}/0.18,1.35-0.16*(${progress}-0.18)/0.82)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30`,
    "whip-pan-soft": `zoompan=z='1.18':x='iw*0.14-(iw*0.20)*${progress}':y='ih*0.03':d=1:s=1080x1920:fps=30`,
    "fast-push-in": `zoompan=z='min(1.0+0.24*${progress},1.24)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30`,
    "snap-drift": `zoompan=z='1.16':x='iw*0.03+(iw*0.14)*${progress}':y='ih*0.02':d=1:s=1080x1920:fps=30`,
  };
  return presets[motionPreset] || presets["slow-zoom-in"];
}
```

- [ ] **Step 4: Use the helper**

Replace the current `zoomExpr` ternary with:

```js
const zoomExpr = buildZoomPanExpression({ motionPreset, frameCount });
```

- [ ] **Step 5: Verify with a real image**

Run the same reproduction pattern:

```powershell
@'
import { renderImageSceneClip } from './electron/services/image-scene-renderer.mjs';
import ffmpegPath from 'ffmpeg-static';
renderImageSceneClip({
  ffmpegBin: ffmpegPath,
  imagePath: 'C:/Users/amd/AppData/Roaming/hermes/outputs/desktop/youtube-1779782938121/scene_2_flow.jpg',
  outputPath: 'C:/Users/amd/AppData/Roaming/hermes/outputs/desktop/youtube-1779782938121/effect-test-cinematic-push-in.mp4',
  durationSeconds: 8,
  motionPreset: 'cinematic-push-in',
});
console.log('ok');
'@ | node --input-type=module
```

Expected: `ok` and a non-zero mp4 file.

- [ ] **Step 6: Verify contracts**

Run:

```powershell
node scripts/check-image-scene-renderer-contract.mjs
node --check electron/services/image-scene-renderer.mjs
```

Expected: pass.

---

### Task 5: Apply Scene-Aware Motion Presets in Workflow

**Files:**
- Modify: `C:/Users/amd/hermes/youtube-workflow-stages.mjs`
- Modify: `C:/Users/amd/hermes/scripts/check-hybrid-render-normalization.mjs`

- [ ] **Step 1: Write failing workflow assertion**

Add to `scripts/check-hybrid-render-normalization.mjs`:

```js
assert.match(stages, /chooseSceneMotionPreset/, "workflow should choose scene-aware motion presets");
assert.match(stages, /renderEffectPreset/, "workflow should pass render effect preset to scene rendering");
assert.match(stages, /motionPreset:\s*motion\.name/, "workflow should render images with selected motion preset");
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
node scripts/check-hybrid-render-normalization.mjs
```

Expected: fail.

- [ ] **Step 3: Import and use preset chooser**

In `youtube-workflow-stages.mjs`, import:

```js
import { chooseSceneMotionPreset } from "./electron/services/render-effect-presets.mjs";
```

Before `renderImageSceneClip`, compute:

```js
const motion = chooseSceneMotionPreset({
  renderEffectPreset: job?.options?.renderEffectPreset || "cinematic",
  order: scene.order,
  section: scene.section,
  visualCategory: scene.visual_category,
});
```

Pass:

```js
motionPreset: motion.name,
```

Add progress details:

```js
renderEffectPreset: job?.options?.renderEffectPreset || "cinematic",
motionPreset: motion.name,
```

- [ ] **Step 4: Verify**

Run:

```powershell
node scripts/check-hybrid-render-normalization.mjs
node --check youtube-workflow-stages.mjs
```

Expected: pass.

---

### Task 6: Add Transition-Aware Final Composer

**Files:**
- Create: `C:/Users/amd/hermes/electron/services/timeline-transition-renderer.mjs`
- Modify: `C:/Users/amd/hermes/electron/services/scene-video-normalizer.mjs`
- Modify: `C:/Users/amd/hermes/scripts/check-hybrid-render-normalization.mjs`
- Modify: `C:/Users/amd/hermes/scripts/render-youtube-with-tts.mjs`
- Create: `C:/Users/amd/hermes/scripts/check-timeline-transition-renderer.mjs`

- [ ] **Step 1: Write failing video normalization assertions**

Add to `scripts/check-hybrid-render-normalization.mjs`:

```js
assert.match(normalizer, /setsar=1/, "video normalizer should force square pixels before xfade");
assert.match(normalizer, /setpts=PTS-STARTPTS/, "video normalizer should reset clip PTS before xfade");
```

- [ ] **Step 2: Run failing normalization test**

Run:

```powershell
node scripts/check-hybrid-render-normalization.mjs
```

Expected: fail until `scene-video-normalizer.mjs` adds the new filters.

- [ ] **Step 3: Harden video normalization**

In `electron/services/scene-video-normalizer.mjs`, update the video filter list:

```js
const videoFilter = [
  "scale=1080:1920:force_original_aspect_ratio=increase",
  "crop=1080:1920",
  "fps=30",
  "setsar=1",
  "setpts=PTS-STARTPTS",
  "format=yuv420p",
  "fade=t=in:st=0:d=0.15",
  `fade=t=out:st=${fadeOutStart}:d=0.25`,
].join(",");
```

This is required because Flow video downloads may be VFR or may carry non-zero-origin timestamps. `xfade` is much more stable when every input clip starts from zero PTS and uses the same SAR/FPS/pixel format.

- [ ] **Step 4: Verify normalization**

Run:

```powershell
node scripts/check-hybrid-render-normalization.mjs
node --check electron/services/scene-video-normalizer.mjs
```

Expected: pass.

- [ ] **Step 5: Write failing transition composer test**

Create `scripts/check-timeline-transition-renderer.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const composer = readFileSync(new URL("../electron/services/timeline-transition-renderer.mjs", import.meta.url), "utf8");
const renderScript = readFileSync(new URL("../scripts/render-youtube-with-tts.mjs", import.meta.url), "utf8");

assert.match(composer, /buildXfadeFilterGraph/, "transition renderer should build an xfade filter graph");
assert.match(composer, /validateXfadePlan/, "transition renderer should validate xfade boundaries before rendering");
assert.match(composer, /transitionSeconds/, "transition renderer should receive transition duration");
assert.match(composer, /cumulativeAudioDuration/, "transition offsets should use cumulative audio duration");
assert.match(composer, /audioDuration \+ transitionSeconds/, "visual tails should preserve audio/subtitle sync");
assert.match(composer, /actualVideoDurations/, "transition renderer should validate against probed video durations");
assert.match(renderScript, /transitionPreset/, "final render script should read transition preset");
assert.match(renderScript, /scene-render-manifest\.json/, "render report should include transition details");

console.log("Timeline transition renderer contract OK");
```

- [ ] **Step 6: Run failing test**

Run:

```powershell
node scripts/check-timeline-transition-renderer.mjs
```

Expected: fail because the composer does not exist.

- [ ] **Step 7: Implement graph builder and boundary validation**

Create `electron/services/timeline-transition-renderer.mjs`:

```js
export function validateXfadePlan({ transitionSeconds = 0.3, sceneDurations = [], actualVideoDurations = [] } = {}) {
  if (transitionSeconds <= 0 || sceneDurations.length < 2) return { ok: true, reason: "" };
  for (let index = 0; index < sceneDurations.length; index += 1) {
    const audioDuration = Number(sceneDurations[index] || 0);
    const actualVideoDuration = Number(actualVideoDurations[index] || 0);
    const requiredVideoDuration = index === sceneDurations.length - 1
      ? audioDuration
      : audioDuration + transitionSeconds;
    if (actualVideoDuration + 0.05 < requiredVideoDuration) {
      return {
        ok: false,
        reason: `Xfade boundary violated at scene ${index + 1}: video=${actualVideoDuration}s required=${requiredVideoDuration}s`,
      };
    }
  }
  return { ok: true, reason: "" };
}

export function buildXfadeFilterGraph({ sceneCount, transitionName = "fade", transitionSeconds = 0.3, sceneDurations = [] } = {}) {
  if (sceneCount < 2 || transitionSeconds <= 0) return "";
  const filters = [];
  let previous = "[0:v]";
  let cumulativeAudioDuration = Number(sceneDurations[0] || 0);
  for (let i = 1; i < sceneCount; i += 1) {
    const out = i === sceneCount - 1 ? "[vout]" : `[v${i}]`;
    const offset = Math.max(0, cumulativeAudioDuration).toFixed(3);
    filters.push(`${previous}[${i}:v]xfade=transition=${transitionName}:duration=${transitionSeconds}:offset=${offset}${out}`);
    previous = out;
    cumulativeAudioDuration += Number(sceneDurations[i] || 0);
  }
  return filters.join(";");
}
```

- [ ] **Step 8: Extend render script composition**

In `scripts/render-youtube-with-tts.mjs`, after per-scene synced files are created:

- If `transitionPreset` is `none` or `scene-fade`, keep current concat path.
- If `transitionPreset` uses `xfade`, generate transition-ready visual clips with extra visual tail for all scenes except the last.
- Probe every transition-ready visual clip with `getMediaDuration`.
- Call `validateXfadePlan` with `sceneDurations` and `actualVideoDurations` before building the graph.
- If validation fails, skip xfade and mark `advancedEffectsFallback: true`.
- Build a video-only xfade graph.
- Concatenate audio normally.
- Burn subtitles after video/audio recombination.

Use this data shape in the render report:

```js
transition: {
  preset: RENDER_OPTIONS.transitionPreset || "scene-fade",
  seconds: Number(RENDER_OPTIONS.transitionSeconds || 0.3),
  mode: "xfade",
  fallback: false
}
```

- [ ] **Step 9: Add fallback**

Wrap advanced composition in `try/catch`:

```js
try {
  // xfade render
} catch (error) {
  advancedEffectsFallback = true;
  // existing concat render path
}
```

Report:

```js
advancedEffectsFallback,
advancedEffectsError: advancedEffectsFallback ? String(error.message || error) : "",
```

- [ ] **Step 10: Verify**

Run:

```powershell
node scripts/check-timeline-transition-renderer.mjs
node --check electron/services/timeline-transition-renderer.mjs
node --check scripts/render-youtube-with-tts.mjs
```

Expected: pass.

---

### Task 7: Add Render Report Observability

**Files:**
- Modify: `C:/Users/amd/hermes/scripts/render-youtube-with-tts.mjs`
- Modify: `C:/Users/amd/hermes/scripts/check-final-output-qa-observability.mjs`

- [ ] **Step 1: Write failing observability assertions**

Add:

```js
assert.match(renderScript, /renderEffectPreset/, "render report should include render effect preset");
assert.match(renderScript, /transitionPreset/, "render report should include transition preset");
assert.match(renderScript, /motionPreset/, "render report should include per-scene motion preset");
assert.match(renderScript, /advancedEffectsFallback/, "render report should expose effect fallback");
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
node scripts/check-final-output-qa-observability.mjs
```

Expected: fail.

- [ ] **Step 3: Extend `render-report-v2.json`**

In each scene report object include:

```js
motionPreset: source.motionPreset || "",
sceneOutputMode: source.outputMode || source.flowOutputMode || "video",
```

In top-level report include:

```js
renderEffectPreset: RENDER_OPTIONS.renderEffectPreset || "cinematic",
transitionPreset: RENDER_OPTIONS.transitionPreset || "scene-fade",
transitionSeconds: Number(RENDER_OPTIONS.transitionSeconds || 0.3),
advancedEffectsFallback,
```

- [ ] **Step 4: Verify**

Run:

```powershell
node scripts/check-final-output-qa-observability.mjs
```

Expected: pass.

---

### Task 8: Persist Effect Metadata in Job History

**Files:**
- Modify: `C:/Users/amd/hermes/electron/main.mjs`
- Modify: `C:/Users/amd/hermes/workflow-db-events.mjs`
- Modify: `C:/Users/amd/hermes/bot_db_helper.py`
- Create: `C:/Users/amd/hermes/scripts/check-render-effect-history-persistence.mjs`

- [ ] **Step 1: Write failing history persistence test**

Create `scripts/check-render-effect-history-persistence.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
const workflowDbEvents = readFileSync(new URL("../workflow-db-events.mjs", import.meta.url), "utf8");
const dbHelper = readFileSync(new URL("../bot_db_helper.py", import.meta.url), "utf8");

assert.match(main, /renderEffectPreset|transitionPreset|transitionSeconds/, "desktop job history should preserve effect options");
assert.match(workflowDbEvents, /renderEffectPreset|transitionPreset|transitionSeconds/, "workflow DB events should mirror effect options in JSON details");
assert.match(dbHelper, /workflow_json/, "SQLite jobs should keep full workflow JSON for compatibility");
assert.doesNotMatch(dbHelper, /ALTER TABLE jobs ADD COLUMN render_effect_preset/, "do not add indexed SQLite columns until a query UI needs them");

console.log("Render effect history persistence contract OK");
```

- [ ] **Step 2: Run failing test**

Run:

```powershell
node scripts/check-render-effect-history-persistence.mjs
```

Expected: fail until job history and DB event payloads expose the effect options.

- [ ] **Step 3: Persist options in desktop job history**

In `electron/main.mjs`, when calling `upsertJob`, ensure the saved job object includes:

```js
renderEffectPreset: job.options?.renderEffectPreset || "cinematic",
transitionPreset: job.options?.transitionPreset || "scene-fade",
transitionSeconds: Number(job.options?.transitionSeconds || 0.3),
```

If `main.mjs` already stores the full `input` or `job.options`, do not duplicate fields; add a test assertion that proves the option names are present in the saved object.

- [ ] **Step 4: Preserve options in workflow DB event JSON**

In `workflow-db-events.mjs`, include effect metadata in the event payload when present:

```js
renderEffectPreset: event.details?.renderEffectPreset || event.job?.options?.renderEffectPreset || "",
transitionPreset: event.details?.transitionPreset || event.job?.options?.transitionPreset || "",
transitionSeconds: event.details?.transitionSeconds ?? event.job?.options?.transitionSeconds ?? null,
```

Do not add SQLite columns in this task. The current `jobs.workflow_json` and `task_events.data_json` already preserve structured JSON and avoid schema migration risk. Add indexed columns later only if the UI needs filtering/search by effect preset.

- [ ] **Step 5: Verify**

Run:

```powershell
node scripts/check-render-effect-history-persistence.mjs
node --check electron/main.mjs
node --check workflow-db-events.mjs
python bot_db_helper.py init
```

Expected: pass.

---

### Task 9: Add Smoke Tests With Real ffmpeg Assets

**Files:**
- Create: `C:/Users/amd/hermes/scripts/smoke-render-advanced-effects.mjs`
- Modify: `C:/Users/amd/hermes/package.json`

- [ ] **Step 1: Create smoke test**

Create `scripts/smoke-render-advanced-effects.mjs`:

```js
#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { renderImageSceneClip } from "../electron/services/image-scene-renderer.mjs";

const dir = await mkdtemp(join(tmpdir(), "hermes-effects-smoke-"));
const svgPath = join(dir, "test.svg");
await writeFile(svgPath, `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#123"/><circle cx="540" cy="820" r="260" fill="#14b8a6"/></svg>`, "utf8");

for (const preset of ["cinematic-push-in", "diagonal-drift", "tilt-reveal", "hook-punch-zoom"]) {
  const outputPath = join(dir, `${preset}.mp4`);
  renderImageSceneClip({
    ffmpegBin: ffmpegPath,
    imagePath: svgPath,
    outputPath,
    durationSeconds: 4,
    motionPreset: preset,
  });
  assert.ok(existsSync(outputPath), `${preset} output should exist`);
  assert.ok(statSync(outputPath).size > 1000, `${preset} output should be non-empty`);
}

console.log(JSON.stringify({ ok: true, dir }));
```

- [ ] **Step 2: Register npm script**

Add:

```json
"smoke:render-effects": "node scripts/smoke-render-advanced-effects.mjs"
```

- [ ] **Step 3: Run smoke**

Run:

```powershell
npm.cmd run smoke:render-effects
```

Expected: pass and print a temp directory.

---

### Task 10: Final Verification and Packaging

**Files:**
- No new code files unless previous tests reveal a bug.

- [ ] **Step 1: Run focused checks**

Run:

```powershell
node scripts/check-youtube-job-schema.mjs
node scripts/check-studio-v2-ux.mjs
npm.cmd run check:flow-output-mode
node scripts/check-render-effect-presets.mjs
node scripts/check-timeline-transition-renderer.mjs
node scripts/check-render-effect-history-persistence.mjs
npm.cmd run smoke:render-effects
npm.cmd run smoke:youtube-hybrid-mock
```

Expected: all pass.

- [ ] **Step 2: Run full check**

Run:

```powershell
npm.cmd run check
```

Expected: pass.

- [ ] **Step 3: Stop old Hermes processes**

Run:

```powershell
$targets = Get-Process -ErrorAction SilentlyContinue | Where-Object { $_.ProcessName -eq 'Hermes YouTube Studio' -or ($_.Path -and $_.Path -like '*\hermes\dist-electron\win-unpacked\*') }
$targets | Select-Object Id,ProcessName,Path
foreach($p in $targets){ Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1
```

Expected: no active old Hermes process holds `dist-electron/win-unpacked`.

- [ ] **Step 4: Package**

Run:

```powershell
npm.cmd run electron:pack
```

Expected: new files:

- `C:/Users/amd/hermes/dist-electron/Hermes YouTube Studio Setup 1.0.0.exe`
- `C:/Users/amd/hermes/dist-electron/win-unpacked/Hermes YouTube Studio.exe`

- [ ] **Step 5: Verify package and shortcut**

Run:

```powershell
node scripts/check-packaged-runtime-contract.mjs
node scripts/check-desktop-shortcut-launcher.mjs
node scripts/check-packaged-local-studio.mjs
```

Expected: all pass.

---

## Implementation Notes

- Do not add a new video library unless ffmpeg cannot express a required effect. Current packaged ffmpeg is sufficient.
- Do not use randomized effects without recording the chosen preset in `draft.json`, `metadata.json`, or render report. Debugging visual output requires reproducibility.
- Keep subtitles visually dominant over effects. Effects should support retention, not compete with narration.
- Avoid long transition durations in Shorts. Anything above 0.6 seconds will feel slow and can harm sync.
- If xfade introduces instability, ship Task 4 and Task 5 first. Scene-local advanced motion is already a strong quality improvement and much safer than timeline transitions.

## Self-Review

- Spec coverage: covers UI selection, schema, scene motion, PTS normalization, xfade boundary validation, history persistence, observability, tests, packaging.
- Placeholder scan: no TBD/TODO placeholders remain.
- Type consistency: uses `renderEffectPreset`, `transitionPreset`, `transitionSeconds`, `motionPreset`, and `advancedEffectsFallback` consistently.
- Risk check: final xfade composition is isolated behind validation and fallback so rendering can complete even if a complex transition graph fails.
