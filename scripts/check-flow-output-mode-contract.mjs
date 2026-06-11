#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const schema = readFileSync(new URL("../youtube-job-schema.mjs", import.meta.url), "utf8");
const rendererHtml = readFileSync(new URL("../electron/renderer/index.html", import.meta.url), "utf8");
const rendererApp = readFileSync(new URL("../electron/renderer/app.js", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");
const flow = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");
const webUiHarness = readFileSync(new URL("../automation/web-ui-provider-harness.mjs", import.meta.url), "utf8");
const outputModeHelper = readFileSync(new URL("../automation/google-flow-output-mode.mjs", import.meta.url), "utf8");
const packageJson = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

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

const autoJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { flowOutputMode: "auto" },
});
assert.equal(autoJob.options.flowOutputMode, "auto");

const defaultLongformJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "history longform",
  options: { videoFormat: "longform", customDurationSeconds: 600 },
});
assert.equal(defaultLongformJob.options.flowOutputMode, "auto", "longform should default to Auto unless the user explicitly selects another Flow mode");

assert.throws(() => normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { flowOutputMode: "gif" },
}), /Unknown flowOutputMode/);

assert.match(schema, /flowOutputMode/, "schema should define flowOutputMode");
assert.match(schema, /hybridIntroVideoSceneCount/, "schema should define the hybrid opening video scene count");
for (const mode of ["video", "image", "hybrid", "auto"]) {
  assert.match(schema, new RegExp(`"${mode}"`), `schema should accept ${mode} Flow output mode`);
}
assert.match(rendererHtml, /name="flowOutputMode"/, "UI should expose flow output mode");
assert.match(rendererHtml, /value="auto"/, "UI should expose Auto Google Flow mode");
assert.match(rendererHtml, /flowOutputModeHint/, "UI should explain flow output mode");
assert.match(
  rendererApp,
  /flowOutputMode:\s*getFlowOutputMode\(\)/,
  "renderer should submit the selected Flow output mode without forcing longform jobs to hybrid",
);
assert.match(rendererApp, /Auto: Hermes places Flow video clips/, "renderer should explain Auto mode");
assert.match(stages, /flowOutputMode/, "workflow stages should branch by flow output mode");
assert.match(stages, /scene\.outputMode\s*\|\|\s*scene\.flowOutputMode\s*\|\|\s*job\?\.options\?\.flowOutputMode/, "scene media generation should prefer per-scene output mode");
assert.match(stages, /hybridIntroVideoSceneCount/, "workflow stages should preserve hybrid opening scene count in progress details");
assert.match(flow, /outputMode/, "Google Flow automation should receive outputMode");
assert.match(flow, /naturalWidth/, "image mode should inspect natural image dimensions");
assert.match(flow, /data:image\\\/svg|data:image\/svg/, "image mode should ignore SVG UI icons");
assert.match(flow, /minGeneratedImageSize/, "image mode should require generated-size image candidates");
assert.match(outputModeHelper, /bottomPanel/, "Flow output mode helper should constrain mode clicks to the generator settings panel");
assert.match(outputModeHelper, /chooseFlowGeneratorChip/, "Flow mode switching must use the shared chip classifier");
assert.match(outputModeHelper, /isAgentChip|에이전트|Agent/, "Flow mode switching must explicitly reject Agent chips");
assert.match(outputModeHelper, /flowChipClassifierBrowserSource/, "Flow mode switching should use the shared browser classifier source");
assert.match(outputModeHelper, /sectionBounds/, "Flow mode switching should scope clicks to the requested image/video settings section");
assert.match(outputModeHelper, /saveSettings/, "Flow mode switching should click the Google Flow settings save action");
assert.match(outputModeHelper, /settingsPanelApplied/, "Flow mode switching should expose saved Agent settings panel state");
assert.match(outputModeHelper, /Browser-side classifier evaluation crash|FLOW_CHIP_CLASSIFIER_EVAL_FAILED|classifier evaluation/i, "browser-side classifier failures should be bridged into JSON diagnostics");
assert.doesNotMatch(outputModeHelper, /width > 48\s*\|\|/, "Flow mode switching must not use broad width-only chip selection");
assert.match(outputModeHelper, /verifyFlowOutputMode/, "Flow output helper must verify the selected mode after clicking");
assert.match(outputModeHelper, /requestedOutputMode/, "verification must report requested output mode");
assert.match(outputModeHelper, /selectedOutputMode/, "verification must report selected output mode");
assert.match(outputModeHelper, /bottomGeneratorChip/, "mode selection must target the bottom generator chip, not the sidebar");
assert.match(outputModeHelper, /Imagen 4/, "image mode should allow a non-Pro model when Nano Banana Pro is daily-limit blocked");
assert.match(outputModeHelper, /excludeGeneratorLabels/, "image mode should explicitly exclude daily-limit-prone Pro model choices");
assert.match(outputModeHelper, /selectedImageModel/, "Flow verification should report selected image model");
assert.match(outputModeHelper, /selectedImageModel !== "unknown"/, "image mode verification should require a known image model");
assert.doesNotMatch(outputModeHelper, /imageModel:\s*\[[^\]]*"Nano Banana Pro"/s, "image model selection should not be pinned to Nano Banana Pro");
assert.match(webUiHarness, /locale:\s*["']ko-KR["']/, "Flow browser context should force ko-KR locale for stable labels");
assert.match(flow, /retryFlowOutputModeAfterReload/, "Flow automation should have one bounded reload retry for transient mode-switch failures");
assert.match(flow, /flow_mode_verification/, "Flow automation must save mode verification artifacts");
assert.match(flow, /chooseFlowGeneratorChip/, "Flow generator-ready detection must use the shared chip classifier");
assert.match(flow, /flowChipClassifierBrowserSource/, "Flow generator-ready detection should use the shared browser classifier source");
assert.doesNotMatch(flow, /generatorChip\s*=\s*bottomButtons\.find\(\(item\).*width > 48/s, "generator-ready detection must not treat Agent as the generator chip by width alone");
assert.doesNotMatch(flow, /async function configureFlowVideo/, "legacy unused Flow video switching path should be removed");
assert.match(flow, /selectedChipLabel/, "Flow mismatch diagnostics should include the selected chip label");
assert.match(flow, /rejectedChipReasons/, "Flow mismatch diagnostics should include rejected chip reasons");
assert.match(flow, /settingsPanelApplied/, "Flow automation should accept saved Agent settings when the new Flow UI has no explicit mode chip");
assert.doesNotMatch(outputModeHelper, /results\.some\(\(item\) => item\.ok\)/, "mode switching must not pass just because any click succeeded");
assert.doesNotMatch(outputModeHelper, /allowGeneratorFallback:\s*true/, "image mode must not silently continue when image model selection is not verified");
assert.doesNotMatch(outputModeHelper, /generatorLabels:\s*\[[^\]]*"Image"[^\]]*"이미지"/s, "image mode should not click generic image labels as model names");

assert.ok(packageJson.scripts["check:flow-output-mode"].includes("check-flow-chip-classifier"), "Flow output mode checks should include chip classifier regression");

console.log(JSON.stringify({ ok: true, checked: "flow-output-mode-contract" }));
