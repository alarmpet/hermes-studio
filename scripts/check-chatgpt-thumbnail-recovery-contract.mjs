#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");
const preload = readFileSync(resolve(root, "electron/preload.mjs"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const service = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(service, /retryThumbnailForJob/, "desktop YouTube service should expose a thumbnail-only retry helper");
assert.match(service, /createThumbnailForJob/, "thumbnail-only retry should use the shared thumbnail pipeline");
assert.match(service, /primaryProviderFailure/, "thumbnail-only retry should preserve ChatGPT primary failure details");
assert.match(service, /actionRequired:\s*chatGptThumbnailActionRequired/, "thumbnail recovery should surface user-action guidance to the progress UI");
assert.match(service, /Open Authenticate ChatGPT/, "thumbnail recovery should tell the user to complete ChatGPT verification manually");
assert.match(main, /youtube:retryThumbnail/, "main process should expose thumbnail-only retry IPC");
assert.match(preload, /youtubeRetryThumbnail/, "preload should expose thumbnail-only retry to the renderer");
assert.match(html, /retryThumbnailBtn/, "renderer should include a Retry Thumbnail button");
assert.match(renderer, /retryThumbnailBtn/, "renderer should wire the Retry Thumbnail button");
assert.match(renderer, /youtubeRetryThumbnail/, "renderer should call thumbnail-only retry IPC");
assert.match(renderer, /CHATGPT_HUMAN_VERIFICATION_REQUIRED/, "renderer should keep explicit human verification guidance");
assert.match(packageJson, /check-chatgpt-thumbnail-recovery-contract\.mjs/, "package checks should include thumbnail recovery contract");

console.log(JSON.stringify({ ok: true, checked: "chatgpt-thumbnail-recovery-contract" }));
