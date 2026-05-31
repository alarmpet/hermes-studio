#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "automation/chatgpt-thumbnail-source.mjs"), "utf8");
const pipeline = readFileSync(resolve(root, "pipeline/youtube-thumbnail.mjs"), "utf8");

for (const code of [
  "CHATGPT_AUTH_REQUIRED",
  "CHATGPT_HUMAN_VERIFICATION_REQUIRED",
  "CHATGPT_COMPOSER_NOT_FOUND",
  "CHATGPT_IMAGE_TOOL_NOT_FOUND",
  "CHATGPT_TEXT_RESPONSE_INSTEAD_OF_IMAGE",
  "CHATGPT_IMAGE_DOWNLOAD_FAILED",
  "CHATGPT_IMAGE_TIMEOUT",
]) {
  assert.match(source, new RegExp(code), `thumbnail automation must emit ${code}`);
}

assert.match(source, /createChatGptThumbnailError/, "thumbnail automation should create coded errors");
assert.match(source, /persistThumbnailFailure/, "thumbnail automation should persist structured failures");
assert.match(source, /redactSensitiveDetails/, "thumbnail automation should redact sensitive failure details");
assert.match(source, /chatgpt-thumbnail-tool-menu\.png/, "must save a screenshot after opening the ChatGPT tool menu");
assert.match(source, /chatgpt-thumbnail-result\.json/, "must persist thumbnail result JSON");
assert.match(pipeline, /primaryProviderFailure/, "thumbnail pipeline must preserve ChatGPT failure details after local fallback");
assert.match(pipeline, /local-composited/, "local fallback must remain available");

console.log(JSON.stringify({ ok: true, checked: "chatgpt-thumbnail-failure-taxonomy" }));
