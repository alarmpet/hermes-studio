#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const prompt = readFileSync(resolve(root, "pipeline/youtube-thumbnail-prompt.mjs"), "utf8");
const thumbnail = readFileSync(resolve(root, "pipeline/youtube-thumbnail.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");

assert.match(prompt, /buildFlowThumbnailPrompt/, "thumbnail prompt module should export a Flow background prompt builder");
assert.match(prompt, /buildThumbnailOverlayPlan/, "thumbnail prompt module should export a local Korean overlay plan builder");
assert.match(prompt, /no readable text/i, "Flow thumbnail background prompt must prohibit readable text");
assert.match(prompt, /hookHeadline/, "overlay plan should include a hook headline");
assert.match(prompt, /highlightKeywords/, "overlay plan should include highlighted keywords");
assert.match(prompt, /normalizeThumbnailOverlayStyle/, "overlay plan should normalize user-editable style controls");
assert.match(thumbnail, /generateGoogleFlowVideoFromPrompt/, "thumbnail pipeline should call Google Flow image generation");
assert.match(thumbnail, /outputMode:\s*"image"/, "thumbnail pipeline must request Flow image mode");
assert.match(thumbnail, /composeFlowThumbnail/, "thumbnail pipeline should locally compose Korean text");
assert.doesNotMatch(thumbnail, /generateChatGptThumbnail\(/, "ChatGPT should not be the production thumbnail provider");
assert.match(thumbnail, /thumbnail-flow-metadata\.json/, "thumbnail pipeline should persist Flow thumbnail metadata");
assert.match(thumbnail, /hookHeadline/, "thumbnail metadata should persist the hook headline");
assert.match(thumbnail, /sourcePath/, "thumbnail metadata should persist the Flow background source path");
assert.match(stages, /flowTimeoutMs:\s*context\.flowTimeoutMs/, "workflow stages should pass Flow timeout into thumbnail generation");
assert.match(stages, /flowProfileDir:\s*context\.paths\?\.flowProfileDir/, "workflow stages should pass Flow profile dir into thumbnail generation");

console.log(JSON.stringify({ ok: true, checked: "flow-thumbnail-pipeline" }));
