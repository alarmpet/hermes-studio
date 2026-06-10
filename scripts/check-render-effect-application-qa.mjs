#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

const dir = await mkdtemp(join(tmpdir(), "hermes-render-effect-qa-"));

await writeFile(join(dir, "draft.json"), JSON.stringify({
  title: "Effect QA fixture",
  structure: "HPSL",
  hpsl: { hook: {}, point: {}, story: {}, lesson: {} },
  duration_seconds: 600,
  script: "테스트 대본입니다.",
  scenes: [
    {
      order: 1,
      narration: "테스트 장면입니다.",
      flowOutputMode: "image",
      image_prompt: "A wide explainer image.",
      visual_category: "history explainer",
    },
  ],
}, null, 2));

await writeFile(join(dir, "job-request.json"), JSON.stringify({
  sourceType: "keyword",
  options: { scriptStructure: "hpsl" },
}, null, 2));

await writeFile(join(dir, "render-options.json"), JSON.stringify({
  targetSeconds: 600,
  transitionPreset: "scene-fade",
  renderEffectPreset: "cinematic",
  motionIntensity: "strong",
}, null, 2));

const sequenceManifestPath = join(dir, "scene_1_motion_manifest.json");
await writeFile(sequenceManifestPath, JSON.stringify({
  ok: true,
  frameCount: 240,
  uniqueFrameCount: 240,
  fps: 30,
  motionStrength: "strong",
  durationDriftSeconds: 0,
  cameraPath: [
    { left: 0, top: 0, zoom: 1, cropWidth: 1920, cropHeight: 1080 },
    { left: 120, top: 60, zoom: 1.24, cropWidth: 1548, cropHeight: 871 },
  ],
}, null, 2));

await writeFile(join(dir, "render-report-v2.json"), JSON.stringify({
  ok: true,
  finalDuration: 598,
  transition: { preset: "scene-fade", mode: "concat-finalizer", fallback: true },
  advancedEffectsFallback: true,
  scenes: [
    {
      order: 1,
      sceneOutputMode: "image",
      strategy: "stable-image-sequence",
      motionStrategy: "stable-sequence-ken-burns",
      motionPreset: "",
      frameCount: 240,
      stillImageFps: 30,
      audioDuration: 8,
      videoDuration: 8,
      sequenceManifestPath,
    },
  ],
}, null, 2));

await writeFile(join(dir, "scene_audio_manifest.json"), JSON.stringify({
  ok: true,
  scenes: [{ order: 1, durationSeconds: 598 }],
}, null, 2));

const result = analyzeYouTubeOutput(dir);
assert.equal(result.ok, false);
assert.ok(result.failureCodes.includes("RENDER_EFFECT_FALLBACK"), `expected RENDER_EFFECT_FALLBACK, got ${result.failureCodes.join(", ")}`);
assert.ok(result.failureCodes.includes("EMPTY_IMAGE_MOTION_PRESET"), `expected EMPTY_IMAGE_MOTION_PRESET, got ${result.failureCodes.join(", ")}`);

console.log(JSON.stringify({ ok: true, checked: "render-effect-application-qa" }));
