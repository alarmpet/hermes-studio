#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

const jobDir = mkdtempSync(join(tmpdir(), "hermes-improvement-warning-"));
mkdirSync(jobDir, { recursive: true });

writeFileSync(join(jobDir, "job-request.json"), JSON.stringify({
  id: "youtube-warning-test",
  sourceType: "script",
  options: { customDurationSeconds: 141, videoFormat: "longform", scriptStructure: "direct-script" },
}, null, 2));
writeFileSync(join(jobDir, "render-options.json"), JSON.stringify({ targetSeconds: 141, aspectRatio: "16:9" }, null, 2));
writeFileSync(join(jobDir, "draft.json"), JSON.stringify({
  title: "우리는 이렇게 배웠죠",
  duration_seconds: 141,
  script: "콜럼버스 거리 계산 착오 이야기",
  scenes: [
    { order: 1, narration: "긴 도입", image_prompt: "historical harbor", visual_category: "hook" },
    { order: 2, narration: "진짜 본문", image_prompt: "navigation map", visual_category: "body" },
  ],
}, null, 2));
writeFileSync(join(jobDir, "scene_audio_manifest.json"), JSON.stringify({
  ok: true,
  scenes: [{ order: 1, duration: 12.6 }, { order: 2, duration: 139.0 }],
}, null, 2));
writeFileSync(join(jobDir, "render-report-v2.json"), JSON.stringify({
  ok: true,
  finalDuration: 152.5,
  scenes: [
    {
      order: 1,
      strategy: "video-to-image-fallback",
      sceneOutputMode: "video",
      videoDuration: 12.6,
      audioDuration: 12.6,
      qualityWarnings: [{ code: "VIDEO_TO_IMAGE_FALLBACK" }],
    },
    {
      order: 2,
      strategy: "slowdown-loop",
      sceneOutputMode: "video",
      videoDuration: 6,
      audioDuration: 7.66,
      qualityWarnings: [{ code: "SOFT_DURATION_MISMATCH" }],
    },
  ],
}, null, 2));

const result = analyzeYouTubeOutput(jobDir);
assert.equal(result.ok, true, "improvement warnings should not fail the artifact");
assert.ok(result.details.improvementWarnings.some((warning) => warning.code === "TARGET_DURATION_SOFT_DRIFT"));
assert.ok(result.details.improvementWarnings.some((warning) => warning.code === "VIDEO_TO_IMAGE_FALLBACK_REVIEW"));
assert.ok(result.details.improvementWarnings.some((warning) => warning.code === "SOFT_DURATION_MISMATCH_REVIEW"));
assert.ok(result.details.improvementWarnings.every((warning) => warning.severity && warning.humanMessage), "warnings should be UI-ready");

console.log(JSON.stringify({ ok: true, checked: "final-output-improvement-warnings", warnings: result.details.improvementWarnings }, null, 2));
