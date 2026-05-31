import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const renderer = readFileSync("scripts/render-youtube-with-tts.mjs", "utf8");
const sequenceService = readFileSync("electron/services/stable-image-sequence-renderer.mjs", "utf8");
const packageJson = readFileSync("package.json", "utf8");

assert.match(sequenceService, /export async function renderStableImageSequenceClip/, "stable sequence service must export renderStableImageSequenceClip");
assert.match(sequenceService, /framesPerMotionStep/, "stable sequence service must expose a frame duplication policy");
assert.match(sequenceService, /frameCount/, "stable sequence service must report frame counts");
assert.match(sequenceService, /sequenceManifestPath/, "stable sequence service must write per-scene sequence metadata");
assert.match(sequenceService, /linkSync/, "stable sequence renderer should prefer hardlinks for repeated frames");
assert.match(sequenceService, /IMAGE_SEQUENCE_CACHE_CLEANUP_FAILED/, "stable sequence renderer should surface cache cleanup warnings");
assert.doesNotMatch(renderer, /zoompan=z=/, "production final image renderer must not use ffmpeg zoompan");
assert.match(renderer, /renderStableImageSequenceClip/, "final renderer must call the stable sequence renderer for image scenes");
assert.match(renderer, /TARGET_ASPECT_RATIO/, "final renderer should resolve a target output aspect");
assert.match(renderer, /TARGET_WIDTH[\s\S]*1920[\s\S]*1080/, "final renderer should support horizontal longform dimensions");
assert.match(sequenceService, /outputWidth\s*=\s*OUTPUT_WIDTH/, "stable image renderer should accept custom output width");
assert.match(sequenceService, /outputHeight\s*=\s*OUTPUT_HEIGHT/, "stable image renderer should accept custom output height");
assert.match(packageJson, /check:stable-image-sequence-renderer/, "package checks should include the stable sequence contract");

console.log("Stable image sequence renderer contract OK");
