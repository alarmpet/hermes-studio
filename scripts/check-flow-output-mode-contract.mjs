#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const schema = readFileSync(new URL("../youtube-job-schema.mjs", import.meta.url), "utf8");
const rendererHtml = readFileSync(new URL("../electron/renderer/index.html", import.meta.url), "utf8");
const rendererApp = readFileSync(new URL("../electron/renderer/app.js", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");
const flow = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");
const outputModeHelper = readFileSync(new URL("../automation/google-flow-output-mode.mjs", import.meta.url), "utf8");

const videoJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { flowOutputMode: "video" },
});
assert.equal(videoJob.options.flowOutputMode, "video");

const imageJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { flowOutputMode: "image" },
});
assert.equal(imageJob.options.flowOutputMode, "image");

const hybridJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { flowOutputMode: "hybrid", hybridIntroVideoSceneCount: 2 },
});
assert.equal(hybridJob.options.flowOutputMode, "hybrid");
assert.equal(hybridJob.options.hybridIntroVideoSceneCount, 2);

assert.throws(() => normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { flowOutputMode: "gif" },
}), /Unknown flowOutputMode/);

assert.match(schema, /flowOutputMode/, "schema should define flowOutputMode");
assert.match(schema, /hybridIntroVideoSceneCount/, "schema should define the hybrid opening video scene count");
assert.match(schema, /\["video", "image", "hybrid"\]/, "schema should accept hybrid Flow output mode");
assert.match(rendererHtml, /name="flowOutputMode"/, "UI should expose flow output mode");
assert.match(rendererHtml, /flowOutputModeHint/, "UI should explain flow output mode");
assert.match(rendererApp, /flowOutputMode:\s*getFlowOutputMode\(\)/, "renderer should submit flow output mode");
assert.match(stages, /flowOutputMode/, "workflow stages should branch by flow output mode");
assert.match(stages, /scene\.outputMode\s*\|\|\s*scene\.flowOutputMode\s*\|\|\s*job\?\.options\?\.flowOutputMode/, "scene media generation should prefer per-scene output mode");
assert.match(stages, /hybridIntroVideoSceneCount/, "workflow stages should preserve hybrid opening scene count in progress details");
assert.match(flow, /outputMode/, "Google Flow automation should receive outputMode");
assert.match(flow, /naturalWidth/, "image mode should inspect natural image dimensions");
assert.match(flow, /data:image\\\/svg|data:image\/svg/, "image mode should ignore SVG UI icons");
assert.match(flow, /minGeneratedImageSize/, "image mode should require generated-size image candidates");
assert.match(outputModeHelper, /bottomPanel/, "Flow output mode helper should constrain mode clicks to the generator settings panel");
assert.match(outputModeHelper, /verifyFlowOutputMode/, "Flow output helper must verify the selected mode after clicking");
assert.match(outputModeHelper, /requestedOutputMode/, "verification must report requested output mode");
assert.match(outputModeHelper, /selectedOutputMode/, "verification must report selected output mode");
assert.match(outputModeHelper, /bottomGeneratorChip/, "mode selection must target the bottom generator chip, not the sidebar");
assert.match(outputModeHelper, /Nano Banana Pro/, "image mode should request Nano Banana Pro, not Imagen 4");
assert.match(outputModeHelper, /selectedImageModel/, "Flow verification should report selected image model");
assert.match(outputModeHelper, /selectedImageModel === "nano-banana-pro"/, "image mode verification should require Nano Banana Pro");
assert.doesNotMatch(outputModeHelper, /imageModel:\s*\[[^\]]*"Imagen"/s, "image model selection should not prefer or fall back to Imagen");
assert.match(flow, /locale:\s*["']ko-KR["']/, "Flow browser context should force ko-KR locale for stable labels");
assert.match(flow, /retryFlowOutputModeAfterReload/, "Flow automation should have one bounded reload retry for transient mode-switch failures");
assert.match(flow, /flow_mode_verification/, "Flow automation must save mode verification artifacts");
assert.doesNotMatch(outputModeHelper, /results\.some\(\(item\) => item\.ok\)/, "mode switching must not pass just because any click succeeded");
assert.doesNotMatch(outputModeHelper, /allowGeneratorFallback:\s*true/, "image mode must not silently continue when image model selection is not verified");
assert.doesNotMatch(outputModeHelper, /generatorLabels:\s*\[[^\]]*"Image"[^\]]*"이미지"/s, "image mode should not click generic image labels as model names");

console.log(JSON.stringify({ ok: true, checked: "flow-output-mode-contract" }));
