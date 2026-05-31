# 2026-05-26 Last URL Workflow Test and Duration Fix Plan

## Test Evidence

- Test URL: `https://n.news.naver.com/mnews/article/001/0016099405`
- Job directory: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779793460188`
- Workflow result: failed at final QA, not at Google Flow.
- Final video path created before QA stop: `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779793460188\desktop-flow-1779793460196.mp4`
- QA failure: `TARGET_DURATION_DRIFT`
- Target duration: 60s
- Final duration: 39.53s
- Drift: -20.47s

## What Worked

1. Provider fallback worked:
   - `gemini-gems` failed because it returned schema placeholder content.
   - The workflow recorded this in `provider-fallback-chain.json`.
   - Normal Gemini fallback generated a usable HPSL draft.

2. HPSL structure worked:
   - Runtime contract: `youtube-hpsl-v2`
   - Scene sections: Hook, Point, Story, Lesson
   - Scene count: 7

3. Hybrid Flow mode worked:
   - Scene 1 was generated as video.
   - Scenes 2-7 were generated as images.
   - Image scenes were converted to motion clips with per-scene motion presets.

4. Final QA correctly blocked a bad final output:
   - A short 39.53s video was not treated as a successful 60s final.

## Problems Found

### P0: Draft duration is not contract-bound before expensive Flow generation

The selected target was 60s, but the accepted draft had only 270 Korean characters:

- Hook: 34 chars, target 7s
- Point: 47 chars, target 13s
- Story: 132 chars, target 30s
- Lesson: 54 chars, target 10s

Actual TTS durations totaled about 39.42s. The renderer then trimmed scene media to the narration length, so the final video became 39.53s.

Root cause: the draft QA validates structure and corruption, but does not yet reject a draft whose estimated/actual spoken duration is too short for the selected target.

### P0: Duration mismatch is discovered after Flow generation

The workflow spent time generating all Flow assets before discovering the TTS duration drift at final render QA.

Root cause: TTS duration validation happens too late. The workflow should estimate and, ideally, measure narration duration before Google Flow generation.

### P1: Gems placeholder fallback works, but recovery is one-way

Gems returned schema placeholder content and normal Gemini fallback succeeded. This is safe, but the system does not yet retry Gems with a compact corrective prompt such as "do not repeat the schema; return real HPSL content only."

Root cause: provider fallback is observable now, but provider-specific repair prompts are not implemented.

### P1: Manual workflow runner can create a mismatched job id if it prebuilds a job without passing `id`

The manual test harness prebuilt a job id and then called `createYouTubeJob`, which built a fresh id internally. The packaged Electron path already passes the id through `main.mjs`, but direct scripts should avoid this footgun.

Root cause: `createYouTubeJob` owns normalization but manual callers may also call `buildDesktopJobRequest`.

## Implementation Plan

### 1. Add duration-aware draft QA before Flow

- Add `scripts/check-draft-duration-contract.mjs`.
- Add a shared helper, for example `scripts/youtube-draft-duration.mjs`.
- Validate:
  - Estimated Korean TTS seconds must be within target tolerance before Flow starts.
  - Default tolerance: target * 0.9 to target * 1.12.
  - For 60s, reject drafts below about 54s or above about 67s.
- Include section-level checks:
  - Hook should be near 7s.
  - Point should be near 13s.
  - Story should be near 30s.
  - Lesson should be near 10s.

### 2. Add automatic draft expansion/shortening retry

- If draft is too short:
  - Retry the same provider once with the prior draft and a direct correction instruction.
  - Preserve the same HPSL facts and article interpretation.
  - Expand narration naturally, not by repeating sentences.
- If draft is too long:
  - Retry with compression instruction.
- Record attempts in `provider-fallback-chain.json` with:
  - `durationQa`
  - `estimatedSeconds`
  - `targetSeconds`
  - `repairAttempt`

### 3. Move TTS duration measurement before Flow where possible

- Generate or estimate scene narration audio before Flow media generation.
- Use actual local TTS durations to set scene media duration targets.
- If TTS total still fails target tolerance, repair the draft before any Flow generation begins.

### 4. Make renderer duration policy explicit

- Keep current behavior for scene sync: trim/stretch scene visuals to narration.
- Do not pad final videos with silent holds just to hit target duration.
- Only allow final duration drift if the user explicitly chooses a "natural duration" mode.
- For preset/manual duration modes, failed duration QA should block final success, as it did in this test.

### 5. Harden Gems fallback

- Add one corrective retry for `gemini-gems` when the failure class is `placeholder-schema`.
- If the second Gems attempt still fails, fallback to normal Gemini as now.
- Preserve the current circuit breaker for repeated structural/provider failures.

### 6. Add direct runner id safety

- Let `createYouTubeJob` accept an already normalized job or require callers to pass `input.id`.
- Add a check script that ensures manual/service runs do not produce mismatched `job.id` and `jobDir`.

## Acceptance Criteria

- The same URL with a 60s preset must not enter Flow generation if the accepted draft estimates below 54s.
- Provider chain must show either:
  - accepted draft within duration tolerance, or
  - rejected draft with duration failure and repair/fallback attempts.
- Final render QA for preset 60s must pass with final duration between 54s and 67s.
- Hybrid mode must preserve scene 1 as video and remaining scenes as image when configured that way.
- Packaged Electron and direct service workflow must write consistent job ids and job directories.

