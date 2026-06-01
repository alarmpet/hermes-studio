#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");

assert.match(main, /youtube:getUploadDraft/, "main should expose job-scoped upload draft read IPC");
assert.match(main, /youtube:saveUploadDraft/, "main should expose job-scoped upload draft save IPC");
assert.match(main, /youtube:uploadJob/, "main should expose job-scoped upload IPC");
assert.match(main, /job-id-required/, "legacy upload path should reject missing jobId");
assert.match(main, /readJob\(paths\.jobsDir,\s*jobId\)/, "upload path should resolve selected job by jobId");
assert.doesNotMatch(main, /ipcMain\.handle\("youtube:approveUpload",\s*async\s*\(\)\s*=>\s*{[\s\S]*?uploadVideoToYouTube\(\{[\s\S]*?latestCompletedJob/, "legacy upload handler must not upload latestCompletedJob");
assert.match(renderer, /youtubeApproveUpload\(selectedJobId\)/, "legacy approval button should pass selectedJobId");

console.log(JSON.stringify({ ok: true, checked: "youtube-upload-jobid-contract" }));
