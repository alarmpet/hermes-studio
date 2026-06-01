# Dirty Worktree Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 현재 더러운 작업 트리를 변경 손실 없이 기능 단위로 검증, 분류, 커밋하여 이후 Hermes Studio 작업을 안전하게 이어갈 수 있게 만든다.

**Architecture:** 먼저 전체 변경을 백업 패치로 보존한 뒤, 변경 파일을 기능 묶음으로 분류한다. 각 묶음은 해당 계약 테스트를 통과시킨 후 선택적 staging으로 커밋한다. 절대로 `git reset --hard`, `git checkout -- <file>`, 삭제성 정리 명령을 먼저 실행하지 않는다.

**Tech Stack:** Git, PowerShell, Node.js/NPM checks, Electron build, existing Hermes contract scripts.

---

## Current Branch and State

Current branch:

```powershell
git branch --show-current
```

Expected:

```text
feature/youtube-job-runner-integration
```

Current dirty groups:

### Group A: Post-render YouTube Upload Panel

These files belong together and should be committed as one feature after verification:

- `C:\Users\amd\hermes\electron\main.mjs`
- `C:\Users\amd\hermes\electron\preload.mjs`
- `C:\Users\amd\hermes\electron\renderer\app.js`
- `C:\Users\amd\hermes\electron\renderer\index.html`
- `C:\Users\amd\hermes\electron\renderer\styles.css`
- `C:\Users\amd\hermes\electron\services\youtube-upload-metadata.mjs`
- `C:\Users\amd\hermes\pipeline\youtube-upload.mjs`
- `C:\Users\amd\hermes\workflow-db-events.mjs`
- `C:\Users\amd\hermes\scripts\check-youtube-upload-db-events-contract.mjs`
- `C:\Users\amd\hermes\scripts\check-youtube-upload-jobid-contract.mjs`
- `C:\Users\amd\hermes\scripts\check-youtube-upload-metadata-contract.mjs`
- `C:\Users\amd\hermes\scripts\check-youtube-upload-panel-contract.mjs`
- `C:\Users\amd\hermes\scripts\check-youtube-upload-service-contract.mjs`

Shared files requiring hunk-level staging:

- `C:\Users\amd\hermes\package.json`
- `C:\Users\amd\hermes\timeline.md`

### Group B: Top Title Overlay / Auto Title / Balanced Layout

These files are a separate feature and should not be mixed with upload panel staging:

- `C:\Users\amd\hermes\electron\services\title-overlay-layout.mjs`
- `C:\Users\amd\hermes\electron\services\title-overlay-text-resolver.mjs`
- `C:\Users\amd\hermes\scripts\check-title-overlay-auto-text.mjs`
- `C:\Users\amd\hermes\scripts\check-title-overlay-balanced-lines.mjs`
- `C:\Users\amd\hermes\scripts\check-title-overlay-render-contract.mjs`
- `C:\Users\amd\hermes\scripts\render-youtube-with-tts.mjs`
- `C:\Users\amd\hermes\scripts\run-title-overlay-ui-workflow.mjs`
- `C:\Users\amd\hermes\youtube-job-schema.mjs`
- `C:\Users\amd\hermes\youtube-workflow.mjs`
- `C:\Users\amd\hermes\electron\renderer\app.js`

Shared files requiring hunk-level staging:

- `C:\Users\amd\hermes\package.json`
- `C:\Users\amd\hermes\timeline.md`
- `C:\Users\amd\hermes\docs\superpowers\plans\2026-05-31-video-top-title-overlay-plan.md`
- `C:\Users\amd\hermes\docs\superpowers\plans\2026-05-31-auto-title-overlay-text-plan.md`
- `C:\Users\amd\hermes\docs\superpowers\plans\2026-06-01-final-output-title-and-intro-loop-fix-plan.md`

### Group C: Scene Duration / Hybrid Intro Split / Render Policy

These changes relate to previous repeated `SCENE_DURATION_MISMATCH` and freeze-risk work:

- `C:\Users\amd\hermes\electron\services\script-planner.mjs`
- `C:\Users\amd\hermes\electron\services\youtube-draft-service.mjs`
- `C:\Users\amd\hermes\electron\services\youtube-job-service.mjs`
- `C:\Users\amd\hermes\scripts\check-hybrid-intro-video-narration-split.mjs`
- `C:\Users\amd\hermes\scripts\check-render-soft-ratio-policy.mjs`
- `C:\Users\amd\hermes\scripts\check-studio-v2-ux.mjs`
- `C:\Users\amd\hermes\scripts\check-youtube-job-schema.mjs`
- `C:\Users\amd\hermes\scripts\render-duration-policy.mjs`
- `C:\Users\amd\hermes\scripts\smoke-electron-youtube-mock-job.mjs`
- `C:\Users\amd\hermes\youtube-job-schema.mjs`
- `C:\Users\amd\hermes\youtube-workflow.mjs`
- `C:\Users\amd\hermes\bugfix.md`

Shared files requiring hunk-level staging:

- `C:\Users\amd\hermes\package.json`
- `C:\Users\amd\hermes\timeline.md`

### Group D: Review and Plan Documents

These files are documentation artifacts. Keep them if they help future implementation, or commit them as docs:

- `C:\Users\amd\hermes\HERMES_POST_RENDER_UPLOAD_PANEL_REVIEW.md`
- `C:\Users\amd\hermes\docs\superpowers\plans\2026-06-01-post-render-youtube-upload-panel-plan.md`
- `C:\Users\amd\hermes\docs\superpowers\plans\2026-06-01-dirty-worktree-cleanup-plan.md`

---

## Safety Rules

- Do not run `git reset --hard`.
- Do not run `git checkout -- <file>`.
- Do not delete untracked files until a backup patch exists and the user confirms they are disposable.
- Use `git add -p` for shared files such as `package.json`, `timeline.md`, `electron/renderer/app.js`, `youtube-job-schema.mjs`, and `youtube-workflow.mjs`.
- If a hunk mixes two feature groups and cannot be staged cleanly, leave it unstaged and split it manually with `apply_patch` only after reading the exact hunk.

---

## Task 1: Create a Safety Snapshot

**Files:**

- Create directory: `C:\Users\amd\hermes\.worktree-snapshots`
- Create patch: `C:\Users\amd\hermes\.worktree-snapshots\2026-06-01-dirty-worktree.patch`
- Create status file: `C:\Users\amd\hermes\.worktree-snapshots\2026-06-01-dirty-worktree-status.txt`

- [ ] **Step 1: Create snapshot folder**

Run:

```powershell
New-Item -ItemType Directory -Force -Path "C:\Users\amd\hermes\.worktree-snapshots"
```

Expected:

```text
Directory exists or is created.
```

- [ ] **Step 2: Save tracked diff**

Run:

```powershell
git diff --binary > "C:\Users\amd\hermes\.worktree-snapshots\2026-06-01-dirty-worktree.patch"
```

Expected:

```text
Command exits with code 0.
```

- [ ] **Step 3: Save untracked file list and status**

Run:

```powershell
git status --short > "C:\Users\amd\hermes\.worktree-snapshots\2026-06-01-dirty-worktree-status.txt"
git ls-files --others --exclude-standard >> "C:\Users\amd\hermes\.worktree-snapshots\2026-06-01-dirty-worktree-status.txt"
```

Expected:

```text
Command exits with code 0.
```

- [ ] **Step 4: Verify snapshot files exist**

Run:

```powershell
Test-Path "C:\Users\amd\hermes\.worktree-snapshots\2026-06-01-dirty-worktree.patch"
Test-Path "C:\Users\amd\hermes\.worktree-snapshots\2026-06-01-dirty-worktree-status.txt"
```

Expected:

```text
True
True
```

---

## Task 2: Verify the Worktree Before Staging

**Files:**

- Read-only verification across current repo.

- [ ] **Step 1: Check syntax and contracts**

Run:

```powershell
npm.cmd run check
```

Expected:

```text
Exit code 0.
```

- [ ] **Step 2: Check package build**

Run:

```powershell
npm.cmd run electron:pack
```

Expected:

```text
Exit code 0.
dist-electron\Hermes YouTube Studio Setup 1.0.0.exe exists.
```

If `electron:pack` fails with `Access is denied` inside `dist-electron\win-unpacked`, inspect running app processes:

```powershell
Get-Process | Where-Object { $_.ProcessName -like '*Hermes*' -or $_.ProcessName -like '*electron*' } | Select-Object Id,ProcessName,Path
```

If only Hermes Studio processes from `C:\Users\amd\hermes\dist-electron\win-unpacked\Hermes YouTube Studio.exe` are listed, close the app normally first. Use `Stop-Process` only when the app cannot be closed manually.

---

## Task 3: Commit Group A - YouTube Upload Panel

**Files to stage:**

- `electron/main.mjs`
- `electron/preload.mjs`
- `electron/renderer/index.html`
- `electron/renderer/styles.css`
- `electron/services/youtube-upload-metadata.mjs`
- `pipeline/youtube-upload.mjs`
- `workflow-db-events.mjs`
- `scripts/check-youtube-upload-db-events-contract.mjs`
- `scripts/check-youtube-upload-jobid-contract.mjs`
- `scripts/check-youtube-upload-metadata-contract.mjs`
- `scripts/check-youtube-upload-panel-contract.mjs`
- `scripts/check-youtube-upload-service-contract.mjs`

Shared hunk files:

- `electron/renderer/app.js`
- `package.json`
- `timeline.md`

- [ ] **Step 1: Stage upload-only files**

Run:

```powershell
git add electron/main.mjs electron/preload.mjs electron/renderer/index.html electron/renderer/styles.css electron/services/youtube-upload-metadata.mjs pipeline/youtube-upload.mjs workflow-db-events.mjs scripts/check-youtube-upload-db-events-contract.mjs scripts/check-youtube-upload-jobid-contract.mjs scripts/check-youtube-upload-metadata-contract.mjs scripts/check-youtube-upload-panel-contract.mjs scripts/check-youtube-upload-service-contract.mjs
```

Expected:

```text
Command exits with code 0.
```

- [ ] **Step 2: Stage upload hunks from shared files**

Run:

```powershell
git add -p electron/renderer/app.js
git add -p package.json
git add -p timeline.md
```

Stage only hunks containing:

- `youtubeUploadPanel`
- `youtubeGetUploadDraft`
- `youtubeSaveUploadDraft`
- `youtubeUploadJob`
- `uploadSelectedJob`
- `uploadStatusMessage`
- `check:youtube-upload`
- `Post-render YouTube upload panel`

Do not stage title overlay hunks such as:

- `titleOverlayMode`
- `Auto: generated title`
- `check-title-overlay-auto-text`
- `check-title-overlay-balanced-lines`

- [ ] **Step 3: Verify staged diff**

Run:

```powershell
git diff --cached --name-only
git diff --cached --stat
```

Expected staged files include upload panel files and exclude title overlay-only files.

- [ ] **Step 4: Run upload checks**

Run:

```powershell
npm.cmd run check:youtube-upload
node scripts/check-local-studio-product.mjs
```

Expected:

```text
Both commands exit with code 0.
```

- [ ] **Step 5: Commit upload panel**

Run:

```powershell
git commit -m "feat: add post-render YouTube upload panel"
```

Expected:

```text
Commit created.
```

---

## Task 4: Commit Group B - Title Overlay Cleanup

**Files to stage:**

- `electron/services/title-overlay-layout.mjs`
- `electron/services/title-overlay-text-resolver.mjs`
- `scripts/check-title-overlay-auto-text.mjs`
- `scripts/check-title-overlay-balanced-lines.mjs`
- `scripts/check-title-overlay-render-contract.mjs`
- `scripts/render-youtube-with-tts.mjs`
- `scripts/run-title-overlay-ui-workflow.mjs`

Shared hunk files:

- `electron/renderer/app.js`
- `package.json`
- `timeline.md`
- `youtube-job-schema.mjs`
- `youtube-workflow.mjs`
- `docs/superpowers/plans/2026-05-31-video-top-title-overlay-plan.md`
- `docs/superpowers/plans/2026-05-31-auto-title-overlay-text-plan.md`
- `docs/superpowers/plans/2026-06-01-final-output-title-and-intro-loop-fix-plan.md`

- [ ] **Step 1: Stage title overlay files**

Run:

```powershell
git add electron/services/title-overlay-layout.mjs electron/services/title-overlay-text-resolver.mjs scripts/check-title-overlay-auto-text.mjs scripts/check-title-overlay-balanced-lines.mjs scripts/check-title-overlay-render-contract.mjs scripts/render-youtube-with-tts.mjs scripts/run-title-overlay-ui-workflow.mjs docs/superpowers/plans/2026-05-31-auto-title-overlay-text-plan.md docs/superpowers/plans/2026-06-01-final-output-title-and-intro-loop-fix-plan.md
```

Expected:

```text
Command exits with code 0.
```

- [ ] **Step 2: Stage title overlay hunks from shared files**

Run:

```powershell
git add -p electron/renderer/app.js
git add -p package.json
git add -p timeline.md
git add -p youtube-job-schema.mjs
git add -p youtube-workflow.mjs
git add -p docs/superpowers/plans/2026-05-31-video-top-title-overlay-plan.md
```

Stage only hunks containing:

- `titleOverlayMode`
- `resolveTitleOverlayText`
- `wrapBalancedTitle`
- `title-overlay-layout`
- `title-overlay-text-resolver`
- `check-title-overlay-auto-text`
- `check-title-overlay-balanced-lines`
- title overlay plan updates

Do not stage upload panel hunks if any remain.

- [ ] **Step 3: Run title overlay checks**

Run:

```powershell
node scripts/check-title-overlay-render-contract.mjs
node scripts/check-title-overlay-auto-text.mjs
node scripts/check-title-overlay-balanced-lines.mjs
npm.cmd run check:final-output-qa
```

Expected:

```text
All commands exit with code 0.
```

- [ ] **Step 4: Commit title overlay work**

Run:

```powershell
git commit -m "feat: improve top title overlay layout"
```

Expected:

```text
Commit created.
```

---

## Task 5: Commit Group C - Duration and Hybrid Scene Guards

**Files to stage:**

- `bugfix.md`
- `electron/services/script-planner.mjs`
- `electron/services/youtube-draft-service.mjs`
- `electron/services/youtube-job-service.mjs`
- `scripts/check-hybrid-intro-video-narration-split.mjs`
- `scripts/check-render-soft-ratio-policy.mjs`
- `scripts/check-studio-v2-ux.mjs`
- `scripts/check-youtube-job-schema.mjs`
- `scripts/render-duration-policy.mjs`
- `scripts/smoke-electron-youtube-mock-job.mjs`

Shared hunk files:

- `package.json`
- `timeline.md`
- `youtube-job-schema.mjs`
- `youtube-workflow.mjs`

- [ ] **Step 1: Stage duration guard files**

Run:

```powershell
git add bugfix.md electron/services/script-planner.mjs electron/services/youtube-draft-service.mjs electron/services/youtube-job-service.mjs scripts/check-hybrid-intro-video-narration-split.mjs scripts/check-render-soft-ratio-policy.mjs scripts/check-studio-v2-ux.mjs scripts/check-youtube-job-schema.mjs scripts/render-duration-policy.mjs scripts/smoke-electron-youtube-mock-job.mjs
```

Expected:

```text
Command exits with code 0.
```

- [ ] **Step 2: Stage duration hunks from shared files**

Run:

```powershell
git add -p package.json
git add -p timeline.md
git add -p youtube-job-schema.mjs
git add -p youtube-workflow.mjs
```

Stage only hunks containing:

- `hybridIntroVideoSceneCount`
- `SCENE_DURATION_MISMATCH`
- `MAX_VIDEO_NARRATION_CHARS`
- `MAX_IMAGE_NARRATION_CHARS`
- `splitLongNarrationScenes`
- `loop-extension`
- `render-duration-policy`
- `check-hybrid-intro-video-narration-split`

- [ ] **Step 3: Run duration and render checks**

Run:

```powershell
node scripts/check-hybrid-intro-video-narration-split.mjs
node scripts/check-render-soft-ratio-policy.mjs
node scripts/check-youtube-job-schema.mjs
npm.cmd run smoke:youtube-hybrid-mock
```

Expected:

```text
All commands exit with code 0.
```

- [ ] **Step 4: Commit duration guard work**

Run:

```powershell
git commit -m "fix: split long intro scenes before Flow video render"
```

Expected:

```text
Commit created.
```

---

## Task 6: Commit Documentation Artifacts

**Files to stage:**

- `HERMES_POST_RENDER_UPLOAD_PANEL_REVIEW.md`
- `docs/superpowers/plans/2026-06-01-post-render-youtube-upload-panel-plan.md`
- `docs/superpowers/plans/2026-06-01-dirty-worktree-cleanup-plan.md`

- [ ] **Step 1: Stage docs**

Run:

```powershell
git add HERMES_POST_RENDER_UPLOAD_PANEL_REVIEW.md docs/superpowers/plans/2026-06-01-post-render-youtube-upload-panel-plan.md docs/superpowers/plans/2026-06-01-dirty-worktree-cleanup-plan.md
```

Expected:

```text
Command exits with code 0.
```

- [ ] **Step 2: Commit docs**

Run:

```powershell
git commit -m "docs: document upload panel and cleanup plans"
```

Expected:

```text
Commit created.
```

---

## Task 7: Final Verification

- [ ] **Step 1: Confirm clean or intentionally documented worktree**

Run:

```powershell
git status --short
```

Expected:

```text
No output.
```

If output remains, classify every remaining file into one of:

- intentionally uncommitted user work
- generated local output
- accidental leftover

Do not delete anything without user confirmation.

- [ ] **Step 2: Run full checks one more time**

Run:

```powershell
npm.cmd run check
```

Expected:

```text
Exit code 0.
```

- [ ] **Step 3: Package one final time**

Run:

```powershell
npm.cmd run electron:pack
```

Expected:

```text
Exit code 0.
```

- [ ] **Step 4: Show commit summary**

Run:

```powershell
git log --oneline -4
```

Expected commit shape:

```text
<hash> docs: document upload panel and cleanup plans
<hash> fix: split long intro scenes before Flow video render
<hash> feat: improve top title overlay layout
<hash> feat: add post-render YouTube upload panel
```

---

## Risk Notes

- `package.json`, `timeline.md`, `electron/renderer/app.js`, `youtube-job-schema.mjs`, and `youtube-workflow.mjs` contain mixed work. Use hunk staging carefully.
- `dist-electron` build artifacts are currently not shown in `git status --short`, so no cleanup action is needed for them unless they appear later.
- The LF/CRLF warnings are Git line-ending notices. Do not “fix” line endings as a separate refactor during this cleanup.
- If `git add -p` becomes confusing, stop and ask before staging a mixed hunk.
