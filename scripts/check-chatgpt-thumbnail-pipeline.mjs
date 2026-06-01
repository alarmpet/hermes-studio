#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "automation/chatgpt-thumbnail-source.mjs"), "utf8");
const thumbnail = readFileSync(resolve(root, "pipeline/youtube-thumbnail.mjs"), "utf8");

assert.match(source, /CHATGPT_HUMAN_VERIFICATION_REQUIRED/, "legacy ChatGPT diagnostics should still classify human verification failures");
assert.doesNotMatch(thumbnail, /generateChatGptThumbnail\(/, "production thumbnail pipeline should not call ChatGPT by default");
assert.match(thumbnail, /primaryProvider:\s*"google-flow-image"/, "production thumbnail primary provider should be Google Flow image");
assert.match(thumbnail, /composeFlowThumbnail/, "production thumbnail pipeline should locally compose Korean text");

console.log(JSON.stringify({ ok: true, checked: "chatgpt-thumbnail-legacy-disabled", root }));
