# Hermes Longform History Workflow Issues And Fix Plan

> For agentic workers: use `superpowers:systematic-debugging`, `superpowers:test-driven-development`, and `superpowers:verification-before-completion` when implementing or extending this plan.

## Goal

Turn the successful 10 minute mock UI/render smoke run into a production-ready longform workflow using NotebookLM/Gemini research, Google Flow video hooks, Google Flow image body scenes, local TTS, subtitles, and robust QA.

## What Was Verified

- Hermes Studio can be launched and operated through the UI with Playwright Electron.
- Direct script mode can submit a 10 minute target job.
- Hybrid mode now supports `10` opening video scenes.
- Custom duration now supports up to `1200` seconds.
- Long direct-script scene splitting no longer creates empty scenes that fall back to the full script.
- Local TTS and ffmpeg rendered an 11 minute 21 second final video.
- Final output QA accepts direct-script longform outputs when duration is at least the requested longform target and within a reasonable upper bound.

## Issues Found

### 1. Long Script Scene Split Bug

Root cause:

- `planScenesFromScript` used `ceil(sourceSentences.length / count)` and then looped `count` times.
- With 64 sentences and 18 target scenes, the last loop could receive an empty slice.
- Empty slices fell back to the full script, causing `DUPLICATE_FULL_SCRIPT_SCENE`.

Fix applied:

- Changed scene slicing to proportional `floor(index * length / count)` boundaries.
- Added `scripts/check-longform-ui-workflow-guards.mjs`.

### 2. Hybrid Opening Count Was Shorts-Bounded

Root cause:

- UI, schema, scene output policy, Gemini prompt helper, and direct-script warning logic capped hybrid intro video scenes at `6`.

Fix applied:

- Raised hybrid intro video scene cap to `10` across UI/schema/policy/prompt guard.

### 3. Custom Duration Was Too Narrow

Root cause:

- UI, schema, planner, and draft duration QA capped custom duration at `600` seconds.

Fix applied:

- Raised supported custom duration cap to `1200` seconds for longform experimentation.

### 4. Render Sync Policy Was Shorts-Centric

Root cause:

- A scene failed if audio exceeded video by more than 2 seconds, even when the ratio was only about `1.17`.
- This is reasonable for 8 second Shorts clips but too strict for 30-50 second longform scenes.

Fix applied:

- For scenes at least 20 seconds long, ratio `<= 1.2` now uses `slowdown-loop` warning instead of hard failure.

### 5. Final Output QA Was Shorts-Centric

Root cause:

- `TARGET_DURATION_DRIFT` used tight symmetric drift limits.
- Direct-script longform output at 681.74 seconds was incorrectly treated as failed against a 600 second target.
- Direct-script jobs were also flagged as `MISSING_HPSL_CONTRACT`.
- `HARD_FREEZE_RISK` treated absolute extra seconds as failure even after the renderer used `slowdown-loop`.

Fix applied:

- Longform-like jobs accept output from `95%` to `120%` of target.
- Direct-script longform does not require HPSL.
- `HARD_FREEZE_RISK` now follows hard strategies/ratio, not soft longform slowdown warnings.

## 2026-05-27 Implementation Update

Implemented:

- Longform mode is now a first-class job option through `videoFormat: "longform"`.
- Hermes Studio exposes longform target length, opening video clip count, body image duration, and live MCP opt-in controls.
- Longform jobs force Google Flow hybrid mode: opening scenes are video, body scenes are image.
- NotebookLM live MCP usage is explicit opt-in and research notes are persisted as `research_brief.json` when available.
- The workflow creates a dedicated `longform-media-plan.json` with about 10 opening video scenes and duration-based body image scenes.
- Flow media generation now persists `scene-media-manifest.json` after every scene, marks failed scenes, and reuses completed media on rerun.
- Hermes Studio now exposes `Retry Failed Scenes` and `Render Existing Assets` recovery actions for selected jobs.
- The packaged desktop build and shortcut launcher were rebuilt/verified.

Still remaining:

- Real NotebookLM/Google Flow end-to-end validation must be run with authenticated live accounts for a full 10+ minute job.
- Per-scene Flow retry policy and per-scene skip/regenerate controls are still the next hardening step.
- Longform-specific QA reporting can be expanded beyond the current shared final-output QA gates.

## Remaining Production Work

### Task 1: Live NotebookLM Research Provider

- Add a UI switch for live MCP usage. Done.
- Pass `enableLiveMcp: true` only when the user explicitly enables it. Done.
- Persist `research_brief.json` in the job folder. Done when research is available.
- Timeout NotebookLM at 30 seconds and fall back to Gemini Gems.
- Never block the render pipeline on NotebookLM auth/session failure.

### Task 2: Dedicated Longform Draft Schema

- Add `videoFormat: "longform"`. Done.
- Replace Shorts HPSL-only schema with `LONGFORM_CHAPTERS`. Partially done in workflow normalization; the upstream Gemini/Gems draft prompt can still be made more natively chapter-oriented.
- Required chapters:
  - cold open
  - context
  - deep dive
  - examples
  - takeaway
- Keep HPSL as the narrative thinking model, not as the only output schema.

### Task 3: Longform Media Planner

- Separate narration/TTS segments from visual media scenes.
- Generate about 10 opening Flow video prompts. Done.
- Generate 25-60 body Flow image prompts depending on target duration. Done.
- Group multiple narration segments under each body image when visually coherent.
- Persist `longform-media-plan.json`. Done.

### Task 4: Live Google Flow Longform Execution

- Use Flow video mode only for the opening hook clips.
- Use Flow image mode for body scenes.
- Add per-scene retry, skip, and resume support. Resume support is implemented through `scene-media-manifest.json`; selected-job recovery buttons are implemented; per-scene skip/regenerate UI remains.
- Do not restart completed scenes after one scene fails. Done for reruns with existing completed media.
- Save Flow screenshots and mode-selection diagnostics.

### Task 5: QA And Recovery

- Add longform-specific QA report:
  - duration range
  - subtitle sync
  - scene freeze risk
  - visual repetition
  - missing asset recovery
  - source/citation notes
- Add "render with existing assets" retry button for failed final QA.
- Add "split scene and regenerate only affected media" recovery for hard mismatch scenes.

## Manual Verification Artifact

- Manual: `C:\Users\amd\hermes\docs\manuals\2026-05-26-longform-history-workflow-manual.md`
- Final mock render: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779804102903\desktop-mock-1779804103124.mp4`
- Run report: `C:\Users\amd\AppData\Roaming\hermes\outputs\manual-runs\longform-history-ui-workflow-1779804099075.json`
