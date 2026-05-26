#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const normalizer = readFileSync(new URL("../electron/services/scene-video-normalizer.mjs", import.meta.url), "utf8");
const imageRenderer = readFileSync(new URL("../electron/services/image-scene-renderer.mjs", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");
const renderScript = readFileSync(new URL("../scripts/render-youtube-with-tts.mjs", import.meta.url), "utf8");

assert.match(normalizer, /normalizeSceneVideoClip/, "video Flow clips should have a dedicated normalizer");
assert.match(normalizer, /scale=1080:1920:force_original_aspect_ratio=increase/, "video normalizer should force 9:16 scale");
assert.match(normalizer, /fps=30/, "video normalizer should force 30fps");
assert.match(normalizer, /setsar=1/, "video normalizer should force square pixels before xfade");
assert.match(normalizer, /setpts=PTS-STARTPTS/, "video normalizer should reset clip PTS before xfade");
assert.match(normalizer, /format=yuv420p/, "video normalizer should force yuv420p");
assert.match(normalizer, /fade=t=in/, "video normalizer should add a short fade-in");
assert.match(normalizer, /fade=t=out/, "video normalizer should add a short fade-out");

assert.match(imageRenderer, /fps=30/, "image motion renderer should use 30fps");
assert.match(imageRenderer, /fade=t=in/, "image motion renderer should add fade-in");
assert.match(imageRenderer, /fade=t=out/, "image motion renderer should add fade-out");

assert.match(stages, /normalizeSceneVideoClip/, "workflow stages should normalize Flow video clips before final render");
assert.match(stages, /scene_\$\{scene\.order\}_flow_raw/, "workflow should preserve raw Flow video separately");
assert.match(stages, /scene_\$\{scene\.order\}\.mp4/, "workflow should produce normalized scene_N.mp4 for both image and video modes");
assert.match(stages, /flow-video-normalize/, "workflow should emit a video normalization progress phase");
assert.match(stages, /chooseSceneMotionPreset/, "workflow should choose scene-aware motion presets");
assert.match(stages, /renderEffectPreset/, "workflow should pass render effect preset to scene rendering");
assert.match(stages, /motionPreset:\s*motion\.name/, "workflow should render images with selected motion preset");

assert.match(renderScript, /scene-render-manifest\.json/, "final renderer should write a scene render manifest");
assert.match(renderScript, /sourceMode|sceneOutputMode/, "scene render manifest should include each scene's source mode");

console.log("Hybrid render normalization contract OK");
