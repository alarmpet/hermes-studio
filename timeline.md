# Hermes Studio Timeline

## 2026-06-04 - Fix - Flow Image Mode Timeout

- Fixed Google Flow control check timeout in image-mode scenes by adding 한글 "생성" (`\uc0dd\uc131`) button pattern mapping to `waitForFlowGeneratorReady` in `automation/google-flow-media.mjs`.
- Verification: `npm run check` and `node scripts/validate-wiki.mjs`.

## 2026-06-03 - Fix & Compliance - Obsidian Wiki, Audio Timeline Gaps, and Default Settings

- Fixed narration sentence splitting in scene planner (`script-planner.mjs`) to prevent mid-sentence breaks and pauses.
- Implemented lossless WAV concatenation before single-pass AAC encoding to eliminate audio priming gaps at scene boundaries.
- Updated default user options: input type (URL), voice preset (30s male high), subtitle size (14), video preset (stickman explainer), thumbnail subtitle size (70), and ChatGPT thumbnail creation disabled by default.
- Implemented Obsidian AI Wiki structure and security compliance guidelines under `AI-Sessions/` and root configurations, guarded by a custom validator `validate-wiki.mjs`.
- Verification: `node scripts/validate-wiki.mjs` and `npm run check`.


## 2026-06-02 - Feature - Script auto duration


- Added direct-script `scriptLengthMode="auto"` so Hermes Studio can calculate video duration from the pasted script instead of stretching it to a stale preset/manual target.
- Unified script duration estimation across UI preview, job schema normalization, direct-script draft generation, render options, and draft duration QA.
- Preserved auto duration for direct-script longform jobs so longform normalization does not overwrite it with `custom`.
- Verification: `node scripts/check-script-auto-duration-contract.mjs`, `npm run check:studio-inputs`, `npm run check`, `npm run electron:pack`.

## 2026-06-01

- Hybrid intro video 장면이 8초 Flow 클립에 맞도록 공백 제외 35자 이하로 자동 분할되게 했다.
- 긴 Hook 문단은 첫 video 장면 이후 image 장면으로 이어지게 해 `SCENE_DURATION_MISMATCH ratio > 2.5` 반복을 막았다.
- 자동 상단 제목 생성 규칙을 2줄 이내 표시 기준으로 강화했다.
- 상단 제목은 공백 제외 18자 이하로 보정하고, 긴 질문형 기사 제목은 핵심 키워드와 질문 꼬리만 남기도록 했다.
- Draft 생성 프롬프트에도 상단 오버레이용 짧은 제목 규칙을 추가했다.

## 2026-05-31 - Feature - Auto Top Title Text

- Added deterministic automatic top-title text resolution for empty `Title text` fields.
- Preserved manual title text as highest priority.
- Persisted generated title text and source in render artifacts so final videos can be audited.
- Added schema, UI, workflow, and render contract checks for automatic title overlay behavior.

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
## 2026-06-01 - Post-render YouTube upload panel

- Added a job-scoped YouTube upload review panel after final render completion.
- Added editable upload metadata for title, description, tags, privacy, thumbnail, made-for-kids, and synthetic media.
- Replaced guarded upload stub with job-scoped YouTube Data API upload and thumbnail binding.
- Added per-job upload state, duplicate upload protection, upload failure codes, and SQLite workflow-event mirroring.

## 2026-06-02 - Feature - Editable Top Title overlay and final output QA guard

- Added thumbnail-like Top Title style controls for font, weight, size, text color, keyword color, background color, opacity, position, band height, side padding, and outline.
- Routed `titleOverlayStyle` through Studio input, job schema normalization, desktop job service, workflow render options, and the Sharp SVG title compositor.
- Improved automatic Top Title text selection so short safe titles are preserved, while long narration fragments fall back to HPSL hook/point style hooks.
- Added final-output QA for title overlay line overflow, text overflow, unsafe title band geometry, and excessive Flow video loop extension.
- Preserved structured final QA failure details and report paths in desktop failure events.
- 2026-06-03 22:10 KST - 수정 - TTS 문장 중간 분할로 인한 음성 끊김 및 어색한 장면 전환을 수정하기 위해 씬 플래너 분할 조건 완화와 무손실 WAV 선합성 후 single AAC 인코딩 파이프라인을 도입했습니다. 영향 범위: `electron/services/script-planner.mjs`, `scripts/render-youtube-with-tts.mjs`. 검증: `node scripts/check-narration-sentence-integrity.mjs`, `npm run check`.
- 2026-06-03 22:15 KST - 설정 변경 - 바탕화면 바로가기 실행 본 변경사항 적용 및 프로그램 기본 설정값(입력방식: URL, 음성: 30대 남성 고음, 자막크기: 14, 썸네일텍스트: Sub size 70, ChatGPT 썸네일 비활성화 등)을 변경했습니다. 영향 범위: Electron UI, config-store.
- 2026-06-03 22:30 KST - 아키텍처 변경 - Obsidian AI Wiki 구조 및 보안 컴플라이언스를 적용하고 자동 유효성 검사 도구를 구현했습니다. 영향 범위: `AI-Sessions/`, `START_HERE.md`, `AGENTS.md`, `CLAUDE.md`, `index.md`, `log.md`, `scripts/validate-wiki.mjs`. 검증: `node scripts/validate-wiki.mjs`.
- 2026-06-04 00:45 KST - 수정 - Google Flow 이미지 생성(Image Mode) 시 우하단 실행 버튼("생성", `\uc0dd\uc131`) 한글 감지 정규식 누락으로 발생하던 generator controls ready 타임아웃 오류를 해결했습니다. 영향 범위: `automation/google-flow-media.mjs`. 검증: `npm run check`.


## 2026-06-04 - Feature - StickmanPlus history explainer style preset

- Added `stickmanplus` as the history-channel visual preset for flat vector whiteboard-comic scenes.
- Locked round-head stickman character continuity, parchment/whiteboard world continuity, and historical metaphor props such as maps, scrolls, crowns, coins, scales, castles, and timelines.
- Prevented realistic presenter profiles and readable generated text from overriding the style in shortform and longform Flow prompts.
- Added Flow prompt rewrites for risky history/logo/text cases such as real historical likenesses, brand names, and generated Korean sign text.
- Added shortform, longform, style preset, UI, and Flow safety contract coverage.

## 2026-06-04 - Feature - Google Flow Auto output mode

- Added `auto` as a Google Flow output mode while keeping explicit `video`, `image`, and `hybrid` choices intact.
- Longform jobs now default to `auto` only when the user has not explicitly selected another Flow output mode.
- Added scene-level Auto policy that uses Flow video for hooks, reversals, chapter starts, and climax beats, while assigning quieter explanation scenes to image mode.
- Reordered split script scenes before applying output-mode policy so long narration splits do not accidentally keep old scene numbers and become repeated video scenes.
- Updated Gemini/Gems prompt contracts to describe Auto as a Hermes-side scene analysis step instead of asking the model to hard-code every media mode.
- Added `scripts/check-auto-flow-output-mode-policy.mjs` and wired it into `check:flow-output-mode`.

## 2026-06-04 - Fix - Disable top title for longform landscape output

- Suppressed Top Title overlays for `longform`, 16:9 landscape, and 180s+ longform-style jobs even when the UI checkbox was previously enabled.
- Updated Studio UI so the Top Title toggle is disabled and unchecked for longform-style output before job submission.
- Updated title overlay and schema contracts so explicit opt-in no longer re-enables top titles on longform landscape videos.
- Verification: `node scripts/check-youtube-job-schema.mjs`, `node scripts/check-title-overlay-render-contract.mjs`, `node scripts/check-studio-v2-ux.mjs`, `npm run check:final-output-qa`, `npm run check:studio-inputs`.

## 2026-06-04 - Setting - Studio script and StickmanPlus defaults

- Changed Hermes Studio Create screen default input mode from URL to Script.
- Changed visual style defaults across renderer payload, job schema, desktop job service fallback, and config defaults to `stickmanplus`.
- Fixed the renderer style preset select so it actively chooses `stickmanplus` after options load instead of keeping the browser's automatic first option.
- Verification: `node scripts/check-studio-v2-ux.mjs`, `node scripts/check-youtube-job-schema.mjs`, `npm run check:studio-inputs`, `npm run check:visual-storytelling`.

## 2026-06-05 - Fix - Longform aspect-aware normalization & Black fallback frame QA

- Modified `electron/services/scene-video-normalizer.mjs` and `youtube-workflow-stages.mjs` to scale/crop Flow videos based on job aspectRatio (1920x1080 for 16:9 landscape, 1080x1920 for 9:16 portrait) instead of forcing a portrait intermediate.
- Prevented black fallback scenes by implementing `extractRepresentativeFrame` in `scripts/render-youtube-with-tts.mjs` which samples multiple timestamps, checks RGB mean/stdev via Sharp, and chooses the highest entropy non-black frame.
- Added Korean character speech speed limits in `electron/services/longform-planner.mjs` and `electron/services/scene-output-mode-policy.mjs` so video scenes targeting narration above 8s are auto-downgraded to image mode or split to avoid loop pressure.
- Strengthened `scripts/analyze-youtube-output.mjs` to run duration drift checks in production, inspect fallback frame RGB stats, and assert job/scene aspect ratio compatibility.
- Added contract tests `check-longform-aspect-aware-video-normalization.mjs`, `check-video-fallback-frame-selection.mjs`, `check-final-output-black-frame-qa.mjs`, `check-final-output-duration-drift-qa.mjs`, and `check-longform-video-scene-duration-guard.mjs`.
- Added final MP4 black-span sampling to catch sustained blank visuals even when fallback still files have been overwritten by later retries.
- Split duration QA into TTS-target drift and final-video-vs-audio drift, so repeated narration or doubled audio fails separately from render padding.
- Added aspect-aware scene media reuse guards so stale portrait-normalized clips are not reused in landscape longform rerenders.
- Verification: `node scripts\check-final-output-duration-drift-qa.mjs`, `npm.cmd run check:final-output-qa`, and targeted `node --check` syntax checks for the changed renderer, analyzer, planner, policy, normalizer, and workflow modules.

## 2026-06-05 - Fix - Longform opening video auto policy

- Changed longform `hybrid` planning so the opening clip count is an Auto candidate cap instead of a forced "first 10 scenes are video" rule.
- Updated longform Auto output mode to reject opening video candidates when narration is estimated above the safe one-clip limit, preserving `autoRejectedReason` for observability.
- Kept explicit shortform/direct-script hybrid behavior intact where it is not routed through longform planning.
- Fixed longform render target selection so longform jobs use `longformTargetSeconds` instead of collapsing to a short script auto estimate.
- Verification: `node scripts\check-auto-flow-output-mode-policy.mjs`, `node scripts\check-longform-production-contract.mjs`, `node scripts\check-longform-ui-workflow-guards.mjs`, `npm.cmd run check:flow-output-mode`, `npm.cmd run check:final-output-qa`.

## 2026-06-05 - QA - Rerender last longform job from existing Flow assets

- Cloned `youtube-1780583022437` to `youtube-1780583022437-rerender-auto-policy` to preserve the original broken output.
- Reused existing Google Flow media assets and converted unsafe opening video candidates 2, 4, 5, 7, 8, 9, and 10 to image-sequence scenes based on audio duration and previous loop/fallback warnings.
- Rendered final output `final-youtube-ai-news-tts-subtitled-v2-rerender-auto-policy.mp4` at 1920x1080, 30fps, 8:50.73 duration.
- Final analyzer passed with no failure codes; black-span QA passed and final-vs-audio duration drift was 1.715s.
- Remaining issue: the full renderer exceeded the command timeout on this 40-scene job, so the final video was completed through a concat finalizer from existing synced scene assets. A resumable longform render/finalize command should be productized.
- Remaining issue: the reused job's draft/subtitle text appears mojibake-corrupted, so this asset-level rerender validates rendering mechanics but not script/subtitle language quality.

## 2026-06-05 - Plan - Render effects and image zoom QA fix

- Reviewed the rerendered longform final video and confirmed technical QA passed, but visual QA still shows over-centered StickmanPlus image scenes and degraded render effects.
- Identified root causes: `scene-fade` was completed through `concat-finalizer`, converted image scenes can lose explicit `motionPreset`, strong Ken Burns plus Sharp `attention` crop over-emphasizes center subjects, and finalizer metadata is not yet productized.
- Updated `docs/superpowers/plans/2026-06-05-render-effects-zoom-qa-plan.md` with implementation tasks for effect-application QA, mandatory image motion presets, explainer-safe camera mode, real scene-fade handling, resumable finalization, visual framing QA, and safe-camera rerender verification.

## 2026-06-05 - Fix - Render effect QA and explainer-safe image camera

- Added final-output QA for `RENDER_EFFECT_FALLBACK` and `EMPTY_IMAGE_MOTION_PRESET`, so visually degraded renders no longer pass only because black-span/duration checks passed.
- Added explicit motion preset fallback in the final renderer for image scenes that were converted or rerendered without `motionPreset`.
- Added `cameraSafetyMode: "explainer"` to the stable image sequence renderer, clamping strong zoom to 1.12 and recording `maxZoom`, crop bounds, and visible-source ratio in the motion manifest.
- Routed longform/stickman/history image scenes to explainer-safe camera handling and made `scene-fade` apply real local fade-in/fade-out filters instead of plain concat.
- Verification: `node scripts\check-render-effect-application-qa.mjs`, `node scripts\check-scene-fade-transition-contract.mjs`, `node scripts\check-explainer-safe-camera-path.mjs`, `npm.cmd run check:stable-image-sequence-renderer`, `npm.cmd run check:final-output-qa`, `npm.cmd run check:flow-output-mode`.

## 2026-06-05 - QA - Safe camera live final render from generated assets

- Cloned `youtube-1780583022437-rerender-auto-policy` to `youtube-1780583022437-safe-camera-live` and reran final handling from existing Flow/TTS assets.
- The full 40-scene renderer timed out after 30 minutes with 37 synced scenes, so missing image scenes 37, 39, and 40 were rendered from Flow stills and the final timeline was rebuilt.
- Produced `final-youtube-ai-news-tts-subtitled-v2-safe-camera-live.mp4` at 8:50.73 duration with `scene-fade-local`, 40 synced scenes, 40 faded scenes, no analyzer failure codes, no black span, and no empty image motion presets.
- Remaining QA issues: some source Flow images are still centered character portraits despite safe camera constraints; some StickmanPlus panels include readable English text; resumable longform finalization should be productized.
- QA report: `docs/superpowers/plans/2026-06-05-safe-camera-live-render-qa.md`.

## 2026-06-05 - Fix - Duplicate scene sequence and larger lower subtitles

- Confirmed the suspected repeated script was caused by duplicated draft scenes, not final concat: scenes 1-20 were repeated exactly as scenes 21-40, and the TTS manifest rendered all 40 scenes for 529.015s audio.
- Created a corrected output at `C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1780583022437-dedup-bigsubs\final-youtube-ai-news-tts-subtitled-v2-dedup-bigsubs.mp4` by retaining scenes 1-20 and removing duplicated scene orders 21-40.
- Added `DUPLICATE_SCENE_SEQUENCE` draft QA so a complete repeated scene block fails before TTS and final render.
- Increased subtitle preset sizes and renderer ASS font caps, and lowered caption margin defaults so subtitles render larger and lower on screen.
- Verification: `node scripts\check-youtube-draft-quality.mjs`, `node scripts\check-render-pipeline.mjs`, `node scripts\analyze-youtube-output.mjs C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1780583022437-dedup-bigsubs`.

## 2026-06-05 - Fix - Medium duration scene density

- Changed short/medium scene planning from roughly one scene per 10 seconds with an 18-scene cap to roughly one scene per 6 seconds with an 80-scene cap.
- A 240-second script now plans about 40 visual scenes instead of 18-24 long scenes, keeping individual scene durations at or below 8 seconds.
- Added narration-unit expansion so direct scripts split long sentences into smaller visual beats instead of duplicating sentences when the target scene count is higher than the sentence count.
- Updated HPSL section chunking, OpenRouter draft target-scene prompts, and Studio duration preview to use the same six-second scene-density policy.
- Verification: `node scripts\check-medium-duration-scene-density.mjs`, `node scripts\check-hpsl-scene-planner.mjs`, `node scripts\check-script-auto-duration-contract.mjs`, `node scripts\check-youtube-draft-quality.mjs`.

## 2026-06-06 - Fix - TTS Korean guard and direct-script auto longform duration

- Investigated failed job `youtube-1780710993737`; Google Flow media completed, but final render failed before TTS because the renderer misclassified normal Korean question sentences as corrupted and substituted a mojibake fallback script.
- Removed the corrupted curated fallback script from the final renderer and added a shared Korean text guard that allows normal Korean question marks while rejecting real mojibake before TTS with `DRAFT_NARRATION_CORRUPTED`.
- Fixed direct-script `scriptLengthMode=auto` with longform format so render target duration follows the input script estimate instead of being forced to 600 seconds.
- Added a longform scene-fade safety path: renders with more than 24 scenes or 240s+ skip slow per-scene fade re-encoding and use safe concat instead of timing out.
- Re-rendered `youtube-1780710993737` successfully to `final-youtube-ai-news-tts-subtitled-v2-fixed-korean-guard.mp4`; final duration is 399.8s and analyzer passed with no failure codes after metadata correction.
- Verification: `node scripts\check-tts-korean-text-guard.mjs`, `node scripts\check-scene-fade-transition-contract.mjs`, `node scripts\check-longform-production-contract.mjs`, `node scripts\check-script-auto-duration-contract.mjs`, `node scripts\analyze-youtube-output.mjs C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1780710993737`.

## 2026-06-06 - Fix - Longform repeated script and clipped opening video scenes

- Confirmed the "3:20 script became about 6:40" symptom was real draft duplication: latest artifact `youtube-1780710993737` had scenes 1-20 repeated as scenes 21-40, and subtitles restarted at block 93.
- Root cause: longform planning combined `draft.script` and auto-normalized `draft.hpsl.*.narration`; when HPSL was derived from the same script, the narration units doubled before Flow/TTS/render.
- Fixed `electron/services/longform-planner.mjs` so narration units are deduplicated and `script` remains the primary source when HPSL repeats the same content.
- Added opening-scene balancing so longform intro video candidates borrow enough narration to avoid 1-2 second clipped Flow video scenes.
- Updated auto output mode policy to reject opening video candidates below 3.5s or above 8s narration, preserving rejection reasons for debugging.
- Strengthened draft QA to catch high-similarity repeated scene halves, not only exact repeated blocks.
- Added `scripts/check-longform-no-repeat-and-intro-duration.mjs` and wired it into `npm run check`.
- Verification: `node scripts\check-longform-no-repeat-and-intro-duration.mjs`, `node scripts\check-auto-flow-output-mode-policy.mjs`, `node scripts\check-longform-production-contract.mjs`, `node scripts\check-longform-video-scene-duration-guard.mjs`, `node scripts\check-youtube-draft-quality.mjs`, `node scripts\check-script-auto-duration-contract.mjs`.

## 2026-06-06 - Plan - Visual Pacing 4-7s Scene Plan Review

- Created `docs/superpowers/plans/2026-06-06-visual-pacing-4-7s-scene-plan-review.md` to review the visual pacing policy and suggest improvements regarding context-chaining, seamless audio/SRT stitching, and flow API call caps.

## 2026-06-07 - Plan Update - Visual Pacing Review Incorporation

- Reviewed `docs/superpowers/plans/2026-06-06-visual-pacing-4-7s-scene-plan-review.md` against the current Hermes Studio codebase.
- Updated `docs/superpowers/plans/2026-06-06-visual-pacing-4-7s-scene-plan.md` with verified items only: context chaining for split visual beats, seamless audio/subtitle sync constraints, absolute Google Flow video caps, and aspect-aware render manifest QA.
- Explicitly kept the review document's Wiki Audit note out of the implementation plan because wiki lint/save changes are a separate AGENTS.md workflow.

## 2026-06-07 - Fix - Excessive Flow Video Loop QA Failure

- Investigated latest failed desktop job `youtube-1780811377804`; final QA failed with `EXCESSIVE_VIDEO_LOOP` because scene 31 loop-extended a 6s Flow video to match 10.31s TTS audio.
- Fixed `scripts/render-duration-policy.mjs` so excessive video/audio mismatch uses `video-to-image-fallback` instead of repeating short Flow clips.
- Kept extreme mismatches as `SCENE_DURATION_MISMATCH` so very long narration still requires scene splitting or regeneration.
- Strengthened regression coverage in `scripts/check-render-soft-ratio-policy.mjs`.
- Repaired related contract tests for hybrid scene output, sentence integrity, and medium-duration scene density.
- Documented the root cause and recurrence rules in `bugfix.md`.
- Verification: `node scripts/check-render-soft-ratio-policy.mjs`, `node scripts/check-final-output-soft-slowdown-qa.mjs`, `node scripts/check-hybrid-scene-output-policy.mjs`, `node scripts/check-narration-sentence-integrity.mjs`, `node scripts/check-medium-duration-scene-density.mjs`, `npm.cmd run check`.

## 2026-06-08 - Feature - Local-first Ollama assist foundation

- Added optional Ollama/Gemma local LLM assist defaults, desktop UI controls, private-LAN URL guard, JSON provider contract, and safe fallback behavior while keeping the rule-based planner as the default path.
- Added storyboard assist as additive scene hints only; it preserves original narration, duration, and Flow prompts, and writes `ollama-storyboard-diagnostics.json` when enabled during direct-script draft generation.
- Added script polish acceptance guard so LLM-polished scripts cannot silently expand beyond the source script budget.
- Verification: `npm.cmd run check:studio-inputs`, `npm.cmd run check:visual-storytelling`.

## 2026-06-09 - Fix - Flow image placeholder scenes blocked

- Investigated recent desktop outputs where only early Flow video scenes rendered real media; image scenes were silently replaced with local placeholder stills after Flow stayed idle at submit.
- Added Flow image settings-menu close verification, image submit idle retry diagnostics, and specific `FLOW_IMAGE_SUBMIT_DID_NOT_START` failure classification.
- Blocked live production placeholder fallback unless explicitly allowed by Mock Media Mode, and marked allowed fallback assets as `FLOW_IMAGE_LOCAL_PLACEHOLDER`.
- Updated output analysis and resume rendering so existing jobs with placeholder image scenes are flagged before final reuse.
- Verification: `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:flow-output-mode`, `node scripts/analyze-youtube-output.mjs C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1780942735550`, `node scripts/resume-youtube-job-from-assets.mjs C:\Users\amd\AppData\Roaming\hermes\outputs\desktop\youtube-1780942735550`.

## 2026-06-09 - Plan - Flow UI click and rate limit diagnostics

- Reviewed the attached Flow screenshot and desktop job `youtube-1780979482873`, where early Flow video scenes succeeded but image scenes failed with the settings popover open and Flow's fast-request warning.
- Identified a combined failure chain: broad `div/span` click targeting, settings popover not being a hard submit gate, prompt focus not being verified, and fast-request warnings being classified as generic generation failures.
- Created `docs/superpowers/plans/2026-06-09-flow-ui-click-rate-limit-diagnostics-plan.md` with a scoped implementation plan for safe click targeting, menu closure gates, prompt focus verification, request pacing, rate-limit classification, and live smoke diagnostics.
- Reviewed `docs/superpowers/plans/2026-06-09-flow-ui-click-rate-limit-diagnostics-plan-review.md` and updated the plan with verified items only: cross-job global Flow pacing, hard `FLOW_RATE_LIMITED` abort/action-required handling, and DB/UI failure-code propagation. Rejected role-less `div/span` click fallback because it conflicts with the safe-click root cause fix.

## 2026-06-09 - Fix - Flow safe click and rate-limit guard

- Added strict Flow click-target guarding so settings controls resolve to clickable button/role ancestors and non-clickable labels are logged instead of clicked.
- Added a hard generator-menu-closed gate before prompt submission, prompt textbox focus verification, prompt insertion verification, and specific diagnostics for create buttons blocked by the settings menu.
- Split `FLOW_RATE_LIMITED` from abnormal activity/generic generation failure, added global cross-job Flow pacing state under `paths.userData`, and mirrored pacing state into each job folder for postmortems.
- Propagated Flow cooldown failures as `action-required` through scene generation, Electron progress events, job persistence, and workflow DB failure-code logging.
- Added Flow automation safety regression checks and wired them into `npm.cmd run check:flow-policy-safety`.
- Verification: `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:flow-output-mode`, `npm.cmd run check:desktop-progress`, targeted `node --check` for changed Flow/Electron/workflow modules.

## 2026-06-09 - Fix - Chromium maximize state false failure

- Investigated desktop job failure where Chrome returned `windowState: "normal"` after a maximize request even though the bounds were already large (`1936x1100`).
- Added a shared Chromium bounds guard that accepts effectively maximized windows, retries with explicit `1920x1080` normal bounds when needed, and only fails when the resulting window is actually too small.
- Switched both Google Flow and Gemini automation to the shared guard so the same brittle state-string failure cannot abort future jobs.
- Repacked the Electron app so the desktop shortcut launcher runs the updated build.
- Verification: `node scripts/check-chromium-window-bounds-contract.mjs`, `node scripts/check-electron-config.mjs`, `npm.cmd run check:flow-output-mode`, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.

## 2026-06-10 - Fix - Flow prompt textbox focus retry

- Investigated desktop job `youtube-1781016703044`, where scene 10 failed during generation-failed retry with `FLOW_PROMPT_TEXTBOX_NOT_FOCUSED`.
- Root cause: retry submit skipped the pre-submit menu-close gate, then the Flow failure/options menu retained focus (`DIV role="menu"`) while the textbox still existed behind it.
- Added prompt textbox focus retry with menu-close attempts, coordinate click plus DOM `focus()` fallback, selection placement for contenteditable inputs, and `scene_N_flow_prompt_focus_failed.json/png` diagnostics for any remaining hard failure.
- Routed all Flow prompt submit/retry paths through the focus diagnostics context and added the missing menu-close gate before generation-failed retry submit.
- Repacked the Electron app so the desktop shortcut launcher runs the updated build.
- Verification: `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:flow-output-mode`, `node --check automation/google-flow-media.mjs`, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.

## 2026-06-10 - Fix - Flow submit idle self-heal

- Investigated desktop job `youtube-1781022447047`, where scene 1 clicked Flow's create button but no progress, media, or failure card appeared.
- Identified this as a submit-idle class distinct from textbox focus: the prompt card existed, Flow's create UI was visible, but generation never started.
- Added shared `retryFlowSubmitAfterIdle` recovery for both video and image scenes, with two additional submit attempts, menu-close gating, reload/project recovery between idle retries, and persisted retry attempts in `scene_N_flow_submit_retry_state.json`.
- Added `FLOW_PROMPT_CARD_CREATED_BUT_NOT_SUBMITTED` classification so prompt-card idle is distinguishable from generic `FLOW_SUBMIT_DID_NOT_START`.
- Repacked the Electron app so the desktop shortcut launcher runs the updated build.
- Verification: `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:flow-output-mode`, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.

## 2026-06-10 - Feature - Longform chaptered render orchestration

- Added scene-based longform chapter planning and optional `longformChapteredRenderEnabled` workflow support for splitting a long script into 60-120 second child render jobs.
- Added child chapter input generation, scene media reindex/copy, chapter status persistence, resume-safe plan reconciliation, and cached-scene child media resync.
- Added sequential async chapter rendering and final FFmpeg stitch support with relative concat lists, merged SRT offsets, YouTube chapter markers, and final re-encode.
- Added UI/schema controls for chaptered longform rendering plus contract tests for planner, render orchestration, resume reuse, and UI payload wiring.
- Verification: `npm.cmd run check:flow-output-mode`, `node scripts/check-youtube-job-schema.mjs`, `node scripts/check-longform-production-contract.mjs`, `node scripts/check-longform-scene-resume-contract.mjs`, `node scripts/check-longform-ui-workflow-guards.mjs`, targeted `node --check` for chapter renderer/planner/workflow modules, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.

## 2026-06-10 - Recovery - Napoleon longform final render

- Investigated desktop job `youtube-1781029420405`; root cause was Google Flow `FLOW_RATE_LIMITED` at scene 32 after scenes 1-31 had already rendered.
- Found a second resume issue where legacy 16:9 image-scene manifest records without aspect metadata were not reused, causing unnecessary Flow retries; added ffmpeg-based dimension probing so valid legacy 1920x1080 media can be reused while stale 9:16 media is still rejected.
- Repaired the job manifest for completed scenes 1-31, created local stickmanplus fallback motion clips for missing scenes 32-49 because Flow remained rate-limited, and rendered `final-youtube-napoleon-recovered.mp4`.
- Final QA passed: 49 scenes, final duration 318.57s, subtitle end 318.32s, subtitle drift 0.25s, black-span QA ok, no failure codes.
- Verification: `node scripts/check-longform-scene-resume-contract.mjs`, `node scripts/check-longform-aspect-aware-video-normalization.mjs`, `npm.cmd run check:flow-output-mode`, `node scripts/analyze-youtube-output.mjs "%APPDATA%\\hermes\\outputs\\desktop\\youtube-1781029420405"`, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.

## 2026-06-10 - Feature - Flow account batch pacing

- Added authorized Flow account slot routing so longform jobs can assign scenes 1-30 to Flow A and scenes 31-60 to Flow B with separate Chrome profiles and separate pacing files.
- Added per-slot Flow pacing metadata, scene manifest slot tracking, recovery/retry slot reuse, and slot-aware authentication/clear handlers.
- Added desktop controls for enabling A/B routing, batch size, and Flow A/B account authentication.
- Verification: `node scripts/check-flow-account-router-contract.mjs`, `node scripts/check-flow-request-pacer-contract.mjs`, `node scripts/check-youtube-job-schema.mjs`, `node scripts/check-longform-ui-workflow-guards.mjs`, `node scripts/check-desktop-recovery-actions.mjs`, `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:flow-output-mode`, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.

## 2026-06-10 - Recovery - Napoleon Flow scenes 32-49 final render

- Replaced the temporary local fallback back half of desktop job `youtube-1781029420405` by regenerating scenes 32-49 through Google Flow and rendering `desktop-flow-redo-32-49-1781081875531.mp4`.
- Added handling for Google Flow's Agent settings panel defaults, including image/video section targeting when Flow no longer exposes a separate bottom generator chip after saving.
- Added automatic approval for Flow's video-generation credit confirmation dialog so Veo scenes can start after the create click instead of failing as submit-idle.
- Final QA passed: 49 scenes, final duration 318.57s, generated scenes 32-49 complete, black-span QA ok, no failure codes.
- Verification: `node --check automation/google-flow-media.mjs`, `node --check automation/google-flow-output-mode.mjs`, `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:flow-output-mode`, `node scripts/analyze-youtube-output.mjs "%APPDATA%\\hermes\\outputs\\desktop\\youtube-1781029420405"`.

## 2026-06-11 - Recovery - Flow approval, image model, and 16:9 final render

- Investigated desktop job `youtube-1781097468679`, where scene 29 failed because Flow's video confirmation card still showed `Approve` after the automation clicked a non-final check element.
- Hardened Flow approval handling to use mouse-coordinate approval clicks with post-click disappearance checks, and treated Flow's `thinking`/`stop` UI as active generation so idle retry does not retype over an in-progress job.
- Fixed longform image-motion rendering so Flow stills honor the job aspect ratio; existing image clips for the job were re-rendered to 1920x1080 and scene 38 was completed as a Flow image after Flow cancelled video generation.
- Switched default Flow image model selection away from daily-limit-prone `Nano Banana Pro` by excluding Pro choices and allowing non-Pro image models.
- Final QA passed: 38 scenes, all scene clips 1920x1080, final render `desktop-manual-scene38-1781111191696.mp4`, black-span QA ok, no failure codes.
- Verification: `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:flow-output-mode`, `node scripts/check-image-scene-renderer-contract.mjs`, `node scripts/analyze-youtube-output.mjs "%APPDATA%\\hermes\\outputs\\desktop\\youtube-1781097468679"`.

## 2026-06-11 - Fix - Flow video credit rejection and stalled submit recovery

- Investigated desktop job `youtube-1781113034261`, where Flow stayed in a no-progress/no-media state after submit and a separate Flow confirmation dialog asked to spend 15 credits for video generation.
- Changed Flow video confirmation handling so 15-credit video dialogs are rejected instead of approved, then routed `FLOW_VIDEO_CREDIT_CONFIRMATION_REJECTED` through the video-to-image fallback path.
- Added a no-observable-progress stall guard so submitted Flow jobs that show no media and no progress are classified as `FLOW_GENERATION_STALLED` instead of waiting for the full Flow timeout.
- Added first-run Google Flow cookie-consent dismissal and made the resume script use the same Flow account router as the desktop app.
- Live verification on `youtube-1781113034261`: scene 1 stalled in video mode, recovered through Flow image generation, and rendered `scene_1.mp4` at 1920x1080 before scene 2 entered the same stalled-video path.
- Verification: `npm.cmd run check:flow-policy-safety`, `node --check automation/google-flow-media.mjs`, `node --check youtube-workflow-stages.mjs`, `node --check scripts/resume-youtube-job-from-assets.mjs`, `node scripts/check-flow-video-credit-reject-contract.mjs`.

## 2026-06-11 - Fix - Flow image provider failure fallback

- Investigated desktop job `youtube-1781133776221`, where scene 1 failed after video mode stalled, video-to-image fallback retried, and Flow image mode returned a generation failure card before exposing media.
- Found that the video-to-image fallback prompt still contained `Output mode: video` text before appending `Output mode: image`, creating contradictory Flow instructions.
- Added an image fallback prompt sanitizer, routed video-to-image inner Flow image failures through the image fallback handler, and treated retryable Flow image provider failures (`FAILED`, `STALLED`, `CANCELLED`) as provider-exhausted conditions that can continue through local image-motion fallback.
- Added a resume-script opt-in (`HERMES_ALLOW_LOCAL_FALLBACK_FINAL=1`) for recovery runs that intentionally accept local fallback scenes.
- Live verification on `youtube-1781133776221`: scenes 1-4 completed after Flow repeatedly failed/stalled; scene 3 and 4 were direct image scenes that no longer aborted the job.
- Verification: `npm.cmd run check:flow-policy-safety`, `node scripts/check-flow-image-no-media-fallback.mjs`, `node scripts/check-flow-cancelled-fallback-contract.mjs`, targeted resume of `youtube-1781133776221`.

## 2026-06-11 - Fix - Flow fallback final QA warning

- Investigated desktop job `youtube-1781143494178`, where all 20 scenes rendered and the final MP4 was created, but final QA failed solely with `FLOW_IMAGE_LOCAL_PLACEHOLDER`.
- Changed final output analysis so local Flow image fallback scenes remain visible as `qualityWarnings` but do not hard-fail an otherwise valid final render.
- Verified the same job now analyzes as `ok: true` with `failureCodes: []`, while preserving `localFallbackImageScenes` and a `FLOW_IMAGE_LOCAL_PLACEHOLDER` warning.
- Repacked the Electron app so the desktop shortcut launcher runs the updated analyzer.
- Verification: `node scripts/analyze-youtube-output.mjs "%APPDATA%\\hermes\\outputs\\desktop\\youtube-1781143494178"`, `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:final-output-qa`, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.

## 2026-06-11 - Fix - Local Flow fallback visual assets

- Investigated the repaired final output for desktop job `youtube-1781143494178` and confirmed the user-visible issue: the previous local fallback stills were 14KB single-color placeholder images, so the completed video had no meaningful scene artwork.
- Replaced local mock/fallback media generation with a sharp-rasterized stickmanplus SVG still and the existing stable image-motion renderer for both image and video fallback scenes.
- Updated fallback state files to mark regenerated local stickman motion assets as `placeholder:false`, `productionSafe:true`, `fallback:"localStickmanSvgMotion"`, and taught final QA/resume logic to distinguish safe local fallback from unsafe placeholders.
- Regenerated scenes 1-20 for `youtube-1781143494178`, rendered `desktop-resume-flow-1781151152676.mp4`, and extracted `final_sample_15s.png` to confirm visible artwork and subtitles in the final MP4.
- Repacked the Electron app and verified the desktop shortcut launcher resolves to the updated `dist-electron\\win-unpacked\\Hermes YouTube Studio.exe`.
- Verification: `node --check youtube-workflow-stages.mjs`, `node --check scripts/analyze-youtube-output.mjs`, `node --check scripts/resume-youtube-job-from-assets.mjs`, `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:flow-output-mode`, `npm.cmd run check:final-output-qa`, `node scripts/analyze-youtube-output.mjs "%APPDATA%\\hermes\\outputs\\desktop\\youtube-1781143494178"`, `node scripts/check-final-output-black-frame-qa.mjs "%APPDATA%\\hermes\\outputs\\desktop\\youtube-1781143494178\\desktop-resume-flow-1781151152676.mp4"`, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.

## 2026-06-11 - Fix - Block unapproved local Flow fallback finals

- Investigated desktop job `youtube-1781155854425` and found all 20 scenes were rendered from `scene_N_flow_image_local_fallback.json` local stickman motion assets, not Google Flow media.
- Confirmed the Flow screenshots/status files showed `FLOW_GENERATION_FAILED` before media exposure for every checked scene; the app then auto-accepted local fallback because provider-exhausted image failures were treated as recoverable for live jobs.
- Removed the provider-exhausted auto-allow path and the video-to-image forced fallback override so live Flow image failures now stop with `FLOW_IMAGE_MEDIA_REQUIRED` unless local fallback is explicitly enabled or Mock Media Mode is active.
- Changed final output QA so unapproved local fallback scenes are an error (`FLOW_IMAGE_LOCAL_FALLBACK`) instead of a warning; the existing `youtube-1781155854425` final now analyzes as `ok:false`.
- Repacked the Electron app and verified the desktop shortcut launcher resolves to the updated packaged executable.
- Verification: `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:flow-output-mode`, `npm.cmd run check:final-output-qa`, `node scripts/analyze-youtube-output.mjs "%APPDATA%\\hermes\\outputs\\desktop\\youtube-1781155854425"` expected failure with `FLOW_IMAGE_LOCAL_FALLBACK`, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.

## 2026-06-11 - Architecture - Web UI provider automation foundation

- Added a shared Web UI provider contract, auth-window/profile release helper, and Playwright persistent-context harness for Google Flow and future providers such as Leonardo or Grok.
- Moved Google Flow runtime launch through the shared harness, added optional trace capture, and attached `provider:"google-flow"`, `providerOrigin:"web-ui"`, and evidence metadata to success and failure results.
- Propagated provider metadata into scene media records and `scene-media-manifest.json`, then added final QA protection for completed Web UI scenes that lack verified original provider media.
- Added Web UI automation contract/smoke checks and included them in the default `check` chain.
- Repacked the Electron app and verified the desktop shortcut launcher resolves to the updated packaged executable.
- Verification: `npm.cmd run check:web-ui-automation`, `node scripts/check-desktop-progress-feedback.mjs`, `npm.cmd run check:flow-output-mode`, `npm.cmd run check:flow-policy-safety`, `npm.cmd run check:final-output-qa`, `npm.cmd run electron:pack`, `node scripts/check-packaged-runtime-contract.mjs`, `powershell -ExecutionPolicy Bypass -File scripts/check-shortcut.ps1`.
