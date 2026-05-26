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
assert.match(html, /value="hybrid"/, "UI should expose Hybrid Google Flow mode");
assert.match(html, /id="hybridIntroVideoSceneCount"/, "UI should expose opening video scene count");
assert.match(html, /id="renderEffectPreset"/, "Studio should expose render effect preset");
assert.match(html, /id="transitionPreset"/, "Studio should expose transition preset");
assert.match(html, /id="transitionSeconds"/, "Studio should expose transition duration");
assert.match(html, /characterSheetText|characterSheetImages/, "UI should expose character sheet inputs");
assert.match(html, /consoleFilters/, "UI should expose console filters");
assert.match(html, /artifactPanel/, "UI should expose artifact panel");

assert.match(app, /updateDurationPreview/, "renderer should update duration preview");
assert.match(app, /scriptStructure:\s*getSourceType\(\) === "script" \? "direct-script" : "hpsl"/, "job payload should choose direct-script or HPSL structure");
assert.match(app, /populateStylePresets/, "renderer should load style presets");
assert.match(app, /updateFlowOutputModeHint/, "renderer should update Flow output mode hint");
assert.match(app, /flowOutputMode:\s*getFlowOutputMode\(\)/, "job payload should include Flow output mode");
assert.match(app, /hybridIntroVideoSceneCount:\s*getHybridIntroVideoSceneCount\(\)/, "job payload should include hybrid opening scene count");
assert.match(app, /renderEffectPreset:\s*renderEffectPreset\?\.value/, "renderer should submit render effect preset");
assert.match(app, /transitionPreset:\s*transitionPreset\?\.value/, "renderer should submit transition preset");
assert.match(app, /transitionSeconds:\s*Number/, "renderer should submit numeric transition seconds");
assert.match(app, /updateHybridFlowControls/, "renderer should show hybrid-only controls and update hints");
assert.match(app, /updateSceneSplitPreview/, "renderer should preview sentence-based scene splitting");
assert.match(app, /updateCharacterSheetSummary/, "renderer should summarize character sheet references");
assert.match(app, /restoreConsoleHistory/, "renderer should restore saved workflow console history");
assert.match(app, /copyJobSummary/, "renderer should copy a job summary from console state");

assert.match(css, /duration-summary|qa-summary|console-filters|artifact-panel/, "new Studio V2 summaries and console controls should be styled");

console.log(JSON.stringify({ ok: true, checked: "studio-v2-ux" }));
