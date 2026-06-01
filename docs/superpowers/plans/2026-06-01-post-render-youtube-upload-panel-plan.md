# Post-Render YouTube Upload Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Keep the checkbox status updated as each step is completed.

**Goal:** 영상 생성이 완료된 뒤 Hermes Studio 오른쪽 Progress 영역 하단에 YouTube 업로드 패널을 표시하고, 사용자가 제목, 설명, 태그, 썸네일, 공개 범위, AI 합성 콘텐츠 표시를 확인/수정한 뒤 `Upload to YouTube` 버튼으로 실제 업로드까지 끝낼 수 있게 만든다.

**Architecture:** Renderer upload panel -> preload IPC bridge -> main process job-scoped upload controller -> per-job upload metadata/state files -> `pipeline/youtube-upload.mjs` real YouTube Data API uploader -> progress/job-store updates.

**Tech Stack:** Electron, vanilla HTML/CSS/JS renderer, Node.js ESM, `googleapis`, YouTube Data API `videos.insert`, YouTube Data API `thumbnails.set`, existing Hermes job store and OAuth token files.

**External References Checked:**
- YouTube Data API `videos.insert` supports upload plus `snippet.title`, `snippet.description`, `snippet.tags[]`, `snippet.categoryId`, `status.privacyStatus`, `status.selfDeclaredMadeForKids`, and `status.containsSyntheticMedia`: https://developers.google.com/youtube/v3/docs/videos/insert
- YouTube Data API `thumbnails.set` binds a custom thumbnail to an uploaded `videoId`: https://developers.google.com/youtube/v3/docs/thumbnails/set
- YouTube resumable upload protocol is available for robust large media upload: https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol

---

## Reviewer Notes Incorporated

GPT-5.3-Codex-Spark read-only review found these risks, and this plan treats them as required fixes:

- Current `pipeline/youtube-upload.mjs` does not actually upload. It returns `upload-not-executed`, so the implementation must replace the guarded stub with a real uploader.
- Current `youtube:approveUpload` depends on a global `latestCompletedJob`, which can upload the wrong video when multiple jobs exist. The new upload path must require `jobId`.
- The UI has no post-render metadata editor. The new panel must expose title, description, tags, thumbnail, privacy, made-for-kids, and synthetic media fields.
- Metadata is currently derived from defaults at upload time, not persisted as a user-editable draft. Upload metadata must be saved per job.
- Thumbnail retry/regenerate/custom replacement must be visible before upload.
- Upload state needs idempotency, double-click protection, persisted result, and duplicate-upload prevention.
- Token/cookie/path data must not leak into renderer logs or console output.

## Review Document Findings Applied

`C:\Users\amd\hermes\HERMES_POST_RENDER_UPLOAD_PANEL_REVIEW.md` was checked against the current codebase. The following findings are accepted and incorporated:

- `pipeline/youtube-upload.mjs` currently receives `tokenPath` only. Real upload should also receive `clientSecretsPath`, because the OAuth2 client needs the Google client ID/secret to refresh credentials safely.
- `pipeline/youtube-auth.mjs` already exports `saveYouTubeToken`, so the uploader should register an OAuth `tokens` event handler and persist refreshed token fields back to `youtube_token.json`.
- File hashing for duplicate-upload protection must use `fs.createReadStream` with `crypto.createHash("sha256")`, not whole-file synchronous reads, because longform videos can be hundreds of MB or larger.
- YouTube custom thumbnails must be validated before upload. Official `thumbnails.set` documentation limits uploads to 2MB and accepts JPEG/PNG media types.
- `workflow-db-events.mjs` already mirrors workflow events into SQLite through `bot_db_helper.py`, so upload started/completed/failed should flow through this existing mirror rather than adding a second DB writer.
- Existing product checks still assert `approveUploadBtn` and `youtubeApproveUpload`, so the old element/API should remain as compatibility shims while the new upload panel becomes the real UX.

The following review suggestion is rejected for this plan:

- Do not let a compatibility wrapper upload through `latestCompletedJob`. That is the exact stale-target risk this feature is fixing. The compatibility API may open/focus the upload panel for the selected job, or return `job-id-required`, but it must not upload a global latest job.

---

## Current State

- `electron/renderer/index.html` has a Progress card and an older `Approve Upload` button in the form area, but there is no right-bottom upload review panel.
- `electron/renderer/app.js` has `updateArtifactPanel(details)` for final video and thumbnail links, but it does not render editable YouTube metadata.
- `electron/preload.mjs` exposes `youtubeApproveUpload: () => ipcRenderer.invoke("youtube:approveUpload")`, with no `jobId` or metadata payload.
- `electron/main.mjs` handles `youtube:approveUpload` using `latestCompletedJob`, then builds metadata from defaults such as `assets?.draft?.title` and `assets?.draft?.script`.
- `pipeline/youtube-upload.mjs` sanitizes metadata but does not call `youtube.videos.insert` or `youtube.thumbnails.set`.
- `electron/services/job-progress-events.mjs` already contains upload-related phase concepts, so the new feature should reuse that progress language instead of inventing a separate console-only state.

---

## Target UX

After a job reaches final render completion, the right column should show this order:

1. `Progress` card, unchanged.
2. `YouTube Upload` card at the bottom of the same right-side area.
3. Authentication card and console remain available, but the upload card is the main next action after completion.

The upload card appears when:

- `selectedJobId` exists.
- The selected job has `finalVideo` or `finalPath`.
- The job status is completed, action-required with a completed video, or upload failed with retry allowed.

The upload card contains:

- Final video path and `Open Video` button.
- Thumbnail preview, `Open Thumbnail`, `Retry ChatGPT Thumbnail`, and `Choose Custom Thumbnail` actions.
- `Title` input with 100-character counter and warning before overflow.
- `Description` textarea with 5,000-character counter.
- `Tags` comma-separated input with normalized preview chips.
- `Privacy` select: `private`, `unlisted`, `public`.
- `Category` select, defaulting to the current channel/content default, with `News & Politics` (`25`) as a good default for URL/news jobs.
- `Made for Kids` checkbox, default `false`.
- `Contains AI/Synthetic Media` checkbox, default `true`, because Hermes generates AI visuals/voice.
- `Notify Subscribers` checkbox, default `false` for batch-style automation.
- `Save Metadata` button.
- `Upload to YouTube` button.
- Uploaded result area with video ID, YouTube Studio/open URL, and upload timestamp.

Button behavior:

- `Upload to YouTube` is disabled while uploading.
- If the job already has an uploaded `videoId`, the default button becomes disabled and shows `Already Uploaded`.
- A separate `Upload Again as New Video` action can be added later, but it must be explicit and not part of the first implementation.

---

## Data Contract

Create a per-job metadata draft file:

`<jobDir>/youtube-upload-metadata.json`

Schema:

```json
{
  "version": "youtube-upload-v1",
  "jobId": "youtube-...",
  "videoPath": "C:/...",
  "thumbnailPath": "C:/...",
  "title": "string",
  "description": "string",
  "tags": ["string"],
  "privacyStatus": "private",
  "categoryId": "25",
  "madeForKids": false,
  "containsSyntheticMedia": true,
  "notifySubscribers": false,
  "thumbnailOptimizedPath": "C:/...",
  "updatedAt": "2026-06-01T00:00:00.000Z"
}
```

Create a per-job upload state file:

`<jobDir>/youtube-upload-state.json`

Schema:

```json
{
  "version": "youtube-upload-state-v1",
  "jobId": "youtube-...",
  "status": "draft|uploading|uploaded|failed",
  "videoPath": "C:/...",
  "videoHash": "sha256...",
  "videoId": "youtubeVideoId",
  "youtubeUrl": "https://www.youtube.com/watch?v=...",
  "thumbnailBound": true,
  "lastError": "",
  "startedAt": "2026-06-01T00:00:00.000Z",
  "completedAt": "2026-06-01T00:00:00.000Z"
}
```

Validation rules:

- `jobId` is required for every upload IPC call.
- `videoPath` must exist and must point to a file.
- `thumbnailPath` is optional, but if present it must exist and be an image file.
- Custom thumbnail uploads must be JPEG or PNG and must not exceed 2MB before calling `thumbnails.set`.
- `title` is trimmed, required, and capped at 100 characters.
- `description` is capped at 5,000 characters.
- `tags` are trimmed, deduplicated, `#` stripped, empty tags removed, and capped at 30 tags.
- `privacyStatus` must be one of `private`, `unlisted`, `public`.
- `containsSyntheticMedia` must always be present in the final request body.
- Upload is blocked if `youtube-upload-state.json` already has `status: "uploaded"` for the same `videoHash`.

---

## Implementation Tasks

### 1. Add Upload Metadata Service

- [ ] Add `electron/services/youtube-upload-metadata.mjs`.
- [ ] Implement `buildDefaultUploadMetadata(jobRecord, draftAssets)`:
  - Use generated title when available.
  - Use generated script/summary as draft description.
  - Use source keyword/URL, title keywords, and topic words as default tags.
  - Use generated thumbnail path when available.
  - Default `privacyStatus` from job settings, falling back to `private`.
  - Default `containsSyntheticMedia: true`.
- [ ] Implement `sanitizeUploadMetadata(input)`.
- [ ] Implement `validateUploadMetadata(input)`.
- [ ] Implement `readUploadMetadata(jobDir)` and `writeUploadMetadata(jobDir, metadata)`.
- [ ] Implement `readUploadState(jobDir)` and `writeUploadState(jobDir, state)`.
- [ ] Add `computeFileHash(filePath)` using `createReadStream()` and `createHash("sha256")` so duplicate-upload checks do not block the Electron main event loop.
- [ ] Add `validateThumbnailForYouTube(thumbnailPath)`:
  - Accept `.jpg`, `.jpeg`, and `.png`.
  - Verify file size is less than or equal to 2MB.
  - Return a structured validation error before any API call when the file is too large or unreadable.

### 2. Replace Global Upload Target With Job-Scoped IPC

- [ ] Update `electron/preload.mjs`:
  - Add `youtubeGetUploadDraft(jobId)`.
  - Add `youtubeSaveUploadDraft(jobId, draft)`.
  - Add `youtubeUploadJob(jobId, draft)`.
  - Keep `youtubeApproveUpload` as a compatibility wrapper because `scripts/check-local-studio-product.mjs` still asserts it exists. It must return `job-id-required` unless the renderer supplies the currently selected job ID.
- [ ] Update `electron/main.mjs`:
  - Add `ipcMain.handle("youtube:getUploadDraft", ...)`.
  - Add `ipcMain.handle("youtube:saveUploadDraft", ...)`.
  - Add `ipcMain.handle("youtube:uploadJob", ...)`.
  - Add a compatibility handler for `youtube:approveUpload` that never reads `latestCompletedJob` for upload. It should require an explicit `jobId` or return `{ ok: false, status: "job-id-required" }`.
  - Resolve the job by `jobId` from the job store.
  - Reject missing, stale, or incomplete jobs with a structured error.
  - Remove `latestCompletedJob` from the upload decision path.

### 3. Build the Right-Bottom Upload Panel

- [ ] Update `electron/renderer/index.html` with a `YouTube Upload` card in the right column below the Progress card.
- [ ] Add stable element IDs:
  - `youtubeUploadPanel`
  - `uploadVideoPath`
  - `uploadThumbnailPreview`
  - `uploadTitleInput`
  - `uploadDescriptionInput`
  - `uploadTagsInput`
  - `uploadPrivacySelect`
  - `uploadCategorySelect`
  - `uploadMadeForKidsCheckbox`
  - `uploadSyntheticMediaCheckbox`
  - `uploadNotifySubscribersCheckbox`
  - `uploadSaveMetadataBtn`
  - `uploadToYouTubeBtn`
  - `uploadStatusMessage`
  - `uploadResultLink`
- [ ] Update `electron/renderer/app.js`:
  - Track `selectedJobId` as the only upload target.
  - On job completion, call `youtubeGetUploadDraft(selectedJobId)` and hydrate the upload panel.
  - On job selection in the Jobs list, reload the panel for that selected job.
  - Save edits through `youtubeSaveUploadDraft(selectedJobId, draft)`.
  - Upload through `youtubeUploadJob(selectedJobId, draft)`.
  - Disable upload while an upload is in progress.
  - Render validation errors beside the relevant field.

### 4. Implement Real YouTube Upload

- [ ] Update `pipeline/youtube-upload.mjs`.
- [ ] Replace `upload-not-executed` stub behavior with actual `google.youtube("v3")` upload.
- [ ] Reuse `pipeline/youtube-auth.mjs` token loading and refresh behavior.
- [ ] Change `uploadVideoToYouTube` signature to accept `clientSecretsPath`:
  - `uploadVideoToYouTube({ videoPath, thumbnailPath, metadata, tokenPath, clientSecretsPath, onProgress })`
- [ ] Create an authenticated OAuth client from `client_secrets.json` and `youtube_token.json`.
- [ ] Register `oauth2Client.on("tokens", ...)` and call `saveYouTubeToken(tokenPath, mergedTokens)` so refreshed access tokens are persisted.
- [ ] Refresh expired credentials before uploading and persist refreshed token data.
- [ ] Use resumable media upload behavior where supported by `googleapis`; retry transient 500/502/503/504 and network interruptions with bounded exponential backoff.
- [ ] Call `youtube.videos.insert` with:
  - `part: ["snippet", "status"]`
  - `snippet.title`
  - `snippet.description`
  - `snippet.tags`
  - `snippet.categoryId`
  - `status.privacyStatus`
  - `status.selfDeclaredMadeForKids`
  - `status.containsSyntheticMedia`
  - media body from the final video file.
- [ ] After successful upload, call `youtube.thumbnails.set` when a valid thumbnail exists.
- [ ] Return `{ ok: true, videoId, youtubeUrl, thumbnailBound }`.
- [ ] Return structured failures for:
  - missing OAuth token
  - expired/invalid refresh token
  - missing video file
  - invalid thumbnail
  - quota/API rejection
  - network interruption
- [ ] Persist upload state before upload, after video upload, after thumbnail binding, and after failure.

### 5. DB Mirroring, Upload Progress, and Console Hygiene

- [ ] Reuse existing progress phases in `electron/services/job-progress-events.mjs`.
- [ ] Emit status messages:
  - `YouTube upload metadata validated`
  - `Uploading video to YouTube`
  - `Binding thumbnail`
  - `YouTube upload complete`
  - `YouTube upload failed`
- [ ] Send upload events through `mirrorWorkflowEventToDb` in `workflow-db-events.mjs`:
  - `youtube-upload-started` should be logged as a normal event.
  - `youtube-upload-completed` should be logged as a normal event with `videoId` and `thumbnailBound`.
  - `youtube-upload-failed` should be logged as a failed event with `failureCode`.
- [ ] Extend `workflow-db-events.mjs` failure-code parsing for:
  - `YOUTUBE_OAUTH_EXPIRED`
  - `YOUTUBE_TOKEN_MISSING`
  - `YOUTUBE_QUOTA_EXCEEDED`
  - `YOUTUBE_NETWORK_INTERRUPTED`
  - `YOUTUBE_THUMBNAIL_INVALID`
  - `YOUTUBE_THUMBNAIL_TOO_LARGE`
  - `YOUTUBE_DUPLICATE_UPLOAD_BLOCKED`
- [ ] Add renderer upload status updates without hiding the final render completion state.
- [ ] Mask sensitive data before logs reach the renderer:
  - OAuth access tokens
  - OAuth refresh tokens
  - cookies
  - authorization headers
  - full token JSON payloads
- [ ] Keep local file paths visible only where the user needs them, such as final video and thumbnail paths.

### 6. Thumbnail Review and Replacement

- [ ] The upload panel must show the generated thumbnail when available.
- [ ] `Retry ChatGPT Thumbnail` should call the existing thumbnail retry path and then refresh the upload draft.
- [ ] `Choose Custom Thumbnail` should open a local file picker and save the selected path to `youtube-upload-metadata.json`.
- [ ] Validate thumbnail file size, extension, and readability before upload.
- [ ] If the selected thumbnail is larger than 2MB, offer `Optimize Thumbnail` using existing `sharp` dependency:
  - Resize to fit within 1280x720 without upscaling.
  - Save JPEG or PNG to `<jobDir>/youtube-thumbnail-optimized.jpg`.
  - Re-check the optimized file size before enabling upload.
- [ ] If thumbnail upload fails after video upload succeeds, mark `thumbnailBound: false`, keep the video ID, and show a retry-thumbnail-only action.

### 7. Idempotency and Failure Recovery

- [ ] Compute `videoHash` before upload.
- [ ] If the same job and same `videoHash` were uploaded already, block duplicate upload and show the existing YouTube URL.
- [ ] If upload fails before a `videoId` exists, allow normal retry.
- [ ] If video upload succeeds but thumbnail binding fails, retry only the thumbnail binding.
- [ ] If the app restarts during upload, show `uploading` state as `interrupted` and require user confirmation before retry.
- [ ] Never infer the target video from the most recent job. Always use explicit `jobId`.

### 8. Tests and Checks

- [ ] Add `scripts/check-youtube-upload-metadata-contract.mjs`.
  - Verify title cap, description cap, tag cleanup, privacy enum, synthetic media default, and missing title validation.
  - Verify stream-based hashing uses `createReadStream`.
  - Verify thumbnail validation blocks files larger than 2MB.
- [ ] Add `scripts/check-youtube-upload-panel-contract.mjs`.
  - Verify required upload panel IDs exist in `index.html`.
  - Verify renderer calls `youtubeGetUploadDraft`, `youtubeSaveUploadDraft`, and `youtubeUploadJob`.
  - Verify upload button uses `selectedJobId`.
- [ ] Add `scripts/check-youtube-upload-jobid-contract.mjs`.
  - Verify `main.mjs` upload handler requires `jobId`.
  - Verify upload path does not use `latestCompletedJob`.
  - Verify the legacy `youtubeApproveUpload` path cannot upload without an explicit `jobId`.
- [ ] Add `scripts/check-youtube-upload-service-contract.mjs`.
  - Verify `pipeline/youtube-upload.mjs` references `videos.insert`, `thumbnails.set`, `containsSyntheticMedia`, `clientSecretsPath`, `saveYouTubeToken`, and token refresh handling.
- [ ] Add `scripts/check-youtube-upload-db-events-contract.mjs`.
  - Verify `workflow-db-events.mjs` recognizes `youtube-upload-failed`.
  - Verify YouTube upload failure codes are prefixed into `task_failures.error_msg`.
- [ ] Add a mock upload test that simulates successful upload without calling the real YouTube API.
- [ ] Add a mock failure test for invalid token and network failure.
- [ ] Update `package.json` `check` script so the upload contracts run with the existing product checks.

Expected verification commands:

```powershell
npm.cmd run check
npm.cmd run smoke:youtube-hybrid-mock
npm.cmd run electron:pack
```

Manual verification:

1. Launch the latest desktop shortcut.
2. Generate a short test video or select a completed job.
3. Confirm the right-bottom `YouTube Upload` panel appears.
4. Edit title, description, tags, privacy, synthetic media flag, and thumbnail.
5. Save metadata and reopen the selected job.
6. Confirm edits persist.
7. Click `Upload to YouTube`.
8. Confirm upload progress appears in the panel and console.
9. Confirm uploaded URL appears.
10. Click the same upload button again and confirm duplicate upload is blocked.

---

## Acceptance Criteria

- A completed video job displays a YouTube upload panel in the right-bottom area shown in the user screenshot.
- The panel lets the user review and edit title, description, tags, thumbnail, privacy, category, made-for-kids, and AI/synthetic media fields.
- Upload uses the selected `jobId`, never a global latest job.
- The legacy `approveUploadBtn` and `youtubeApproveUpload` remain present for compatibility, but they cannot upload without an explicit selected `jobId`.
- Upload metadata is persisted per job and survives app restart.
- `pipeline/youtube-upload.mjs` performs a real YouTube Data API upload instead of returning `upload-not-executed`.
- OAuth token refreshes are persisted back to disk through `saveYouTubeToken`.
- Duplicate-upload hashing is stream-based and does not block the app on large videos.
- The uploaded video receives the selected thumbnail when thumbnail binding succeeds.
- Custom thumbnails are blocked or optimized before upload if they exceed YouTube's 2MB custom thumbnail limit.
- Duplicate upload is blocked for the same job/video hash.
- YouTube upload failures are mirrored into SQLite through `workflow-db-events.mjs` with searchable failure codes.
- Token errors, quota errors, network errors, and thumbnail binding errors are shown as actionable messages.
- OAuth secrets and token values are not printed in renderer console output.
- `npm.cmd run check`, `npm.cmd run smoke:youtube-hybrid-mock`, and `npm.cmd run electron:pack` pass before calling the implementation complete.

---

## Rollout Order

1. Add tests for metadata, panel contract, jobId-only upload targeting, and upload service contract.
2. Add metadata/state service.
3. Add renderer upload panel UI.
4. Add preload/main IPC.
5. Replace upload stub with real YouTube uploader.
6. Add OAuth token refresh persistence.
7. Add stream-based idempotency hashing and duplicate upload protection.
8. Wire thumbnail replacement, validation, and optional `sharp` optimization.
9. Add SQLite event/failure mirroring for YouTube upload phases.
10. Run full checks and package.
11. Test one real upload with `privacyStatus: private`.

---

## Timeline Entry To Add During Implementation

When implementation begins, append to `C:\Users\amd\hermes\timeline.md`:

```markdown
## 2026-06-01 - Post-render YouTube upload panel

- Added a job-scoped YouTube upload review panel after final render completion.
- Added editable upload metadata for title, description, tags, privacy, thumbnail, made-for-kids, and synthetic media.
- Replaced guarded upload stub with job-scoped YouTube Data API upload and thumbnail binding.
- Added per-job upload state, duplicate upload protection, and upload recovery paths.
```
