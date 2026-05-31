#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderImageSceneClip } from "../electron/services/image-scene-renderer.mjs";
import { resolveFfmpegBin } from "../electron/services/ffmpeg-bin-resolver.mjs";

assert.equal(typeof renderImageSceneClip, "function");
assert.equal(typeof resolveFfmpegBin, "function");

const service = readFileSync(new URL("../electron/services/image-scene-renderer.mjs", import.meta.url), "utf8");
const stableService = readFileSync(new URL("../electron/services/stable-image-sequence-renderer.mjs", import.meta.url), "utf8");
const resolver = readFileSync(new URL("../electron/services/ffmpeg-bin-resolver.mjs", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");
const finalRenderer = readFileSync(new URL("../scripts/render-youtube-with-tts.mjs", import.meta.url), "utf8");

assert.match(service, /renderStableImageSequenceClip/, "image scene renderer should use the shared stable sequence renderer");
assert.doesNotMatch(service, /zoompan=z=/, "image scene renderer should not keep a separate zoompan path");
assert.match(stableService, /1080|1920|OUTPUT_WIDTH|OUTPUT_HEIGHT/, "stable renderer should target Shorts aspect ratio");
assert.match(stableService, /veryfast/, "stable renderer should use fast packaged-safe encoding");
assert.match(stableService, /tailText/, "stable renderer should report compact stderr diagnostics");
assert.match(stableService, /frameCount/, "stable renderer should use a concrete frame count for pan motion");
assert.match(stableService, /cinematic-push-in/, "renderer should support cinematic push-in motion");
assert.match(stableService, /diagonal-drift/, "renderer should support diagonal drift motion");
assert.match(stableService, /tilt-reveal/, "renderer should support tilt reveal motion");
assert.match(stableService, /hook-punch-zoom/, "renderer should support hook punch zoom motion");
assert.match(stableService, /buildStableCameraPath/, "renderer should build motion through a stable camera path helper");
assert.match(resolver, /resourcesPath|ffmpeg-static|PATH/, "ffmpeg resolver should support packaged and local fallbacks");
assert.match(stages, /renderImageSceneClip/, "workflow stages should normalize image outputs to video clips");
assert.match(stages, /await renderImageSceneClip/, "workflow stages should await async stable image rendering");
assert.match(finalRenderer, /scene_\$\{order\}_flow\.jpg/, "final renderer should reuse original Flow still images for image-mode scenes");
assert.match(finalRenderer, /stable-image-sequence/, "final renderer should use the stable image sequence strategy");
assert.match(finalRenderer, /stable-sequence-ken-burns/, "final renderer should keep subtle pan/zoom motion without stretching old clips");
assert.doesNotMatch(finalRenderer, /zoompan=z=/, "final renderer should not use ffmpeg zoompan for image scenes");
assert.match(finalRenderer, /HERMES_STILL_IMAGE_FPS/, "final renderer should expose still image FPS tuning");
assert.match(finalRenderer, /HERMES_STABLE_KEN_BURNS_STRENGTH/, "final renderer should expose stable Ken Burns strength tuning");
assert.match(finalRenderer, /motionStrength/, "render reports should record the applied image motion strength");

console.log(JSON.stringify({ ok: true, checked: "image-scene-renderer-contract" }));
