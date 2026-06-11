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
  "Scene media generation should route Flow image no-media failures through a non-fatal fallback",
);
assert.match(
  stages,
  /generateMockMedia\(\{\s*scene,\s*jobDir\s*\},\s*context\s*\)/s,
  "Flow image fallback should reuse the local image-scene mock renderer rather than failing the whole job",
);
assert.match(
  stages,
  /FLOW_GENERATION_FAILED[\s\S]*FLOW_GENERATION_STALLED[\s\S]*FLOW_GENERATION_CANCELLED/,
  "Flow image fallback should target failed, stalled, and cancelled image generation failures",
);
assert.match(
  stages,
  /allowLiveImagePlaceholderFallback:\s*true/,
  "video-to-image fallback should recover through local image-motion rendering if Flow image also fails",
);
assert.match(
  stages,
  /flowImageProviderExhausted/,
  "direct Flow image scenes should continue through local image-motion fallback after retryable provider failures",
);
assert.match(
  stages,
  /context\.allowLiveImagePlaceholderFallback[\s\S]*flowImageProviderExhausted[\s\S]*job\?\.options\?\.mockMediaMode/,
  "provider-exhausted image fallback should be explicit and separate from mock mode",
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
