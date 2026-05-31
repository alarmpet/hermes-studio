# Hermes Longform 10 Minute Hybrid Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Longform mode that can generate 10+ minute YouTube videos with the first ~60 seconds made from about 10 Google Flow video clips, and the remaining body rendered from Google Flow images with advanced motion, transitions, TTS, subtitles, QA, and MCP-assisted research/archive/diagnostics.

**Architecture:** Do not stretch the existing Shorts-only scene model. Add a separate longform planning layer that decouples narration segments from visual assets: narration is split into many short subtitle/TTS segments, while visuals are planned as intro video beats plus chapter-based image scenes. MCP providers remain optional and safe: NotebookLM for grounded research, Google Workspace for source/archive, Chrome DevTools MCP for Flow/Gemini diagnostics.

**Tech Stack:** Electron, Node.js, Playwright/Google Flow browser automation, Gemini Gems/Gemini draft flow, NotebookLM MCP, Google Workspace MCP, Chrome DevTools MCP, local Supertonic TTS, ffmpeg, existing Hermes QA scripts.

---

## Product Behavior

## 2026-05-26 Review Verification Update

Reviewed `C:/Users/amd/hermes/HERMES_LONGFORM_HYBRID_REVIEW.md` against the current codebase.

Accepted:

- Accumulated sync drift is a real longform risk. A 10+ minute video can concatenate 50-70 visual clips; small per-scene duration errors can accumulate into visible audio/subtitle drift. The renderer plan must add millisecond-level duration accounting and a final drift report.
- Render garbage collection is required. Longform jobs can create many raw Flow videos/images, normalized clips, synced clips, TTS chunks, concat lists, and temporary audio files. The plan must preserve final artifacts and manifests, but clean disposable intermediate assets after a successful render or when the user explicitly runs cleanup.
- Longform script density QA is valid. For Korean longform narration, the plan should validate approximate character density against target duration before Flow generation. Use a practical range as a warning/repair guard rather than a rigid fatal rule for every style.
- Minimal SQLite indexing for longform recovery is valid. The current codebase already stores `workflow_json` in the `jobs` table and detailed events in `task_events`; therefore the first implementation should keep full options in workflow JSON and add only query-friendly columns if needed.

Adjusted:

- The review suggests deleting all `tts_N.wav` and `scene_N_flow_raw.*` immediately. That is too aggressive for debugging. The plan now uses a retention policy: keep final artifacts, manifests, QA reports, provider logs, and failed-job evidence; delete only disposable temp files after successful renders unless `keepDebugAssets` is enabled.
- The review suggests DB columns for every longform option. The plan now adds only `video_format`, `target_seconds`, and `intro_video_clip_count` as optional migration-safe columns while keeping full longform settings in `workflow_json` and job artifacts.

Rejected:

- Do not call the final output “Shorts/Longform mp4.” Longform output should be treated as normal YouTube longform, not Shorts.
- Do not force every longform topic into exactly 180-220 Korean characters per minute as a hard failure. That density is useful as a default guideline, but narration speed, pauses, and topic style vary. Use warning thresholds and repair retry first.

### User-Facing Mode

Add a new `videoFormat` option:

- `shorts`
- `longform`

When `longform` is selected:

- minimum target length: 600 seconds
- recommended defaults:
  - target length: 720 seconds
  - intro video duration: 60 seconds
  - intro video clip count: 10
  - intro clip duration: 6 seconds each
  - body visual mode: images rendered as motion video
  - body image duration: 10-18 seconds per visual, depending on topic density
  - subtitle mode: paragraph-aware, not giant shorts captions

### Why This Must Be Separate From Shorts

The current pipeline is optimized for 30-90 second Shorts:

- `customDurationSeconds` is clamped to 600 seconds.
- `hybridIntroVideoSceneCount` is clamped to 6.
- Gemini/Gems prompt schema assumes a compact HPSL script.
- Scene QA warns when a single scene narration is too long.
- Rendering and final QA assume short scene sets.

For 10+ minute videos, forcing 600+ seconds through the Shorts model would create repeated scenes, frozen video, too-long captions, and Flow bottlenecks. Longform must use a chapter model.

## Longform Structure

Use a longform HPSL-compatible chapter arc:

1. `cold_open` / 0-60s
   - goal: immediate retention
   - media: 10 Flow video clips
   - style: fast, concrete, curiosity-driven
   - narration: short punchy claims/questions, each under ~45 Korean characters where possible

2. `context` / 60-180s
   - what happened, why it matters
   - media: Flow images with slow motion, zoom, pan, parallax-like movement

3. `deep_dive` / 180-480s
   - detailed explanation, examples, comparisons, implications
   - media: chapter image packs and recurring visual metaphors

4. `examples` / 480-600s
   - 2-3 concrete cases or scenarios
   - media: image sequences and subtle transitions

5. `takeaway` / final 60-120s
   - lesson, warning, practical conclusion
   - media: cleaner, slower visuals

The script can still preserve HPSL thinking, but the output object should be `LONGFORM_HPSL` or `LONGFORM_CHAPTERS`, not the existing Shorts HPSL schema.

## Media Strategy

### Intro: First ~1 Minute

- Generate about 10 Google Flow video clips.
- Clip duration target: 5-7 seconds each.
- Each clip should visualize one hook beat, not read narration.
- Use cinematic video prompts with strong visible actions:
  - before/after contrast
  - product/object close-up
  - real-world use
  - risk visualization
  - simple process metaphor

### Body: Remaining 9+ Minutes

Use images, not videos, for stability and speed.

Recommended image planning:

- 10 minute target:
  - 10 intro video clips
  - 36-60 body images
  - each image supports 10-18 seconds of narration
  - subtitles are independent from image duration

Do not generate one image per sentence if the script has 80+ sentences. That creates too many Flow calls. Instead:

- split narration into subtitle/TTS segments every 5-8 seconds
- group 2-3 narration segments under one body image when visually coherent
- apply different render motion presets to the same image clip:
  - slow push-in
  - lateral pan
  - reveal crop
  - chapter transition fade

This prevents freeze while keeping Flow call count manageable.

## MCP and Skill Use

### NotebookLM MCP

Use for longform source grounding.

Workflow:

1. User enters keyword, URL, or direct script.
2. Hermes asks NotebookLM MCP for:
   - key facts
   - timeline
   - opposing viewpoints
   - definitions
   - citations/source notes
   - risks of overclaiming
3. NotebookLM output becomes `research_brief.json`.
4. Gemini Gems receives only summarized research notes, not raw long documents.
5. If NotebookLM times out or auth fails, fallback to Gemini Gems directly.

Use NotebookLM especially for:

- article collections
- PDF/source packs
- complex tech/business topics
- videos requiring citations and nuance

### Google Workspace MCP

Use for source/archive operations.

Read-only first:

- Drive search for source docs
- Docs read for prepared scripts
- Sheets read for topic calendars

Archive later:

- longform outline
- research brief
- final script
- scene/media manifest
- subtitle file
- QA report
- final render path

Local files remain canonical. Workspace is an archive and collaboration layer, not the only storage.

### Chrome DevTools MCP

Use only for developer diagnostics:

- Google Flow stuck during video/image generation
- image/video mode mismatch
- Gemini/Gems response not complete
- ChatGPT/thumbnail automation issue
- Electron renderer console errors

Never collect cookies, auth headers, unrelated tabs, or private account pages.

### Superpowers Skills

Use:

- `superpowers:writing-plans` for architecture changes
- `superpowers:test-driven-development` for schema/planner/renderer changes
- `superpowers:systematic-debugging` for Flow/render failures
- `superpowers:verification-before-completion` before claiming longform generation works

## File Structure

Create:

- `electron/services/longform-planner.mjs`
  - Builds chapter targets, intro video clip plan, body image plan, subtitle segment plan.

- `electron/services/longform-research-brief.mjs`
  - Normalizes NotebookLM/Gemini source notes into a compact brief.

- `scripts/check-longform-job-schema.mjs`
  - Verifies `videoFormat`, longform duration limits, intro video count, and body image mode.

- `scripts/check-longform-planner-contract.mjs`
  - Verifies 10+ minute planning, 10 intro video scenes, body image scenes, and segment/media decoupling.

- `scripts/check-longform-render-contract.mjs`
  - Verifies render timeout, manifests, and no forced 600-second cap.

- `scripts/check-longform-sync-drift-contract.mjs`
  - Verifies millisecond timeline accounting and drift QA thresholds.

- `scripts/check-longform-render-cleanup-contract.mjs`
  - Verifies safe cleanup keeps final/debug artifacts and deletes only disposable temporary files.

- `scripts/check-longform-db-contract.mjs`
  - Verifies migration-safe DB columns for longform job recovery.

- `docs/superpowers/plans/2026-05-26-longform-10min-hybrid-video-plan.md`
  - This plan.

Modify:

- `youtube-job-schema.mjs`
  - Add `videoFormat`, `longformTargetSeconds`, `introVideoSeconds`, `introVideoClipCount`, `bodyVisualMode`, `bodyImageSeconds`.

- `electron/renderer/index.html`
  - Add Longform mode controls.

- `electron/renderer/app.js`
  - Read and validate longform controls.

- `automation/gemini-research-draft.mjs`
  - Add longform prompt/schema path.

- `youtube-workflow.mjs`
  - Route longform jobs through longform planner.

- `youtube-workflow-stages.mjs`
  - Keep existing Flow media generation, but feed it longform media scenes.

- `scripts/render-youtube-with-tts.mjs`
  - Support longform manifests where subtitle segments and visual scenes are separate.

- `scripts/youtube-draft-duration.mjs`
  - Permit target lengths beyond 600 seconds for longform.

- `scripts/youtube-draft-quality.mjs`
  - Adjust long scene checks for longform by checking subtitle segments, not visual scene narration only.

- `scripts/analyze-youtube-output.mjs`
  - Add longform QA thresholds.

- `bot_db_helper.py`
  - Add migration-safe optional columns for `video_format`, `target_seconds`, and `intro_video_clip_count` only if needed for job list filtering/recovery. Keep full longform options in `workflow_json`.

## Implementation Tasks

### Task 1: Longform Job Schema

**Files:**

- Modify: `youtube-job-schema.mjs`
- Create: `scripts/check-longform-job-schema.mjs`

- [ ] Add failing test:

```js
import assert from "node:assert/strict";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const job = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: {
    videoFormat: "longform",
    scriptLengthMode: "custom",
    customDurationSeconds: 900,
    flowOutputMode: "hybrid",
    hybridIntroVideoSceneCount: 10,
    introVideoSeconds: 60,
    introVideoClipCount: 10,
    bodyVisualMode: "image",
    bodyImageSeconds: 14
  }
});

assert.equal(job.options.videoFormat, "longform");
assert.equal(job.options.customDurationSeconds, 900);
assert.equal(job.options.hybridIntroVideoSceneCount, 10);
assert.equal(job.options.introVideoClipCount, 10);
assert.equal(job.options.bodyVisualMode, "image");
```

- [ ] Run test and verify it fails:

```powershell
node scripts/check-longform-job-schema.mjs
```

- [ ] Implement schema:
  - `videoFormat`: `shorts | longform`
  - shorts keeps existing 15-600 second clamp
  - longform allows 600-3600 seconds initially
  - `hybridIntroVideoSceneCount` allows 0-20 for longform
  - `introVideoClipCount` allows 0-20
  - `bodyVisualMode`: `image`
  - `bodyImageSeconds`: 8-30

- [ ] Run:

```powershell
node scripts/check-longform-job-schema.mjs
node scripts/check-youtube-job-schema.mjs
```

### Task 2: Longform UI Controls

**Files:**

- Modify: `electron/renderer/index.html`
- Modify: `electron/renderer/app.js`
- Create: `scripts/check-longform-ui-contract.mjs`

- [ ] Add UI contract test:
  - `videoFormat` selector exists.
  - Longform controls exist:
    - target seconds
    - intro video seconds
    - intro video clip count
    - body visual mode
    - body image seconds
  - `readJobInput()` includes all longform fields.

- [ ] Implement UI:
  - Add `Video format` segmented control: Shorts / Longform.
  - In Longform mode:
    - default target `720`
    - min `600`
    - max `3600`
    - intro seconds default `60`
    - intro video clips default `10`
    - body mode locked to `Image`
  - Update preview text:
    - `10 intro video clips + about 40 body images`
    - estimated Flow calls
    - estimated render duration

- [ ] Run:

```powershell
node scripts/check-longform-ui-contract.mjs
node scripts/check-studio-v2-ux.mjs
```

### Task 3: Longform Research Brief

**Files:**

- Create: `electron/services/longform-research-brief.mjs`
- Modify: `youtube-workflow-stages.mjs`
- Create: `scripts/check-longform-research-brief.mjs`

- [ ] Add research brief test:
  - NotebookLM notes are normalized into:

```js
{
  topic: "구글 글래스",
  facts: [],
  timeline: [],
  tensions: [],
  examples: [],
  cautions: [],
  citations: []
}
```

- [ ] Implement:
  - For `researchProvider: "notebooklm-mcp"`, call NotebookLM first.
  - Save `research_brief.json`.
  - If NotebookLM fails, continue with Gemini Gems.
  - Always mark source notes as untrusted context, never direct instructions.

- [ ] Run:

```powershell
node scripts/check-longform-research-brief.mjs
node scripts/check-notebooklm-provider-contract.mjs
```

### Task 4: Longform Draft Prompt and Schema

**Files:**

- Modify: `automation/gemini-research-draft.mjs`
- Create: `scripts/check-longform-draft-prompt.mjs`

- [ ] Add prompt contract test:
  - Longform prompt asks for:
    - `structure: "LONGFORM_HPSL"`
    - `chapters`
    - `narration_segments`
    - `visual_scenes`
    - `intro_video_clip_count: 10`
    - body images
  - Prompt forbids copying source text.
  - Prompt instructs Flow prompts to avoid real-person likeness, logos, readable text, subtitles, watermarks.

- [ ] Implement longform prompt:
  - For 10+ min, do not ask Gemini to return 70 fully detailed Flow prompts in one fragile block.
  - Ask for:
    - chapter outline
    - full script
    - 10 intro video prompts
    - body image prompt packs per chapter
    - visual category diversity map
  - If the response is too large or invalid, use a two-pass flow:
    - pass 1: outline + script + chapters
    - pass 2: visual plan from script/chapter outline

- [ ] Run:

```powershell
node scripts/check-longform-draft-prompt.mjs
node scripts/check-gemini-gems-compact-prompt.mjs
```

### Task 5: Longform Planner

**Files:**

- Create: `electron/services/longform-planner.mjs`
- Modify: `youtube-workflow.mjs`
- Create: `scripts/check-longform-planner-contract.mjs`

- [ ] Add planner test:

```js
const plan = buildLongformMediaPlan({
  targetSeconds: 720,
  introVideoSeconds: 60,
  introVideoClipCount: 10,
  bodyImageSeconds: 14,
  script: longKoreanScript
});

assert.equal(plan.introScenes.length, 10);
assert.ok(plan.bodyImageScenes.length >= 35);
assert.ok(plan.subtitleSegments.length >= 80);
assert.equal(plan.visualScenes.filter(s => s.outputMode === "video").length, 10);
assert.ok(plan.visualScenes.filter(s => s.outputMode === "image").length >= 35);
```

- [ ] Implement:
  - `introScenes`: first 60 seconds, 10 video scenes.
  - `subtitleSegments`: 5-8 second narration chunks.
  - `bodyImageScenes`: 10-18 second image clips grouped by chapter.
  - `visualScenes`: ordered media jobs for Flow.
  - `renderTimeline`: maps subtitle segments onto visual scenes.

- [ ] Do not attach huge narration to every image scene.

- [ ] Run:

```powershell
node scripts/check-longform-planner-contract.mjs
node scripts/check-hpsl-scene-planner.mjs
```

### Task 6: Flow Generation Scheduling

**Files:**

- Modify: `youtube-workflow-stages.mjs`
- Create: `scripts/check-longform-flow-scheduling.mjs`

- [ ] Add test:
  - Longform intro scenes have `outputMode: "video"`.
  - Body scenes have `outputMode: "image"`.
  - Flow generation emits progress:
    - `intro-video 1/10`
    - `body-image 1/N`
    - estimated remaining Flow calls.

- [ ] Implement:
  - Keep generation serial by default for account safety.
  - Add resumable manifest:
    - if media exists and passes file sanity check, skip regeneration.
  - On Flow policy warning, use existing safe prompt fallback.
  - On image mode mismatch, fail that scene and surface action-required.

- [ ] Run:

```powershell
node scripts/check-longform-flow-scheduling.mjs
node scripts/check-flow-output-mode-contract.mjs
```

### Task 7: Longform Renderer Timeline

**Files:**

- Modify: `scripts/render-youtube-with-tts.mjs`
- Create: `scripts/check-longform-render-contract.mjs`

- [ ] Add test:
  - Renderer accepts:

```json
{
  "visualScenes": [],
  "subtitleSegments": [],
  "renderTimeline": []
}
```

  - It does not require one subtitle segment per media scene.
  - Render timeout supports 10+ minute output.

- [ ] Implement:
  - Intro video clips are concatenated with audio-muted visual track.
  - Body images are converted to motion clips.
  - TTS is generated from full narration or chapter chunks.
  - Subtitles are generated from subtitle segments, not visual scene narration.
  - Final mux uses ffmpeg concat/mix with stable timestamps.
  - Every scene writes exact `audioDurationMs`, `videoDurationMs`, `timelineStartMs`, `timelineEndMs`, and `driftMs`.
  - Normalize clips before concat:
    - 30fps
    - yuv420p
    - configured longform resolution
    - 48kHz audio
    - explicit PTS reset per clip

- [ ] Increase render timeout for longform:
  - shorts: 15 minutes
  - longform: 60 minutes default

- [ ] Run:

```powershell
node scripts/check-longform-render-contract.mjs
node scripts/check-packaged-render-runner.mjs
```

### Task 7A: Longform Sync Drift Guard

**Files:**

- Modify: `scripts/render-youtube-with-tts.mjs`
- Modify: `scripts/analyze-youtube-output.mjs`
- Create: `scripts/check-longform-sync-drift-contract.mjs`

- [ ] Add test:

```js
const qa = analyzeLongformTimeline({
  targetSeconds: 720,
  visualScenes: [
    { order: 1, videoDurationMs: 6000, audioDurationMs: 5980 },
    { order: 2, videoDurationMs: 6000, audioDurationMs: 6040 }
  ]
});

assert.ok(qa.maxSceneDriftMs <= 120);
assert.ok(qa.accumulatedDriftMs <= 500);
```

- [ ] Implement:
  - collect actual audio duration through ffprobe
  - collect actual normalized clip duration through ffprobe
  - write `render-timeline.json`
  - write `final-qa.json` drift fields
  - fail QA if accumulated drift exceeds 500ms for longform

- [ ] Run:

```powershell
node scripts/check-longform-sync-drift-contract.mjs
node scripts/check-longform-render-contract.mjs
```

### Task 7B: Longform Render Cleanup

**Files:**

- Modify: `scripts/render-youtube-with-tts.mjs`
- Create: `scripts/check-longform-render-cleanup-contract.mjs`

- [ ] Add test:
  - cleanup keeps final mp4, script, subtitles, manifest, QA, and failure logs
  - cleanup deletes synced temp clips, concat lists, and duplicate cache clips
  - cleanup does not run destructively on failed jobs
  - `keepDebugAssets: true` preserves raw Flow media

- [ ] Implement:

```js
export async function cleanupTemporaryRenderAssets({
  jobDir,
  manifest,
  keepDebugAssets = false,
  renderSucceeded = false
}) {
  if (!renderSucceeded) return { skipped: true, reason: "render-not-succeeded" };
  // Delete only paths listed as disposable in the manifest.
}
```

- [ ] Run:

```powershell
node scripts/check-longform-render-cleanup-contract.mjs
```

### Task 8: Longform QA

**Files:**

- Modify: `scripts/analyze-youtube-output.mjs`
- Modify: `scripts/youtube-draft-duration.mjs`
- Modify: `scripts/youtube-draft-quality.mjs`
- Create: `scripts/check-longform-output-qa.mjs`

- [ ] Add QA rules:
  - final duration must be within -3% / +8% of target.
  - final accumulated audio/video drift must be under 500ms.
  - any scene over 120ms local drift must be listed in QA.
  - intro must contain at least 8 video scenes when `introVideoClipCount=10`.
  - body must be mostly image-origin scenes.
  - no visual asset should hold longer than 24 seconds unless intentional.
  - subtitles must not exceed 2 lines.
  - no subtitle line should cover the full screen.
  - no duplicate script scene.
  - no dominant visual category above 35% unless user selected a single-object tutorial.
  - longform narration density should target 180-220 Korean characters per minute, warn outside 160-245, and trigger one repair attempt before Flow generation.

- [ ] Run:

```powershell
node scripts/check-longform-output-qa.mjs
npm.cmd run check
```

### Task 8A: Longform DB Recovery Columns

**Files:**

- Modify: `bot_db_helper.py`
- Modify: `workflow-db-events.mjs`
- Create: `scripts/check-longform-db-contract.mjs`

- [ ] Add test:
  - `bot_db_helper.py init` creates/migrates:
    - `jobs.video_format`
    - `jobs.target_seconds`
    - `jobs.intro_video_clip_count`
  - existing DBs remain compatible
  - full longform options are still preserved in `workflow_json`

- [ ] Implement with existing `ensure_column()`:

```python
ensure_column(conn, "jobs", "video_format", "TEXT DEFAULT 'shorts'")
ensure_column(conn, "jobs", "target_seconds", "INTEGER")
ensure_column(conn, "jobs", "intro_video_clip_count", "INTEGER")
```

- [ ] Update workflow event payloads to include these fields when available.

- [ ] Run:

```powershell
python bot_db_helper.py init
node scripts/check-longform-db-contract.mjs
node scripts/check-timeline-contract.mjs
```

### Task 9: Workspace Archive and Recovery

**Files:**

- Modify: `electron/services/workspace-archive-provider.mjs`
- Modify: `youtube-workflow-stages.mjs`
- Create: `scripts/check-longform-workspace-archive.mjs`

- [ ] Save local files first:
  - `longform-outline.json`
  - `research_brief.json`
  - `longform-script.txt`
  - `longform-media-plan.json`
  - `render-timeline.json`
  - `final-qa.json`

- [ ] If Google Workspace MCP is enabled:
  - archive metadata and final report to Drive/Docs.
  - do not block final render if archive fails.

- [ ] Run:

```powershell
node scripts/check-longform-workspace-archive.mjs
```

### Task 10: Chrome DevTools MCP Diagnostics for Longform

**Files:**

- Modify: `docs/superpowers/plans/2026-05-26-chrome-devtools-mcp-diagnostics-plan.md`
- Create: `scripts/check-longform-devtools-runbook.mjs`

- [ ] Extend runbook:
  - debug long Flow queues
  - verify image/video mode per scene
  - inspect stalled Flow generation
  - capture console/network/screenshot/DOM only
  - forbid cookies/auth headers

- [ ] Run:

```powershell
node scripts/check-longform-devtools-runbook.mjs
node scripts/check-chrome-devtools-diagnostics-plan.mjs
```

## Operational Guidance

### Expected Flow Calls for a 10 Minute Video

Recommended default:

- 10 intro video calls
- 36-60 body image calls
- total: 46-70 Flow calls

This is large. The UI must warn:

- Google Flow may rate-limit.
- Generation can take a long time.
- Account switching may be needed.
- The job must be resumable.

### Better Quality Defaults

For longform:

- voice speed: 1.0-1.06
- subtitle font smaller than Shorts
- max subtitle lines: 2
- lower-third placement
- body images: 12-16 seconds each with motion
- transition: light crossfade or scene fade
- motion intensity: light for body, strong only for intro

### Failure Recovery

If a Flow video clip fails in intro:

- retry once with safer prompt
- if still failed, replace with image motion clip
- mark QA warning, not fatal, unless fewer than 8 intro video clips remain

If a body image fails:

- retry once
- if still failed, reuse nearest chapter image with different motion
- mark QA warning

## Acceptance Criteria

- User can choose Longform mode in Hermes Studio.
- User can enter at least 720 seconds as target length.
- User can set intro video clip count to 10.
- Planner creates about 10 video intro scenes and image body scenes.
- NotebookLM MCP can provide optional research notes.
- Google Workspace MCP can optionally archive local artifacts.
- Chrome DevTools MCP runbook covers longform Flow debugging.
- Final renderer can produce 10+ minute output without subtitle/image freeze regressions.
- Final renderer reports millisecond sync drift and keeps final drift under 500ms.
- Successful longform render cleans disposable temporary files without deleting debug evidence for failed jobs.
- Longform job recovery fields are available in SQLite while full settings remain in workflow JSON/artifacts.
- `npm.cmd run check` passes.
