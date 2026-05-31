#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const app = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const css = readFileSync(resolve(root, "electron/renderer/styles.css"), "utf8");

assert.match(html, /HPSL|후킹|포인트|스토리|교훈/, "UI should expose HPSL structure");
assert.match(html, /durationSummary/, "UI should show actual duration summary");
assert.match(html, /qualitySummary|qaSummary/, "UI should reserve space for QA summary");
assert.match(html, /value="script"/, "UI should expose direct script source mode");
assert.match(html, /sceneSplitPreview/, "UI should expose direct script scene split preview");
assert.match(html, /scriptDurationValidation/, "UI should expose direct script duration validation");
assert.match(html, /stylePresetId/, "UI should expose visual style preset selection");
assert.match(html, /name="flowOutputMode"/, "UI should expose Google Flow output mode choice");
assert.match(html, /flowOutputModeHint/, "UI should explain video versus image generation mode");
assert.match(html, /autoLandscapeLongform/, "UI should expose optional longform landscape output");
assert.match(app, /aspectRatio:\s*getRequestedAspectRatio\(\)/, "renderer should submit selected output aspect ratio");
assert.match(app, /autoLandscapeLongform:\s*Boolean/, "renderer should submit the landscape checkbox");
assert.match(html, /value="hybrid"/, "UI should expose Hybrid Google Flow mode");
assert.match(html, /id="hybridIntroVideoSceneCount"/, "UI should expose opening video scene count");
assert.match(html, /id="renderEffectPreset"/, "Studio should expose render effect preset");
assert.match(html, /value="none"[^>]*>효과없음</, "Studio should expose no render effect option");
assert.match(html, /value="light"[^>]*>약하게</, "Studio should expose light render effect option");
assert.match(html, /value="strong"[^>]*>강하게</, "Studio should expose strong render effect option");
assert.match(html, /id="transitionPreset"/, "Studio should expose transition preset");
assert.match(html, /id="transitionSeconds"/, "Studio should expose transition duration");
assert.match(html, /characterSheetText|characterSheetImages/, "UI should expose character sheet inputs");
assert.match(html, /consoleFilters/, "UI should expose console filters");
assert.match(html, /artifactPanel/, "UI should expose artifact panel");
assert.match(html, /webwrightDiagnosticsEnabled|Webwright/, "Studio should expose optional Webwright diagnostics status");
assert.match(html, /Top Title|titleOverlayEnabled/, "Studio should expose top title overlay controls");
assert.match(html, /titleOverlayPreview/, "Studio should show a top-title preview");

assert.match(app, /updateDurationPreview/, "renderer should update duration preview");
assert.match(app, /scriptStructure:\s*getSourceType\(\) === "script" \? "direct-script" : "hpsl"/, "job payload should choose direct-script or HPSL structure");
assert.match(app, /populateStylePresets/, "renderer should load style presets");
assert.match(app, /updateFlowOutputModeHint/, "renderer should update Flow output mode hint");
assert.match(
  app,
  /flowOutputMode:\s*getVideoFormat\(\)\s*===\s*"longform"\s*\?\s*"hybrid"\s*:\s*getFlowOutputMode\(\)/,
  "job payload should include Flow output mode and force longform jobs to hybrid",
);
assert.match(app, /hybridIntroVideoSceneCount:\s*getHybridIntroVideoSceneCount\(\)/, "job payload should include hybrid opening scene count");
assert.match(app, /\^https\?:\\\/\\\//, "renderer should detect pasted URL values");
assert.match(app, /input\[name='sourceType'\]\[value='url'\]/, "renderer should switch pasted URLs to URL mode");
assert.match(app, /renderEffectPreset:\s*renderEffectPreset\?\.value/, "renderer should submit render effect preset");
assert.match(app, /motionIntensity:\s*motionIntensity\?\.value/, "renderer should submit motion intensity");
assert.match(app, /효과없음|약하게|강하게/, "renderer preview should describe effect strength in Korean");
assert.match(app, /transitionPreset:\s*transitionPreset\?\.value/, "renderer should submit transition preset");
assert.match(app, /transitionSeconds:\s*Number/, "renderer should submit numeric transition seconds");
assert.match(app, /updateHybridFlowControls/, "renderer should show hybrid-only controls and update hints");
assert.match(app, /updateSceneSplitPreview/, "renderer should preview sentence-based scene splitting");
assert.match(app, /updateCharacterSheetSummary/, "renderer should summarize character sheet references");
assert.match(app, /restoreConsoleHistory/, "renderer should restore saved workflow console history");
assert.match(app, /copyJobSummary/, "renderer should copy a job summary from console state");
assert.match(app, /primaryProviderFailure/, "Studio should expose primary provider thumbnail failures");
assert.match(app, /CHATGPT_IMAGE_TOOL_NOT_FOUND/, "Studio should explain ChatGPT image tool failures");
assert.match(app, /explainThumbnailFailure/, "Studio should centralize thumbnail failure explanations");
assert.match(app, /updateTitleOverlayPreview/, "Studio should preview title overlay style");
assert.match(app, /titleOverlayEnabled/, "Studio should submit title overlay options");

assert.match(css, /duration-summary|qa-summary|console-filters|artifact-panel/, "new Studio V2 summaries and console controls should be styled");
assert.match(css, /title-overlay-preview/, "top title preview should be styled");

console.log(JSON.stringify({ ok: true, checked: "studio-v2-ux" }));
