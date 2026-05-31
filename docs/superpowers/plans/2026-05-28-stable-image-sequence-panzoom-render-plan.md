# Stable Image Sequence Pan/Zoom Render Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current one-still `zoompan` image-scene render path with an explicit stable frame-sequence renderer so image-mode YouTube videos keep visible zoom/pan motion without nausea-inducing micro-jitter.

**Architecture:** Image scenes should no longer depend on FFmpeg `zoompan` as the source of motion for final renders. A shared Node/Sharp sequence renderer will normalize each still image, compute deterministic monotonic camera positions per frame, write a constant-frame-rate image sequence or cached duplicated frames, then encode that sequence with FFmpeg. Final QA will verify the stable sequence contract and surface jitter risks before the user sees the video.

**Tech Stack:** Electron, Node.js ESM, Sharp, FFmpeg, existing Hermes desktop job output folders, `scripts/render-youtube-with-tts.mjs`, `electron/services/image-scene-renderer.mjs`, package checks.

---

## Confirmed Findings From Latest Output

Latest inspected output:

`C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779934105522\desktop-flow-1779934105594.mp4`

Evidence:

- Final render exists and is playable at `62.97s`, `1080x1920`, `30 fps`.
- Scene 1 is a Flow video scene using `slowdown-loop`.
- Scenes 2-7 are image scenes and each reports `strategy: "still-image-fps-duplicate"`.
- The report says `motionIntensity: "light"` and `smoothFrameInterpolation: false`.
- FFmpeg confirms scene 2 is `30 fps`, `4.97s`, `149` frames.
- The implementation behind the image scenes still uses FFmpeg `zoompan` in `scripts/render-youtube-with-tts.mjs:199-267`.
- The shared image scene service also uses FFmpeg `zoompan` in `electron/services/image-scene-renderer.mjs:9-24`.

Root cause:

The previous patch improved duration/fps handling and named the strategy `still-image-fps-duplicate`, but it did not implement a real precomputed stable frame-sequence renderer. The renderer still asks FFmpeg to animate a single still image through `zoompan`, which can produce small crop/rounding jumps on detailed images. There is also no QA that measures per-frame motion spikes or verifies a sequence cache exists.

Important distinction:

The program is generating a constant-frame-rate video from the still image, so it is not literally outputting one frozen frame. The missing part is the user's requested stable replication/sequence layer: precompute and encode controlled frames whose camera path cannot jitter.

---

## File Map

- Create: `electron/services/stable-image-sequence-renderer.mjs`
  - Shared sequence renderer. Owns image normalization, camera-path calculation, frame duplication policy, frame writing, FFmpeg encoding, and sequence manifest generation.

- Modify: `scripts/render-youtube-with-tts.mjs`
  - Replace `stableKenBurnsFilter()` / `zoompan` image final render path with `renderStableImageSequenceClip()`.
  - Preserve existing video-scene duration policy.
  - Write sequence metadata into `scene-render-manifest.json` and `render-report-v2.json`.
  - Validate `HERMES_STILL_IMAGE_FPS` so bad environment values cannot produce `-framerate NaN`.

- Modify: `electron/services/image-scene-renderer.mjs`
  - Use the same stable sequence renderer for preview/intermediate image clips, or explicitly mark it as legacy and route production renders only through the shared renderer.

- Create: `scripts/check-stable-image-sequence-renderer-contract.mjs`
  - Static contract test that production image-scene rendering does not depend on `zoompan` for final output.

- Create: `scripts/check-image-motion-jitter-qa.mjs`
  - Generates a synthetic high-detail test image, renders a short image scene with motion, samples frame deltas, and fails if motion reverses, spikes, or collapses to no visible movement.

- Modify: `scripts/check-image-scene-renderer-contract.mjs`
  - Update the old assertions so they no longer treat `zoompan` as the desired production behavior.

- Modify: `scripts/analyze-youtube-output.mjs`
  - Read per-scene sequence manifests.
  - Flag image scenes that used legacy `zoompan` or lack stable sequence metadata.
  - Check stream fps, frame count, frame-time consistency, and frame-delta spikes for image scenes.

- Modify: `workflow-db-events.mjs`
  - Preserve stable image-sequence failure codes in `task_failures` so desktop/Telegram diagnostics can search them.

- Modify: `scripts/check-desktop-progress-feedback.mjs`
  - Assert that stable image-sequence QA failure codes are mirrored into workflow failure persistence.

- Modify: `package.json`
  - Add the new checks to `npm.cmd run check`.
  - Ensure the new service remains included in packaged builds through the existing `electron/services/**/*.mjs` asar unpack rule.

- Modify: `timeline.md`
  - Add a dated note for the stable image-sequence renderer and QA gate.

---

## Design Decisions

1. Keep Flow image mode as Flow image mode.

Image-mode scenes should still request images from Google Flow. The fix is only the local render stage: how those images become moving video clips.

2. Use a precomputed sequence instead of FFmpeg `zoompan`.

FFmpeg `zoompan` is compact, but it hides crop rounding and motion continuity. Hermes needs visible, controllable movement for long image scenes, so the renderer should compute frame positions itself.

3. Interpret "fps/bps duplication" as a motion-step policy.

Use constant output FPS, default `30`. Then derive a `framesPerMotionStep` from motion strength:

- `none`: render one unique frame and duplicate it for the whole scene.
- `light`: update the virtual camera every `2` frames to reduce high-frequency tremor.
- `medium`: update every `1` frame with smaller monotonic deltas.
- `strong`: update every `1` frame with larger travel distance and easing.

This keeps CFR output while letting Hermes choose whether motion changes every frame or every small frame group.

4. Use monotonic camera paths.

Every generated frame must have non-reversing x/y/zoom movement for the selected preset unless the preset intentionally eases out. Round coordinates once in Node, clamp to bounds, and reject any path where consecutive positions alternate back and forth by 1 pixel.

5. Prefer quality over silent fallback.

If sequence generation fails, fail with a clear `STABLE_IMAGE_SEQUENCE_RENDER_FAILED` error. A legacy fallback can be enabled only by `HERMES_ALLOW_LEGACY_ZOOMPAN_FALLBACK=1`, and the final report must mark it as a QA warning.

6. Validate renderer inputs before invoking FFmpeg.

`HERMES_STILL_IMAGE_FPS` must be parsed as a finite integer and clamped to `24-60`. Invalid values should fall back to `30` and add a report warning instead of producing `-framerate NaN`.

7. Keep image-mode duration policy visible.

Image scenes naturally match audio duration by rendering a still sequence, but the report still needs a duration policy record. Long image scenes should show `durationPolicy: "image-sequence-match-audio"` and warn when a single image scene exceeds the configured body image length by a large margin.

8. Bound disk I/O.

The stable sequence renderer must not blindly write thousands of duplicate JPEG files for long-form jobs. It should render only unique motion frames, reuse held frames through hardlinks where available, and remove the scene cache by default after encoding. `HERMES_KEEP_MOTION_FRAMES=1` is only for debugging.

9. Bind final video duration to audio, not only frame math.

`frameCount = Math.round(durationSeconds * fps)` can still drift by one or two frames per scene. Encode image clips as CFR, then mux with the narration using the audio duration as the final authority. The manifest should record both `frameDurationSeconds` and `audioDurationSeconds` so cumulative drift can be audited.

---

## Implementation Tasks

### Task 1: Add A Stable Sequence Renderer Contract Test

**Files:**
- Create: `scripts/check-stable-image-sequence-renderer-contract.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write the failing contract test**

Create `scripts/check-stable-image-sequence-renderer-contract.mjs`:

```js
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const renderer = readFileSync("scripts/render-youtube-with-tts.mjs", "utf8");
const sequenceService = readFileSync("electron/services/stable-image-sequence-renderer.mjs", "utf8");

assert.match(sequenceService, /export function renderStableImageSequenceClip/, "stable sequence service must export renderStableImageSequenceClip");
assert.match(sequenceService, /framesPerMotionStep/, "stable sequence service must expose a frame duplication policy");
assert.match(sequenceService, /motionFrameCount/, "stable sequence service must report motion frame counts");
assert.match(sequenceService, /sequenceManifestPath/, "stable sequence service must write per-scene sequence metadata");
assert.doesNotMatch(renderer, /zoompan=z=/, "production final image renderer must not use ffmpeg zoompan");
assert.match(renderer, /renderStableImageSequenceClip/, "final renderer must call the stable sequence renderer for image scenes");
```

- [ ] **Step 2: Add it to `package.json` checks**

Add this command to the existing check chain:

```json
"check:stable-image-sequence-renderer": "node scripts/check-stable-image-sequence-renderer-contract.mjs"
```

Then include it in `npm.cmd run check`.

- [ ] **Step 3: Run the test and verify it fails before implementation**

Run:

```powershell
npm.cmd run check:stable-image-sequence-renderer
```

Expected:

```text
ENOENT: no such file or directory, open 'electron/services/stable-image-sequence-renderer.mjs'
```

### Task 2: Implement The Stable Image Sequence Renderer

**Files:**
- Create: `electron/services/stable-image-sequence-renderer.mjs`

- [ ] **Step 1: Create the renderer module**

Implement these exports:

```js
export function resolveMotionStepPolicy({ fps, motionStrength }) {
  const normalizedFps = Math.max(24, Math.min(60, Number(fps || 30)));
  const strength = String(motionStrength || "light").toLowerCase();
  const framesPerMotionStep = strength === "none" ? Math.ceil(normalizedFps) : strength === "light" ? 2 : 1;
  return {
    fps: normalizedFps,
    motionStrength: strength,
    framesPerMotionStep,
  };
}

export function buildStableCameraPath({ frameCount, width, height, outputWidth, outputHeight, motionPreset, motionStrength, framesPerMotionStep }) {
  // Return an array of { frame, sourceFrame, zoom, left, top, cropWidth, cropHeight }.
  // Use ease-in-out progress, monotonic left/top/zoom travel, and clamp every crop inside source bounds.
}

export async function renderStableImageSequenceClip({
  ffmpegBin,
  imagePath,
  outputPath,
  durationSeconds,
  order,
  motionPreset,
  motionStrength,
  fps,
  jobDir,
  keepFrames = false,
}) {
  // Normalize the image to a large portrait canvas with sharp.
  // Generate frame_%06d.jpg into jobDir/motion-cache/scene_<order>.
  // Duplicate held motion steps by hardlinking/copying the same rendered frame for repeated frame numbers.
  // Encode with ffmpeg -framerate fps -i frame_%06d.jpg -r fps -c:v libx264.
  // Write scene_<order>_motion_manifest.json.
  // Return { outputPath, strategy, motionStrategy, fps, frameCount, uniqueFrameCount, duplicateHoldFrames, sequenceManifestPath }.
}
```

Implementation rules:

- Use `sharp` for image normalization and frame extraction.
- Normalize source to at least `1296x2304`; use `1440x2560` if the original image is large enough.
- Output every video as `1080x1920`, `yuv420p`, H.264.
- Use `frameCount = Math.max(1, Math.round(durationSeconds * fps))`.
- Use `uniqueFrameCount = Math.ceil(frameCount / framesPerMotionStep)`.
- For duplicate groups, prefer Windows hardlinks to the same rendered frame file; fall back to copying only when hardlinks fail.
- Delete `jobDir/motion-cache/scene_<order>` in a `finally` block unless `keepFrames` is true.
- Record cleanup success/failure in the sequence manifest.
- Do not use `concat` with variable image durations for production unless a test proves CFR frame timing and audio sync. The default path should remain image-sequence encoding because it is easier to verify.
- The manifest must include:

```json
{
  "strategy": "stable-image-sequence",
  "motionStrategy": "stable-sequence-ken-burns",
  "fps": 30,
  "frameCount": 149,
  "uniqueFrameCount": 75,
  "framesPerMotionStep": 2,
  "motionPreset": "diagonal-drift",
  "motionStrength": "light",
  "sourceImage": "scene_2_flow.jpg",
  "encodedVideo": "scene_2_video_adjusted.mp4",
  "cachePolicy": "cleanup-after-encode",
  "cacheCleaned": true,
  "frameDurationSeconds": 4.9667,
  "audioDurationSeconds": 4.95
}
```

- [ ] **Step 2: Add cache cleanup safety**

Wrap frame generation and FFmpeg encoding in `try/finally`:

```js
try {
  // Generate unique frames, materialize sequential frame names with hardlinks/copies, encode.
} finally {
  if (!keepFrames && existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }
}
```

If cleanup fails after a successful encode, do not fail the render. Write a warning instead:

```json
{
  "code": "IMAGE_SEQUENCE_CACHE_CLEANUP_FAILED",
  "sceneOrder": 2
}
```

- [ ] **Step 3: Add audio-bound duration metadata**

After encoding, calculate:

```js
const frameDurationSeconds = frameCount / normalizedFps;
const durationDriftSeconds = Math.abs(frameDurationSeconds - durationSeconds);
```

Add both values to `scene_<order>_motion_manifest.json`.

### Task 3: Route Final Image Scenes Through The Sequence Renderer

**Files:**
- Modify: `scripts/render-youtube-with-tts.mjs`

- [ ] **Step 1: Add safe FPS parsing**

Replace direct numeric parsing:

```js
const STILL_IMAGE_FPS = Number(process.env.HERMES_STILL_IMAGE_FPS || 30);
```

with:

```js
function parseStillImageFps(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { fps: 30, warning: "INVALID_STILL_IMAGE_FPS_DEFAULTED" };
  }
  const fps = Math.round(parsed);
  return { fps: Math.max(24, Math.min(60, fps)), warning: null };
}

const STILL_IMAGE_FPS_CONFIG = parseStillImageFps(process.env.HERMES_STILL_IMAGE_FPS || 30);
const STILL_IMAGE_FPS = STILL_IMAGE_FPS_CONFIG.fps;
```

Include `STILL_IMAGE_FPS_CONFIG.warning` in the render report when present.

- [ ] **Step 2: Import the shared renderer**

Add:

```js
import { renderStableImageSequenceClip } from "../electron/services/stable-image-sequence-renderer.mjs";
```

- [ ] **Step 3: Replace `renderStillImageSceneVideo()` internals**

Keep the function name if it reduces churn, but replace the FFmpeg `zoompan` call with:

```js
const sequenceResult = await renderStableImageSequenceClip({
  ffmpegBin: ffmpegPath,
  imagePath,
  outputPath: adjustedVideo,
  durationSeconds: audioDuration,
  order,
  motionPreset,
  motionStrength: STABLE_KEN_BURNS_STRENGTH,
  fps: STILL_IMAGE_FPS,
  jobDir: JOB_DIR,
  keepFrames: process.env.HERMES_KEEP_MOTION_FRAMES === "1",
});
```

Then keep the existing audio mux step.

- [ ] **Step 4: Update returned scene metadata**

Return:

```js
{
  order,
  finalScene,
  videoDuration: audioDuration,
  audioDuration,
  ratio: 1,
  strategy: "stable-image-sequence",
  stillImageFps: sequenceResult.fps,
  motionStrategy: "stable-sequence-ken-burns",
  motionStrength: sequenceResult.motionStrength,
  motionPreset,
  imagePath,
  frameCount: sequenceResult.frameCount,
  uniqueFrameCount: sequenceResult.uniqueFrameCount,
  framesPerMotionStep: sequenceResult.framesPerMotionStep,
  sequenceManifestPath: sequenceResult.sequenceManifestPath,
  imageSourcePath: imagePath,
  durationPolicy: "image-sequence-match-audio",
  extraHoldSeconds: 0,
  qualityWarnings: [],
  requiresRegeneration: false,
}
```

- [ ] **Step 5: Make async call chain explicit**

If `renderSceneVideo()` is currently synchronous, convert only the render path functions that need it to `async` and update their callers. Keep video-scene duration logic unchanged.

- [ ] **Step 6: Make still source fallback explicit**

Extend `imageSceneSource()` to detect `.jpg`, `.jpeg`, `.png`, and `.webp`. If `outputMode: "image"` but no still source exists, write a warning:

```json
{
  "code": "IMAGE_MODE_STILL_SOURCE_MISSING",
  "sceneOrder": 4,
  "message": "Image mode requested but no still source was found; renderer used the raw scene media fallback."
}
```

### Task 4: Update Preview Image Renderer To Avoid Divergence

**Files:**
- Modify: `electron/services/image-scene-renderer.mjs`

- [ ] **Step 1: Replace local `zoompan` presets**

Import `renderStableImageSequenceClip()` and route preview/intermediate image clips through it.

- [ ] **Step 2: Preserve the public return shape**

Return:

```js
{
  path: outputPath,
  durationSeconds: duration,
  motionPreset,
  motionStrategy: "stable-sequence-ken-burns",
  fps: result.fps,
  frameCount: result.frameCount,
  uniqueFrameCount: result.uniqueFrameCount,
  sequenceManifestPath: result.sequenceManifestPath,
  ffmpegBin: resolvedFfmpegBin
}
```

### Task 5: Add Motion Jitter QA

**Files:**
- Create: `scripts/check-image-motion-jitter-qa.mjs`
- Modify: `package.json`

- [ ] **Step 1: Generate a high-detail fixture in the test**

The test should create a temporary `1080x1920` grid/checker image using `sharp`, with diagonal lines and small contrast details. This exposes pan jitter better than a blank image.

- [ ] **Step 2: Render a 4-second strong-motion image scene**

Call `renderStableImageSequenceClip()` with:

```js
{
  durationSeconds: 4,
  fps: 30,
  motionStrength: "strong",
  motionPreset: "diagonal-drift"
}
```

- [ ] **Step 3: Verify frame metadata**

Assert:

```js
assert.equal(result.fps, 30);
assert.equal(result.frameCount, 120);
assert.equal(result.motionStrategy, "stable-sequence-ken-burns");
assert.ok(result.uniqueFrameCount >= 100);
```

- [ ] **Step 4: Verify no motion collapse**

Sample every 10th frame from the rendered MP4 with FFmpeg into PNG files, compare simple average pixel deltas with Sharp, and assert the median delta is above a small threshold. This catches the previous "zoom/pan disappeared" regression.

- [ ] **Step 5: Verify no alternating spike pattern**

Compare consecutive sampled deltas and assert no single delta is more than `4x` the median unless it occurs at a transition boundary. This catches visible micro-jitter.

### Task 6: Teach Final QA About Stable Sequence Metadata

**Files:**
- Modify: `scripts/analyze-youtube-output.mjs`

- [ ] **Step 1: Read sequence manifests**

For each image scene in `scene-render-manifest.json`, read `sequenceManifestPath` when present.

- [ ] **Step 2: Add failure codes**

Add:

```js
LEGACY_ZOOMPAN_IMAGE_RENDER
MISSING_IMAGE_SEQUENCE_MANIFEST
IMAGE_SEQUENCE_FRAME_COUNT_MISMATCH
IMAGE_SEQUENCE_MOTION_COLLAPSED
IMAGE_SEQUENCE_FRAME_TIME_MISMATCH
IMAGE_SEQUENCE_DELTA_SPIKE
IMAGE_SEQUENCE_DIRECTION_REVERSAL
IMAGE_SEQUENCE_CACHE_CLEANUP_FAILED
IMAGE_MODE_STILL_SOURCE_MISSING
```

- [ ] **Step 3: Add expected checks**

For every image scene:

- `strategy` must be `stable-image-sequence`.
- `motionStrategy` must be `stable-sequence-ken-burns`.
- `frameCount` must be within `+/-1` of `duration * fps`.
- `sequenceManifestPath` must exist.
- `uniqueFrameCount` must be greater than `1` unless motion strength is `none`.
- Stream fps must match the manifest fps.
- Sampled frame-time steps must be constant-frame-rate.
- Sampled frame deltas must not have repeated spike/drop patterns that indicate jitter.
- Motion direction must not repeatedly reverse on x/y/zoom for presets that are supposed to be monotonic.

- [ ] **Step 4: Add directional monotonicity checks**

For each sampled frame pair, estimate the dominant motion direction using frame-difference centroid or the stored camera path in `sequenceManifestPath`. Fail with:

```js
IMAGE_SEQUENCE_DIRECTION_REVERSAL
```

when a supposedly monotonic camera path alternates direction more than once outside a transition boundary.

### Task 7: Expand Scene Manifest Observability

**Files:**
- Modify: `scripts/render-youtube-with-tts.mjs`

- [ ] **Step 1: Add image render metadata to `scene-render-manifest.json`**

Each image scene entry must include:

```json
{
  "order": 2,
  "sourceMode": "image",
  "sceneOutputMode": "image",
  "strategy": "stable-image-sequence",
  "stillImageFps": 30,
  "motionStrategy": "stable-sequence-ken-burns",
  "motionStrength": "strong",
  "motionPreset": "diagonal-drift",
  "frameCount": 149,
  "uniqueFrameCount": 149,
  "framesPerMotionStep": 1,
  "frameDurationSeconds": 4.9667,
  "audioDurationSeconds": 4.95,
  "durationDriftSeconds": 0.0167,
  "imageSourcePath": "C:/Users/amd/AppData/Roaming/hermes/outputs/desktop/youtube-1779934105522/scene_2_flow.jpg",
  "sequenceManifestPath": "C:/Users/amd/AppData/Roaming/hermes/outputs/desktop/youtube-1779934105522/scene_2_motion_manifest.json",
  "durationPolicy": "image-sequence-match-audio"
}
```

- [ ] **Step 2: Preserve metadata in `render-report-v2.json`**

The final report should keep the same fields so the desktop console can expose them without reading another file.

### Task 8: Persist Stable Sequence Failure Codes

**Files:**
- Modify: `workflow-db-events.mjs`
- Modify: `scripts/check-desktop-progress-feedback.mjs`

- [ ] **Step 1: Add DB failure-code recognition**

Extend `failureCodeOf()` text matching with:

```js
if (/LEGACY_ZOOMPAN_IMAGE_RENDER/i.test(text)) return "LEGACY_ZOOMPAN_IMAGE_RENDER";
if (/MISSING_IMAGE_SEQUENCE_MANIFEST/i.test(text)) return "MISSING_IMAGE_SEQUENCE_MANIFEST";
if (/IMAGE_SEQUENCE_FRAME_COUNT_MISMATCH/i.test(text)) return "IMAGE_SEQUENCE_FRAME_COUNT_MISMATCH";
if (/IMAGE_SEQUENCE_FRAME_TIME_MISMATCH/i.test(text)) return "IMAGE_SEQUENCE_FRAME_TIME_MISMATCH";
if (/IMAGE_SEQUENCE_MOTION_COLLAPSED/i.test(text)) return "IMAGE_SEQUENCE_MOTION_COLLAPSED";
if (/IMAGE_SEQUENCE_DELTA_SPIKE/i.test(text)) return "IMAGE_SEQUENCE_DELTA_SPIKE";
if (/IMAGE_SEQUENCE_DIRECTION_REVERSAL/i.test(text)) return "IMAGE_SEQUENCE_DIRECTION_REVERSAL";
if (/IMAGE_SEQUENCE_CACHE_CLEANUP_FAILED/i.test(text)) return "IMAGE_SEQUENCE_CACHE_CLEANUP_FAILED";
if (/IMAGE_MODE_STILL_SOURCE_MISSING/i.test(text)) return "IMAGE_MODE_STILL_SOURCE_MISSING";
```

The existing `failureCodesOf()` already preserves `event.details.failureCodes` and `event.details.finalOutputQa.failureCodes`, so this task is for fallback text extraction and search-friendly prefixes.

- [ ] **Step 2: Add a persistence check**

Update `scripts/check-desktop-progress-feedback.mjs` to create a fake `desktop-job-failed` event with:

```js
details: {
  failureCodes: ["IMAGE_SEQUENCE_DIRECTION_REVERSAL", "IMAGE_SEQUENCE_DELTA_SPIKE"]
}
```

Assert that the persisted failure payload includes both codes and that the prefix uses `IMAGE_SEQUENCE_DIRECTION_REVERSAL` as the primary code.

### Task 9: Re-render The Latest Job Assets For Proof

**Files:**
- Existing output folder: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779934105522`

- [ ] **Step 1: Preserve the old final render**

Copy:

```powershell
Copy-Item 'C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779934105522\desktop-flow-1779934105594.mp4' 'C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779934105522\desktop-flow-1779934105594.before-stable-sequence.mp4'
```

- [ ] **Step 2: Re-render using existing Flow media and TTS**

Run the existing final render command against the same job folder with:

```powershell
$env:HERMES_STABLE_KEN_BURNS_STRENGTH='strong'
$env:HERMES_KEEP_MOTION_FRAMES='0'
node scripts/render-youtube-with-tts.mjs 'C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779934105522'
```

- [ ] **Step 3: Verify final technical metadata**

Run:

```powershell
$ff = node -p "require('ffmpeg-static')"
& $ff -hide_banner -i 'C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779934105522\desktop-flow-1779934105594.mp4' -f null -
```

Expected:

```text
Duration: 00:01:02.xx
Video: h264, yuv420p, 1080x1920, 30 fps
Audio: aac
```

- [ ] **Step 4: Verify scene metadata changed**

Open `scene-render-manifest.json` and confirm scenes 2-7 now show:

```json
"strategy": "stable-image-sequence",
"motionStrategy": "stable-sequence-ken-burns",
"framesPerMotionStep": 1
```

for strong motion, or `2` for light motion.

- [ ] **Step 5: Run full checks**

Run:

```powershell
npm.cmd run check
```

Expected:

```text
all checks passed
```

### Task 10: Package And Desktop Shortcut Verification

**Files:**
- Modify only if needed: `package.json`
- Verify: `C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe`

- [ ] **Step 1: Rebuild packaged app**

Run:

```powershell
npm.cmd run electron:pack
```

- [ ] **Step 2: Verify new service is unpacked**

Run:

```powershell
Test-Path 'C:\Users\amd\hermes\dist-electron\win-unpacked\resources\app.asar.unpacked\electron\services\stable-image-sequence-renderer.mjs'
```

Expected:

```text
True
```

- [ ] **Step 3: Launch from desktop shortcut and render a short image-mode job**

Use Hermes Studio with:

- Source: direct script or keyword.
- Flow output mode: image or hybrid with body image mode.
- Motion intensity: strong.
- Target length: 60 seconds.

Expected:

- The final video renders.
- Console log says image scenes used `stable-sequence-ken-burns`.
- No image scene reports legacy `zoompan`.

---

## Acceptance Criteria

- Latest image-mode and hybrid body image scenes are rendered with `stable-image-sequence`.
- No production final image scene uses FFmpeg `zoompan`.
- Final report records `fps`, `frameCount`, `uniqueFrameCount`, `framesPerMotionStep`, `motionStrategy`, and `sequenceManifestPath`.
- A strong-motion test visibly moves without the previous tremor and without disappearing motion.
- Invalid `HERMES_STILL_IMAGE_FPS` values cannot break FFmpeg invocation.
- `scene-render-manifest.json` contains enough image-scene metadata to reproduce and debug the render.
- Motion cache directories are removed automatically unless `HERMES_KEEP_MOTION_FRAMES=1`.
- Stable sequence QA failure codes are searchable in workflow failure persistence.
- `npm.cmd run check` passes.
- Packaged app includes the new renderer service.
- Re-rendered `youtube-1779934105522` final output is available for user review.

---

## Follow-Up After This Plan

This plan intentionally does not change Flow video scenes, TTS, subtitles, or HPSL drafting. Scene 1 still has a separate `SOFT_DURATION_MISMATCH` warning from a Flow video/audio duration ratio. That is a different duration policy issue and should remain separate from the image pan/zoom jitter fix.
