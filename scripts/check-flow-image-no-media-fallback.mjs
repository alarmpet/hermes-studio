#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const flow = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");

assert.match(
  flow,
  /function isFlowSubmissionActive/,
  "Flow automation should use a strict helper for submit-start detection",
);
assert.doesNotMatch(
  flow,
  /hasProgressPercent\s*\|\|\s*state\.hasVideo\s*\|\|\s*!state\.promptStillVisible\s*\|\|\s*state\.failureClassification/,
  "Keyboard submit fallback must not treat prompt disappearance alone as a successful generation start",
);
assert.doesNotMatch(
  flow,
  /!lastState\.promptStillVisible\s*\|\|\s*!lastState\.createButtonVisible\s*\|\|\s*lastState\.hasProgressPercent/,
  "Submit verification must not accept an idle blank composer as generation started",
);
assert.match(
  stages,
  /handleFlowImageSceneFailure/,
  "Scene media generation should route Flow image no-media failures through a centralized policy gate",
);
assert.match(
  stages,
  /generateMockMedia\(\{\s*scene,\s*jobDir\s*\},\s*context\s*\)/s,
  "Explicitly allowed Flow image fallback should reuse the local image-scene mock renderer",
);
assert.match(
  stages,
  /FLOW_GENERATION_FAILED[\s\S]*FLOW_GENERATION_STALLED[\s\S]*FLOW_GENERATION_CANCELLED/,
  "Flow image fallback should target failed, stalled, and cancelled image generation failures",
);
assert.match(
  stages,
  /FLOW_IMAGE_MEDIA_REQUIRED/,
  "Live Flow image failures should stop with an action-required media-required error when local fallback is disabled",
);
assert.doesNotMatch(
  stages,
  /flowImageProviderExhausted/,
  "Provider-exhausted Flow failures must not automatically allow local fallback in live jobs",
);
assert.doesNotMatch(
  stages,
  /context\.allowLiveImagePlaceholderFallback[\s\S]*flowImageProviderExhausted[\s\S]*job\?\.options\?\.mockMediaMode/,
  "Provider-exhausted fallback must not be part of the live fallback allow-list",
);
assert.match(
  stages,
  /import\s+\{\s*resolveFfmpegBin\s*\}\s+from\s+"\.\/electron\/services\/ffmpeg-bin-resolver\.mjs"/,
  "workflow stages should import the shared ffmpeg resolver",
);
assert.match(
  stages,
  /resolveFfmpegBin\(context\.ffmpegBin\)/,
  "workflow stages should resolve ffmpeg before mock fallback rendering",
);
assert.match(
  stages,
  /function throwSpawnFailure/,
  "mock media rendering should use structured spawn diagnostics",
);
assert.match(
  stages,
  /spawnError=.*result\.error\?\.message/s,
  "mock media failures should include spawn error messages",
);
assert.match(
  stages,
  /errorCode=.*result\.error\?\.code/s,
  "mock media failures should include spawn error codes",
);
assert.match(
  stages,
  /scene_\$\{scene\.order\}_flow_image_local_fallback\.json/,
  "Flow image local fallback should persist a scene-level fallback state file",
);
assert.match(
  stages,
  /function resolveSpawnCwd/,
  "mock media rendering should choose a real filesystem directory for child process cwd",
);
assert.doesNotMatch(
  stages,
  /cwd:\s*context\.paths\?\.appRoot\s*\|\|\s*process\.cwd\(\)/,
  "mock media rendering must not use packaged app.asar as child process cwd",
);

console.log(JSON.stringify({ ok: true, checked: "flow-image-no-media-fallback" }));
