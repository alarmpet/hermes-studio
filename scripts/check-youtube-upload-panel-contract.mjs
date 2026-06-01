#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const preload = readFileSync(resolve(root, "electron/preload.mjs"), "utf8");

for (const id of [
  "youtubeUploadPanel",
  "uploadVideoPath",
  "uploadThumbnailPreview",
  "uploadTitleInput",
  "uploadDescriptionInput",
  "uploadTagsInput",
  "uploadPrivacySelect",
  "uploadCategorySelect",
  "uploadMadeForKidsCheckbox",
  "uploadSyntheticMediaCheckbox",
  "uploadNotifySubscribersCheckbox",
  "uploadSaveMetadataBtn",
  "uploadToYouTubeBtn",
  "uploadStatusMessage",
  "uploadResultLink",
]) {
  assert.match(html, new RegExp(`id="${id}"`), `upload panel should include #${id}`);
}

assert.match(preload, /youtubeGetUploadDraft/, "preload should expose youtubeGetUploadDraft");
assert.match(preload, /youtubeSaveUploadDraft/, "preload should expose youtubeSaveUploadDraft");
assert.match(preload, /youtubeUploadJob/, "preload should expose youtubeUploadJob");
assert.match(renderer, /youtubeGetUploadDraft/, "renderer should load upload draft");
assert.match(renderer, /youtubeSaveUploadDraft/, "renderer should save upload draft");
assert.match(renderer, /youtubeUploadJob/, "renderer should upload selected job");
assert.match(renderer, /selectedJobId/, "renderer should bind upload to selectedJobId");
assert.match(renderer, /uploadToYouTubeBtn\.disabled\s*=\s*true/, "upload button should be disabled while uploading");

console.log(JSON.stringify({ ok: true, checked: "youtube-upload-panel-contract" }));
