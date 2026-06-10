#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const unpacked = resolve(root, "dist-electron/win-unpacked/resources/app.asar");
const unpackedRuntimeRoot = resolve(root, "dist-electron/win-unpacked/resources/app.asar.unpacked");
const sourceMain = resolve(root, "electron/main.mjs");
const sourceSchemaPath = resolve(root, "youtube-job-schema.mjs");

assert.ok(existsSync(unpacked) || existsSync(sourceMain), "packaged or source runtime should exist");

const sourceSchema = readFileSync(sourceSchemaPath, "utf8");
assert.match(sourceSchema, /youtube-hpsl-v2/, "source runtime contract should be HPSL V2");
assert.match(sourceSchema, /direct-script/, "source runtime contract should include direct script mode");

function findFileByExtension(startDir, extension) {
  if (!existsSync(startDir)) return "";
  for (const item of readdirSync(startDir)) {
    const candidate = join(startDir, item);
    const stats = statSync(candidate);
    if (stats.isDirectory()) {
      const found = findFileByExtension(candidate, extension);
      if (found) return found;
    } else if (candidate.toLowerCase().endsWith(extension.toLowerCase())) {
      return candidate;
    }
  }
  return "";
}

function findDirectoryByPrefix(startDir, prefix) {
  if (!existsSync(startDir)) return "";
  for (const item of readdirSync(startDir)) {
    const candidate = join(startDir, item);
    if (statSync(candidate).isDirectory() && item.startsWith(prefix)) return candidate;
  }
  return "";
}

if (existsSync(unpacked)) {
  assert.ok(existsSync(unpackedRuntimeRoot), `packaged app.asar.unpacked should exist: ${unpackedRuntimeRoot}`);
  assert.ok(
    existsSync(join(unpackedRuntimeRoot, "scripts/render-youtube-with-tts.mjs")),
    "packaged unpacked render script should exist",
  );
  assert.ok(
    existsSync(join(unpackedRuntimeRoot, "electron/services/timeline-transition-renderer.mjs")),
    "packaged unpacked timeline transition renderer should exist",
  );
  assert.ok(
    existsSync(join(unpackedRuntimeRoot, "electron/services/render-effect-presets.mjs")),
    "packaged unpacked render effect presets should exist",
  );
  assert.ok(
    existsSync(join(unpackedRuntimeRoot, "node_modules/ffmpeg-static/ffmpeg.exe")),
    "packaged ffmpeg.exe should exist in app.asar.unpacked",
  );
  const packagedFfmpeg = join(unpackedRuntimeRoot, "node_modules/ffmpeg-static/ffmpeg.exe");
  const ffmpegVersion = spawnSync(packagedFfmpeg, ["-version"], { encoding: "utf8", windowsHide: true });
  assert.equal(ffmpegVersion.status, 0, "packaged ffmpeg.exe should be executable");
  const sharpNativeRoot = findDirectoryByPrefix(join(unpackedRuntimeRoot, "node_modules/@img"), "sharp-win32-");
  assert.ok(sharpNativeRoot, "packaged Sharp Windows native package should exist in app.asar.unpacked");
  assert.ok(findFileByExtension(sharpNativeRoot, ".node"), "packaged Sharp native .node binding should exist");

  const require = createRequire(import.meta.url);
  const asar = require("@electron/asar");
  const extractDir = mkdtempSync(join(tmpdir(), "hermes-asar-contract-"));
  try {
    asar.extractAll(unpacked, extractDir);
    const packagedSchema = readFileSync(join(extractDir, "youtube-job-schema.mjs"), "utf8");
    const packagedGemini = readFileSync(join(extractDir, "automation/gemini-research-draft.mjs"), "utf8");
    const packagedMain = readFileSync(join(extractDir, "electron/main.mjs"), "utf8");
    const packagedAuthService = readFileSync(join(extractDir, "electron/services/auth-service.mjs"), "utf8");
    const packagedStages = readFileSync(join(extractDir, "youtube-workflow-stages.mjs"), "utf8");
    const packagedPlanner = readFileSync(join(extractDir, "electron/services/script-planner.mjs"), "utf8");
    const packagedFlowAutomation = readFileSync(join(extractDir, "automation/google-flow-media.mjs"), "utf8");
    const packagedChromiumWindowBounds = readFileSync(join(extractDir, "automation/chromium-window-bounds.mjs"), "utf8");
    const packagedSafety = readFileSync(join(extractDir, "electron/services/flow-prompt-safety.mjs"), "utf8");
    const packagedDirectScript = readFileSync(join(extractDir, "electron/services/direct-script-draft-service.mjs"), "utf8");
    const packagedStylePresets = readFileSync(join(extractDir, "electron/services/style-presets.mjs"), "utf8");
    const packagedCharacterIngest = readFileSync(join(extractDir, "electron/services/character-sheet-ingest.mjs"), "utf8");
    const packagedWorkflowHistory = readFileSync(join(extractDir, "electron/services/workflow-history-service.mjs"), "utf8");
    const packagedOutputMode = readFileSync(join(extractDir, "automation/google-flow-output-mode.mjs"), "utf8");
    const packagedImageRenderer = readFileSync(join(extractDir, "electron/services/image-scene-renderer.mjs"), "utf8");
    const packagedStableImageRenderer = readFileSync(join(extractDir, "electron/services/stable-image-sequence-renderer.mjs"), "utf8");
    const packagedFfmpegResolver = readFileSync(join(extractDir, "electron/services/ffmpeg-bin-resolver.mjs"), "utf8");
    const packagedWorkflowStages = readFileSync(join(extractDir, "youtube-workflow-stages.mjs"), "utf8");
    assert.match(packagedSchema, /youtube-hpsl-v2/, "packaged runtime contract should be HPSL V2");
    assert.match(packagedSchema, /scriptStructure/, "packaged job schema should include scriptStructure");
    assert.match(packagedSchema, /direct-script/, "packaged job schema should include direct script mode");
    assert.match(packagedGemini, /structure[^\\n]+HPSL/, "packaged Gemini prompt should request HPSL");
    assert.match(packagedGemini, /GEMINI_GEMS_URL/, "packaged Gemini draft should include the Gems-first URL");
    assert.match(packagedGemini, /requestGemsDraft/, "packaged Gemini draft should try Gems before normal Gemini");
    assert.match(packagedGemini, /ensureLargeViewport/, "packaged Gemini automation should verify its viewport");
    assert.match(packagedGemini, /--start-maximized/, "packaged Gemini automation should start Chrome maximized");
    assert.match(packagedGemini, /chromium-window-bounds\.mjs/, "packaged Gemini automation should use the shared Chromium bounds guard");
    assert.match(packagedChromiumWindowBounds, /Browser\.setWindowBounds/, "packaged Chromium bounds guard should maximize the actual Chrome window");
    assert.match(packagedChromiumWindowBounds, /isEffectivelyMaximizedBounds/, "packaged Chromium bounds guard should accept large normal-state windows");
    assert.match(packagedMain, /mainWindow\.maximize\(\)/, "packaged Electron app should start maximized");
    assert.match(packagedAuthService, /--start-maximized/, "packaged auth browser should start maximized");
    assert.match(packagedAuthService, /--window-size=1920,1080/, "packaged auth browser should use a large window size");
    assert.match(packagedAuthService, /--window-position=0,0/, "packaged auth browser should start at the primary display origin");
    assert.match(packagedStages, /Gemini Gems/, "packaged workflow should show Gems-first progress text");
    assert.match(packagedStages, /finalOutputQa/, "packaged workflow should emit final output QA");
    assert.match(packagedPlanner, /flow-prompt-safety/, "packaged planner should sanitize Google Flow prompts");
    assert.match(packagedFlowAutomation, /isFlowPolicyWarningText/, "packaged Flow automation should detect policy warnings");
    assert.match(packagedFlowAutomation, /attachFlowIngredients/, "packaged Flow automation should attach character sheet ingredients");
    assert.match(packagedFlowAutomation, /submitFlowPromptByKeyboard/, "packaged Flow automation should include keyboard submit fallback");
    assert.match(packagedFlowAutomation, /isFlowSubmissionActive/, "packaged Flow automation should use strict submit-start detection");
    assert.match(packagedFlowAutomation, /createLookupError/, "packaged Flow automation should preserve create button lookup diagnostics");
    assert.match(packagedFlowAutomation, /serializeFlowSubmitAttempt/, "packaged Flow automation should serialize submit attempts without assuming create coordinates");
    assert.doesNotMatch(packagedFlowAutomation, /mouseClick:\s*\{\s*x:\s*[^}]*positions\.create\.x/s, "packaged Flow automation should not dereference missing create button coordinates");
    assert.match(packagedFlowAutomation, /ensureLargeViewport/, "packaged Flow automation should verify its viewport");
    assert.match(packagedFlowAutomation, /--start-maximized/, "packaged Flow automation should start Chrome maximized");
    assert.match(packagedFlowAutomation, /chromium-window-bounds\.mjs/, "packaged Flow automation should use the shared Chromium bounds guard");
    assert.match(packagedFlowAutomation, /focusPromptTextboxByDom/, "packaged Flow automation should include prompt textbox DOM focus fallback");
    assert.match(packagedFlowAutomation, /flow_prompt_focus_failed\.json/, "packaged Flow automation should write prompt focus failure diagnostics");
    assert.match(packagedFlowAutomation, /retryFlowSubmitAfterIdle/, "packaged Flow automation should self-heal video and image submit-idle failures");
    assert.match(packagedFlowAutomation, /FLOW_PROMPT_CARD_CREATED_BUT_NOT_SUBMITTED/, "packaged Flow automation should classify prompt-card submit idle");
    assert.match(packagedSafety, /sanitizeFlowPrompt/, "packaged runtime should include Flow prompt safety service");
    assert.match(packagedDirectScript, /buildDirectScriptDraft/, "packaged runtime should include direct script draft service");
    assert.match(packagedStylePresets, /STYLE_PRESETS/, "packaged runtime should include style presets");
    assert.match(packagedCharacterIngest, /ingestCharacterSheet/, "packaged runtime should include character sheet ingest");
    assert.match(packagedWorkflowHistory, /getRecentWorkflowEvents/, "packaged runtime should include workflow history restore service");
    assert.match(packagedOutputMode, /configureFlowOutputMode/, "packaged runtime should include Flow output mode helper");
    assert.match(packagedImageRenderer, /renderImageSceneClip/, "packaged runtime should include image scene renderer");
    assert.match(packagedImageRenderer, /renderStableImageSequenceClip/, "packaged image scene renderer should use stable sequence rendering");
    assert.match(packagedStableImageRenderer, /renderStableImageSequenceClip/, "packaged runtime should include stable image sequence renderer");
    assert.match(packagedFfmpegResolver, /resolveFfmpegBin/, "packaged runtime should include ffmpeg path resolver");
    assert.match(packagedWorkflowStages, /handleFlowImageSceneFailure/, "packaged workflow should recover no-media Flow image failures locally");
    assert.match(packagedWorkflowStages, /FLOW_IMAGE_NO_MEDIA_LOCAL_FALLBACK/, "packaged workflow should emit Flow image local fallback diagnostics");
    assert.match(
      packagedWorkflowStages,
      /resolveFfmpegBin\(context\.ffmpegBin\)/,
      "packaged workflow mock fallback should resolve ffmpeg before spawning",
    );
    assert.match(
      packagedWorkflowStages,
      /function throwSpawnFailure/,
      "packaged workflow mock fallback should include structured spawn diagnostics",
    );
    assert.match(
      packagedWorkflowStages,
      /spawnError=.*result\.error\?\.message/s,
      "packaged workflow mock fallback should report spawn error messages",
    );
    assert.match(
      packagedWorkflowStages,
      /errorCode=.*result\.error\?\.code/s,
      "packaged workflow mock fallback should report spawn error codes",
    );
    assert.match(
      packagedWorkflowStages,
      /scene_\$\{scene\.order\}_flow_image_local_fallback\.json/,
      "packaged workflow should persist Flow image local fallback state files",
    );
    assert.match(
      packagedWorkflowStages,
      /function resolveSpawnCwd/,
      "packaged workflow should choose a real filesystem directory for mock media child process cwd",
    );
    assert.doesNotMatch(
      packagedWorkflowStages,
      /cwd:\s*context\.paths\?\.appRoot\s*\|\|\s*process\.cwd\(\)/,
      "packaged workflow must not use app.asar as mock media child process cwd",
    );
  } finally {
    rmSync(extractDir, { recursive: true, force: true });
  }
}

console.log(JSON.stringify({ ok: true, checked: "packaged-runtime-contract", root, packaged: existsSync(unpacked) }));
