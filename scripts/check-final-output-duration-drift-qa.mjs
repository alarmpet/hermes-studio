#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

function writeBaseJob({ targetSeconds, finalDuration, audioDurations }) {
  const jobDir = mkdtempSync(join(tmpdir(), "hermes-duration-drift-qa-"));
  const finalPath = join(jobDir, "final.mp4");
  writeFileSync(finalPath, "");
  writeFileSync(join(jobDir, "draft.json"), JSON.stringify({
    title: "duration drift qa",
    duration_seconds: targetSeconds,
    scenes: audioDurations.map((duration, index) => ({
      order: index + 1,
      narration: `scene ${index + 1}`,
      outputMode: "video",
      image_prompt: "test",
    })),
  }, null, 2));
  writeFileSync(join(jobDir, "job-request.json"), JSON.stringify({ sourceType: "script", options: {} }, null, 2));
  writeFileSync(join(jobDir, "render-options.json"), JSON.stringify({ targetSeconds, aspectRatio: "16:9" }, null, 2));
  writeFileSync(join(jobDir, "render-report-v2.json"), JSON.stringify({
    ok: true,
    finalPath,
    finalDuration,
    scenes: audioDurations.map((duration, index) => ({
      order: index + 1,
      videoDuration: duration,
      audioDuration: duration,
      strategy: "setpts",
      sceneOutputMode: "video",
    })),
  }, null, 2));
  writeFileSync(join(jobDir, "scene_audio_manifest.json"), JSON.stringify({
    ok: true,
    scenes: audioDurations.map((duration, index) => ({ order: index + 1, duration })),
  }, null, 2));
  return jobDir;
}

const ttsTooLong = analyzeYouTubeOutput(writeBaseJob({
  targetSeconds: 60,
  finalDuration: 120,
  audioDurations: [60, 60],
}));
assert.equal(ttsTooLong.ok, false);
assert.ok(
  ttsTooLong.failureCodes.includes("TTS_TARGET_DURATION_DRIFT"),
  `expected TTS_TARGET_DURATION_DRIFT, got ${ttsTooLong.failureCodes.join(", ")}`,
);

const finalTooLong = analyzeYouTubeOutput(writeBaseJob({
  targetSeconds: 60,
  finalDuration: 100,
  audioDurations: [30, 30],
}));
assert.equal(finalTooLong.ok, false);
assert.ok(
  finalTooLong.failureCodes.includes("FINAL_AUDIO_DURATION_DRIFT"),
  `expected FINAL_AUDIO_DURATION_DRIFT, got ${finalTooLong.failureCodes.join(", ")}`,
);

console.log("check-final-output-duration-drift-qa contract OK");
