#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const unpacked = resolve(root, "dist-electron/win-unpacked/resources/app.asar");
const sourceMain = resolve(root, "electron/main.mjs");
const sourceSchemaPath = resolve(root, "youtube-job-schema.mjs");

assert.ok(existsSync(unpacked) || existsSync(sourceMain), "packaged or source runtime should exist");

const sourceSchema = readFileSync(sourceSchemaPath, "utf8");
assert.match(sourceSchema, /youtube-hpsl-v2/, "source runtime contract should be HPSL V2");
assert.match(sourceSchema, /direct-script/, "source runtime contract should include direct script mode");

if (existsSync(unpacked)) {
  const require = createRequire(import.meta.url);
  const asar = require("@electron/asar");
  const extractDir = mkdtempSync(join(tmpdir(), "hermes-asar-contract-"));
  try {
    asar.extractAll(unpacked, extractDir);
    const packagedSchema = readFileSync(join(extractDir, "youtube-job-schema.mjs"), "utf8");
    const packagedGemini = readFileSync(join(extractDir, "automation/gemini-research-draft.mjs"), "utf8");
    const packagedStages = readFileSync(join(extractDir, "youtube-workflow-stages.mjs"), "utf8");
    const packagedPlanner = readFileSync(join(extractDir, "electron/services/script-planner.mjs"), "utf8");
    const packagedFlowAutomation = readFileSync(join(extractDir, "automation/google-flow-media.mjs"), "utf8");
    const packagedSafety = readFileSync(join(extractDir, "electron/services/flow-prompt-safety.mjs"), "utf8");
    const packagedDirectScript = readFileSync(join(extractDir, "electron/services/direct-script-draft-service.mjs"), "utf8");
    const packagedStylePresets = readFileSync(join(extractDir, "electron/services/style-presets.mjs"), "utf8");
    const packagedCharacterIngest = readFileSync(join(extractDir, "electron/services/character-sheet-ingest.mjs"), "utf8");
    const packagedWorkflowHistory = readFileSync(join(extractDir, "electron/services/workflow-history-service.mjs"), "utf8");
    const packagedOutputMode = readFileSync(join(extractDir, "automation/google-flow-output-mode.mjs"), "utf8");
    const packagedImageRenderer = readFileSync(join(extractDir, "electron/services/image-scene-renderer.mjs"), "utf8");
    const packagedFfmpegResolver = readFileSync(join(extractDir, "electron/services/ffmpeg-bin-resolver.mjs"), "utf8");
    assert.match(packagedSchema, /youtube-hpsl-v2/, "packaged runtime contract should be HPSL V2");
    assert.match(packagedSchema, /scriptStructure/, "packaged job schema should include scriptStructure");
    assert.match(packagedSchema, /direct-script/, "packaged job schema should include direct script mode");
    assert.match(packagedGemini, /structure[^\\n]+HPSL/, "packaged Gemini prompt should request HPSL");
    assert.match(packagedGemini, /GEMINI_GEMS_URL/, "packaged Gemini draft should include the Gems-first URL");
    assert.match(packagedGemini, /requestGemsDraft/, "packaged Gemini draft should try Gems before normal Gemini");
    assert.match(packagedStages, /Gemini Gems/, "packaged workflow should show Gems-first progress text");
    assert.match(packagedStages, /finalOutputQa/, "packaged workflow should emit final output QA");
    assert.match(packagedPlanner, /flow-prompt-safety/, "packaged planner should sanitize Google Flow prompts");
    assert.match(packagedFlowAutomation, /isFlowPolicyWarningText/, "packaged Flow automation should detect policy warnings");
    assert.match(packagedFlowAutomation, /attachFlowIngredients/, "packaged Flow automation should attach character sheet ingredients");
    assert.match(packagedSafety, /sanitizeFlowPrompt/, "packaged runtime should include Flow prompt safety service");
    assert.match(packagedDirectScript, /buildDirectScriptDraft/, "packaged runtime should include direct script draft service");
    assert.match(packagedStylePresets, /STYLE_PRESETS/, "packaged runtime should include style presets");
    assert.match(packagedCharacterIngest, /ingestCharacterSheet/, "packaged runtime should include character sheet ingest");
    assert.match(packagedWorkflowHistory, /getRecentWorkflowEvents/, "packaged runtime should include workflow history restore service");
    assert.match(packagedOutputMode, /configureFlowOutputMode/, "packaged runtime should include Flow output mode helper");
    assert.match(packagedImageRenderer, /renderImageSceneClip/, "packaged runtime should include image scene renderer");
    assert.match(packagedFfmpegResolver, /resolveFfmpegBin/, "packaged runtime should include ffmpeg path resolver");
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ ok: true, checked: "packaged-runtime-contract", root, packaged: existsSync(unpacked) }));
