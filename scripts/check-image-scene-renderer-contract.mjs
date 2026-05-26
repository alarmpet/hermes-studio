#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { renderImageSceneClip } from "../electron/services/image-scene-renderer.mjs";
import { resolveFfmpegBin } from "../electron/services/ffmpeg-bin-resolver.mjs";

assert.equal(typeof renderImageSceneClip, "function");
assert.equal(typeof resolveFfmpegBin, "function");

const service = readFileSync(new URL("../electron/services/image-scene-renderer.mjs", import.meta.url), "utf8");
const resolver = readFileSync(new URL("../electron/services/ffmpeg-bin-resolver.mjs", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");

assert.match(service, /zoompan|scale|crop/, "image scene renderer should create motion from still images");
assert.match(service, /1080|1920|9:16/, "image scene renderer should target Shorts aspect ratio");
assert.match(service, /veryfast/, "image scene renderer should use fast packaged-safe encoding");
assert.match(service, /threads/, "image scene renderer should allow ffmpeg thread scheduling");
assert.match(service, /stderrTail/, "image scene renderer should report compact stderr diagnostics");
assert.match(service, /frameCount/, "image scene renderer should use a concrete frame count for pan motion");
assert.doesNotMatch(service, /30\*d/, "image scene renderer must not rely on ffmpeg zoompan d as an expression variable");
assert.match(service, /cinematic-push-in/, "renderer should support cinematic push-in motion");
assert.match(service, /diagonal-drift/, "renderer should support diagonal drift motion");
assert.match(service, /tilt-reveal/, "renderer should support tilt reveal motion");
assert.match(service, /hook-punch-zoom/, "renderer should support hook punch zoom motion");
assert.match(service, /buildZoomPanExpression/, "renderer should build expressions through a helper");
assert.match(resolver, /resourcesPath|ffmpeg-static|PATH/, "ffmpeg resolver should support packaged and local fallbacks");
assert.match(stages, /renderImageSceneClip/, "workflow stages should normalize image outputs to video clips");

console.log(JSON.stringify({ ok: true, checked: "image-scene-renderer-contract" }));
