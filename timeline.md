# Hermes Studio Timeline

이 문서는 Hermes Studio의 기능 추가, 수정, 삭제, 큰 코드나 아키텍처 변경을 시간순으로 남기는 작업 기록입니다.

## 기록 규칙

- 형식: `YYYY-MM-DD HH:mm KST - 구분 - 요약`
- 기록 대상: 기능 추가, 수정, 삭제, 아키텍처 변경, 워크플로우 변경, 외부 인증/자동화 경로 변경, 렌더링 결과에 영향을 주는 변경
- 제외 대상: 단순 오탈자, 임시 로그, 실행 산출물, 빌드 캐시
- 각 항목에는 가능하면 영향 범위와 검증 방법을 한 줄로 남깁니다.

## 내역

- 2026-05-26 00:00 KST - 기능 추가 - Gemini 자료 수집/대본 작성 경로를 Gemini Gems 우선으로 변경하고, 실패 시 일반 Gemini와 기존 OpenRouter fallback으로 이어지게 설계했습니다. 영향 범위: `automation/gemini-research-draft.mjs`, `youtube-workflow-stages.mjs`. 검증: `scripts/check-gemini-gems-priority.mjs`.
- 2026-05-26 00:00 KST - 아키텍처 변경 - 기능 추가/수정/삭제 및 큰 코드 변경을 시간순으로 추적하기 위한 루트 `timeline.md` 기록 규칙을 추가했습니다. 검증: `scripts/check-timeline-contract.mjs`.
- 2026-05-26 20:17 KST - 수정 - Gemini Gems/Gemini/OpenRouter provider fallback 관측성, placeholder/한국어 깨짐 draft QA, desktop failure persistence, 최종 길이 drift QA를 추가했습니다. 영향 범위: draft generation, desktop job failure handling, final output QA. 검증: `npm run check`.
- 2026-05-26 20:17 KST - 기능 추가 - Hermes Studio 렌더 효과 강도를 `none`, `light`, `strong`으로 정리하고 UI에는 `효과없음`, `약하게`, `강하게`로 노출했습니다. 이미지 장면은 강도별 deterministic random motion preset을 사용합니다. 영향 범위: renderer UI, render effect presets, workflow event payloads. 검증: `scripts/check-render-effect-presets.mjs`, `scripts/check-studio-v2-ux.mjs`.
- 2026-05-26 20:17 KST - 워크플로우 변경 - 마지막 URL `https://n.news.naver.com/mnews/article/001/0016099405`를 실제 workflow로 실행해 Gemini fallback, Google Flow hybrid media generation, TTS/subtitle/final render까지 확인했습니다. 최종 QA가 60초 목표 대비 39.53초 산출물을 `TARGET_DURATION_DRIFT`로 차단했습니다. 후속 계획: `docs/superpowers/plans/2026-05-26-last-url-workflow-duration-fix-plan.md`.
- 2026-05-26 20:45 KST - 수정 - Flow 생성 전에 draft 예상 발화 길이를 검사하는 duration contract를 추가하고, Gemini Gems/Gemini/OpenRouter provider acceptance와 normalized workflow draft 단계에 연결했습니다. 너무 짧거나 긴 draft는 provider repair retry 또는 fallback으로 넘어가며, 실패/재시도/통과 정보는 `provider-fallback-chain.json`에 기록됩니다. 검증: `scripts/check-draft-duration-contract.mjs`, `scripts/check-draft-duration-observability.mjs`, `scripts/check-desktop-job-id-consistency.mjs`.
- 2026-05-26 20:55 KST - 수정 - Gemini Gems에는 Gem 내부 지침을 신뢰하는 compact prompt만 보내도록 바꾸고, 일반 Gemini fallback에만 full schema prompt를 유지했습니다. Gemini/Gems 응답 대기도 안정화 횟수와 최소 안정 시간을 요구하도록 조정해 생성 중인 답변을 조기 수집하고 브라우저를 닫는 위험을 줄였습니다. 검증: `scripts/check-gemini-gems-compact-prompt.mjs`, `scripts/check-gemini-response-wait-contract.mjs`.
- 2026-05-26 21:15 KST - 계획/조사 - Google MCP, Antigravity, NotebookLM, Chrome DevTools, Google Workspace, Genmedia 후보를 조사하고 Hermes Studio 외부 provider registry 도입 계획을 작성했습니다. 계획: `docs/superpowers/plans/2026-05-26-google-mcp-skills-research-integration-plan.md`. 검증: GitHub/web source review.
- 2026-05-26 21:25 KST - 계획 수정 - Google MCP 1차 실행 범위를 Chrome DevTools MCP, NotebookLM MCP, Google Workspace MCP로 제한하고 Antigravity/Gemini MCP/Vertex Genmedia는 보류 참고 항목으로 내렸습니다. 계획: `docs/superpowers/plans/2026-05-26-google-mcp-skills-research-integration-plan.md`. 검증: `node scripts/check-timeline-contract.mjs`.
- 2026-05-26 21:40 KST - 계획 수정 - `HERMES_GOOGLE_MCP_INTEGRATION_REVIEW.md`를 검토해 MCP 자식 프로세스 cleanup, NotebookLM timeout/fallback, Google Workspace safeStorage 토큰 보관, Authentication 계정 변경/세션 삭제 UI, provider 선택 persistence를 Google MCP 계획에 반영했습니다. `projects` 테이블 추가는 현재 스키마에 없어 1차 범위에서 제외했습니다. 검증: `node scripts/check-timeline-contract.mjs`.
- 2026-05-26 22:05 KST - 기능 추가 - Google MCP 1차 기반 구현으로 외부 provider registry, MCP 프로세스 cleanup, safeStorage 토큰 저장 helper, Authentication 계정 변경/세션 삭제 IPC/UI, NotebookLM/Workspace auth target, research/archive provider job metadata를 추가했습니다. 영향 범위: Electron auth/UI/main/preload, job schema, provider docs. 검증: `node scripts/check-external-provider-registry.mjs`, `node scripts/check-secure-token-store.mjs`, `node scripts/check-auth-account-switching.mjs`, `node scripts/check-mcp-provider-persistence.mjs`.
- 2026-05-26 22:25 KST - 기능 추가 - NotebookLM MCP research provider 골격, 30초 timeout/fallback 분류, Gemini/Gems 리서치 노트 주입, Google Workspace readonly archive provider 골격, Chrome DevTools MCP developer-only 진단 runbook을 추가했습니다. 실제 live MCP tool 연결은 `requestMcp` adapter 후속 단계로 남겼습니다. 검증: `node scripts/check-notebooklm-provider-contract.mjs`, `node scripts/check-workspace-archive-provider-contract.mjs`, `node scripts/check-chrome-devtools-diagnostics-plan.mjs`.
- 2026-05-26 22:45 KST - 기능 추가 - MCP stdio JSON-RPC 클라이언트를 추가하고 NotebookLM `ask_question`, Google Workspace `manage_drive search` live 호출 경로를 opt-in으로 연결했습니다. 기본 워크플로우는 계속 비활성/폴백 중심으로 동작합니다. 검증: `node scripts/check-mcp-stdio-client-contract.mjs`.
- 2026-05-26 23:05 KST - 계획 추가 - 10분 이상 롱폼 영상 생성을 위해 초반 약 1분은 10개 Flow 동영상, 본문은 Flow 이미지+모션 렌더로 구성하는 Longform Hybrid 계획을 작성했습니다. NotebookLM MCP, Google Workspace MCP, Chrome DevTools MCP, Superpowers 검증 흐름을 포함했습니다. 계획: `docs/superpowers/plans/2026-05-26-longform-10min-hybrid-video-plan.md`. 검증: `node scripts/check-timeline-contract.mjs`.
- 2026-05-26 23:20 KST - 계획 수정 - `HERMES_LONGFORM_HYBRID_REVIEW.md`를 검토해 장편 렌더 누적 싱크 드리프트 guard, 임시 렌더 파일 cleanup 정책, 장편 한국어 대본 밀도 QA, 최소 SQLite recovery 컬럼을 Longform Hybrid 계획에 반영했습니다. 즉시 원본 Flow/실패 로그를 삭제하는 제안은 디버깅 보존을 위해 retention 정책으로 조정했습니다. 검증: `node scripts/check-timeline-contract.mjs`.
- 2026-05-26 23:25 KST - 수정 - Authentication 계정 변경/세션 삭제 UI가 소스에만 있고 패키지 실행본에는 없는 문제를 확인해 패키지 검증을 추가하고 `dist-electron` 설치본/실행본을 재빌드했습니다. 바탕화면 바로가기는 최신 런처를 통해 기존 Hermes 프로세스를 종료한 뒤 최신 `win-unpacked` 실행본을 열도록 확인했습니다. 검증: `node scripts/check-packaged-auth-account-switching.mjs`, `node scripts/check-desktop-shortcut-launcher.mjs`.
## 2026-05-26 23:40 KST - 수정 - 10분 이상 장편 UI 워크플로우 검증 및 장편 QA 보정

- Hermes Studio를 Playwright Electron으로 직접 실행해 `1814년 런던 맥주 홍수` 주제의 10분 이상 직접대본 작업을 UI에서 제출하고 최종 렌더까지 검증했습니다.
- 장편 대본 분배가 빈 장면을 만들고 전체 대본 fallback을 넣던 문제를 수정했습니다.
- 하이브리드 오프닝 영상 장면 수 상한을 6개에서 10개로 확장했습니다.
- 직접대본/장편 실험을 위해 커스텀 길이 상한을 1200초로 확장했습니다.
- 장편 렌더의 부드러운 slowdown-loop 싱크 보정과 직접대본 장편 QA 허용 규칙을 추가했습니다.
- 매뉴얼 `docs/manuals/2026-05-26-longform-history-workflow-manual.md`와 후속 계획서 `docs/superpowers/plans/2026-05-26-longform-history-workflow-issues-plan.md`를 추가했습니다.

## 2026-05-27 00:35 KST - Feature - Longform production contract

- Added `videoFormat=longform`, longform target length controls, 10 opening Flow video clips, body Flow image scenes, explicit live MCP opt-in, `research_brief.json` persistence, and `longform-media-plan.json` generation.
- Impact: Electron UI, job schema, desktop job service, NotebookLM research handoff, workflow planning, tests, packaged build.
- Verification: `npm.cmd run check`, `npm.cmd run electron:pack`, `node scripts/check-packaged-render-runner.mjs`, `node scripts/check-packaged-auth-account-switching.mjs`, `node scripts/check-desktop-shortcut-launcher.mjs`.

## 2026-05-27 01:00 KST - Feature - Longform scene resume manifest

- Added `scene-media-manifest.json` persistence during Flow media generation so completed scenes are saved immediately, failed scenes are marked, and reruns reuse existing completed media instead of starting from scene 1.
- Impact: longform Flow recovery, `generateYouTubeWorkflowAssets`, package verification.
- Verification: `node scripts/check-longform-scene-resume-contract.mjs`, `npm.cmd run check`.

## 2026-05-27 01:15 KST - Feature - Desktop recovery actions

- Added Hermes Studio recovery actions for selected jobs: `Retry Failed Scenes` reruns Flow media generation with completed-scene reuse, and `Render Existing Assets` rebuilds the final video from existing job assets without regenerating Flow media.
- Impact: Electron renderer, preload IPC, main-process recovery handlers, job summaries, recovery tests.
- Verification: `node scripts/check-desktop-recovery-actions.mjs`, `npm.cmd run check`.

## 2026-05-27 04:55 KST - Fix - URL workflow Gems fallback and Flow image render

- Simplified Gemini Gems prompting for shorts so Gems is asked for Hermes JSON only, while longform defaults to NotebookLM MCP live research when not explicitly overridden.
- Fixed provider fallback and duration QA so accepted Gemini/OpenRouter drafts use the same provider-soft contract in the normalized workflow stage instead of being rejected again before Flow.
- Fixed Google Flow image mode automation for the current UI: dismisses the Flow agent notice, finds the lower-left generator chip, accepts final UI verification even when a click attempt reports a stale miss, and verifies Nano Banana Pro image mode.
- Fixed image-mode final rendering so still-image scenes can be extended with soft pan/zoom timing instead of being blocked as video clip duration mismatches.
- Actual workflow verification: ran the requested Naver URL through Hermes Studio with real Flow image mode and rendered `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779823750753\final-url-news-standard-image-mode-1779823750753.mp4` at 72.07s.
- Verification: `npm.cmd run check`.

## 2026-05-27 05:20 KST - Fix - Stable image-mode Ken Burns render

- Replaced image-mode final render stretching with a stable still-image pipeline that calculates scene FPS/frame count from the TTS duration and generates subtle Ken Burns zoom/pan directly from the original `scene_*_flow.jpg`.
- This keeps motion in image-mode videos while avoiding the dizzy jitter caused by stretching already-rendered short pan/zoom clips.
- Regenerated `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779823750753\final-url-news-standard-image-mode-smoothkenburns-1779823750753.mp4` at 72.07s with subtitle end 72.03s.
- Verification: `node --check scripts/render-youtube-with-tts.mjs`, `node scripts/check-image-scene-renderer-contract.mjs`, `node scripts/check-render-soft-ratio-policy.mjs`, frame-difference motion check, `npm.cmd run electron:pack`.

## 2026-05-27 18:20 KST - Fix - Workflow failure diagnostics and draft grounding

- Added atomic `provider-fallback-chain.json` persistence with temp-file rename and Windows `EACCES`/`EPERM` retry backoff so interrupted Gemini/Gems runs do not leave zero-byte fallback logs.
- Strengthened draft QA with keyword source grounding, Korean josa trimming, Gemini/제미나이 alias handling, strict HPSL contract checks when the job requests HPSL, and vertical Shorts prompt aspect validation.
- Added structured failure-code mirroring into SQLite `task_failures.error_msg` without a DB schema migration, allowing `/diagnose` to group failures such as `SOURCE_GROUNDING_MISMATCH`, `FLOW_PROMPT_ASPECT_MISMATCH`, `HPSL_STRUCTURE_MISMATCH`, and `FLOW_MODE_MISMATCH`.
- Added `research_brief.json` audit persistence for keyword/URL jobs and a contract test for source-grounding evidence.
- Verification: `node scripts/check-provider-fallback-observability.mjs`, `node scripts/check-youtube-draft-quality.mjs`, `node scripts/check-hpsl-qa-gate.mjs`, `node scripts/check-desktop-progress-feedback.mjs`, `node scripts/check-research-grounding-contract.mjs`.

## 2026-05-27 21:15 KST - Fix - Google Flow Agent chip mode mismatch

- Added a shared Flow bottom-bar chip classifier so Google Flow readiness and output-mode switching reject Agent/request/create/add chips and prefer real model/settings chips such as `Nano Banana Pro`, `Veo`, `crop_9_16`, and `1x`.
- Fixed video/image mode verification to classify the selected model/settings chip instead of scanning mixed bottom-bar text, preventing image keywords from overriding a valid video state.
- Added selected/rejected chip diagnostics to Flow mode mismatch events and SQLite mirrored failure payloads.
- Added `scripts/check-flow-chip-classifier.mjs` and wired it into `check:flow-output-mode`.
- Verification: `node scripts/check-flow-chip-classifier.mjs`, `node scripts/check-flow-output-mode-contract.mjs`, `npm.cmd run check:flow-output-mode`, `node scripts/check-desktop-progress-feedback.mjs`.
- 2026-05-27 22:36 KST - Fix - Maximized browser workflow defaults
  - Hermes Studio now opens maximized, auth Chrome windows start maximized at 1920x1080, and Google Flow/Gemini browser automation enforces a 1920x1080 viewport instead of silently continuing with a small window.
  - Live UI workflow scripts now maximize the Electron window, assert a 1600x1000 test viewport, and record window bounds/viewport in run reports.
  - Packaged runtime contracts now verify the maximized-window policy so installed builds do not regress to small browser windows.
- 2026-05-27 23:56 KST - Fix - Pasted URL source auto-detection
  - Fixed a desktop workflow failure where a pasted news URL could remain in Keyword mode, causing OpenRouter source validation to require the literal URL inside the draft.
  - Job normalization now treats http/https values as URL jobs unless the user explicitly chose direct Script mode, and the renderer switches to URL mode when a URL is pasted into the input.
  - Rebuilt the packaged app and verified the packaged runtime plus full check suite.
- 2026-05-28 00:14 KST - Fix - Browser window actual maximization
  - Google Flow and Gemini automation now maximize the real Chromium OS window through Chrome DevTools Protocol (`Browser.setWindowBounds`) instead of relying only on viewport size and `--start-maximized` launch flags.
  - Auth Chrome windows now also start at the primary display origin with a large size.
  - Packaged runtime contracts verify CDP window maximization, and the installer was rebuilt.
- 2026-05-28 00:45 KST - Fix - Packaged render service modules
  - Fixed a packaged final-render crash where `app.asar.unpacked/scripts/render-youtube-with-tts.mjs` imported `../electron/services/timeline-transition-renderer.mjs`, but `electron/services` was not unpacked.
  - Added `electron/services/**/*.mjs` and `node_modules/@img/**/*` to `asarUnpack` so external Node render scripts can resolve service modules and Sharp native runtime files in packaged builds.
  - Added `scripts/check-packaged-render-import-graph.mjs` to recursively verify the unpacked render script's local ESM dependency graph without executing the renderer.
  - Strengthened packaged runtime checks for unpacked render services, executable `ffmpeg.exe`, and Sharp native `.node` bindings.
  - Rebuilt the packaged Electron app.
  - Verification: `node scripts/check-packaged-render-import-graph.mjs`, `node scripts/check-packaged-runtime-contract.mjs`, `npm.cmd run check:packaged-render-runner`, `npm.cmd run check`.
- 2026-05-28 03:40 KST - Fix - Final output QA soft slowdown policy
  - Fixed a false `HARD_FREEZE_RISK` where final render succeeded with `slowdown-loop`, but final QA used a stricter hard-coded ratio threshold.
  - Final output QA now reuses `classifyDurationSyncPolicy()` and keeps policy-approved soft mismatches as `softDurationWarnings`.
  - Added regression coverage for soft slowdown, stale `freezeRisk` flags, and image-mode fallback from draft scene output mode.
  - Final QA failures now tell the UI that the final video exists but QA blocked it, and DB mirroring preserves final QA failure codes.
  - Verified against `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779904137210`.
  - Verification: `node scripts/check-final-output-soft-slowdown-qa.mjs`, `npm.cmd run check:final-output-qa`, `node scripts/analyze-youtube-output.mjs C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1779904137210`, `npm.cmd run check`.
# 2026-05-28 Stable image sequence pan/zoom renderer

- Added `electron/services/stable-image-sequence-renderer.mjs` to replace production image-scene `zoompan` rendering with a precomputed CFR image sequence.
- Routed final YouTube image scenes and Flow image normalization through the shared stable sequence renderer.
- Added stable image sequence contract and jitter QA checks.
- Added image sequence metadata to render reports/manifests and preserved new QA failure codes in workflow DB failure mirroring.

## 2026-05-31 - Plan/Feature - Webwright diagnostics and ChatGPT thumbnail recovery

- Planned and implemented Webwright as an optional browser diagnostics/crafting layer, not a replacement for Hermes' Playwright production executor.
- Added ChatGPT thumbnail failure taxonomy and diagnostics artifacts so local thumbnail fallback no longer hides primary-provider failure.
- Reviewed `HERMES_WEBWRIGHT_DIAGNOSTICS_REVIEW.md`; accepted config propagation, non-blocking Webwright command checks, SQLite ChatGPT failure persistence, composer-stage diagnostics, and manual profile-concurrency warnings. Rejected the `bot_db_helper.py triageDiagnostic` recommendation because that function does not exist in the current codebase.

## 2026-05-31 - Fix - Direct script UI final render smoke and mock image contract

- Ran Hermes Studio through the Electron UI with a direct Korean test script, Shorts format, Google Flow image mode, strong motion, and Mock Media Mode.
- Found the first successful render was blocked by final QA with `LEGACY_ZOOMPAN_IMAGE_RENDER` because mock image scenes created only `scene_N.mp4` and did not create the Flow-image still source contract.
- Updated Mock Media image scenes to create `scene_N_flow.png`, render it through the shared stable image sequence renderer, and return image-source metadata.
- Added `scripts/check-mock-image-mode-stable-render-contract.mjs` and wired it into `check:flow-output-mode`.
- Verified the UI workflow completed at 100% with final video `C:\Users\amd\hermes\outputs\desktop\youtube-1780216292121\desktop-mock-1780216292373.mp4`; final output QA passed with all scenes using `stable-image-sequence` and no failure codes.

## 2026-05-31 - Fix - ChatGPT thumbnail human-verification recovery

- Confirmed a latest packaged run completed the final video but ChatGPT thumbnail generation fell back locally because `chatgpt.com` showed Cloudflare human verification.
- Added thumbnail-only recovery through `retryThumbnailForJob`, `youtube:retryThumbnail`, preload exposure, and a Hermes Studio `Retry Thumbnail Only` button.
- Preserved ChatGPT primary failure details after local fallback and surfaced `Action Required` guidance telling the user to open `Authenticate ChatGPT`, complete verification manually, then retry only the thumbnail.
- Added `scripts/check-chatgpt-thumbnail-recovery-contract.mjs` and wired it into `check:chatgpt-thumbnail`.

## 2026-05-31 - Feature - Video top title overlay

- Added the top-title overlay contract for Shorts-style header captions, with Shorts enabled by default and Longform requiring explicit opt-in.
- Added `electron/services/title-overlay-presets.mjs` with opacity-safe presets for Sharp SVG rendering.
- Routed title overlay settings through Studio job input, normalized job options, and `render-options.json`.
- Updated the final renderer to generate a transparent `title-overlay.png` with Sharp and compose it with subtitles in a single FFmpeg `filter_complex` pass.
- Added Studio UI controls for title enablement, manual title text, style selection, and preview.
- Added `scripts/check-title-overlay-render-contract.mjs` and wired it into final-output QA.
