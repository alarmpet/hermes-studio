#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

const jobDir = mkdtempSync(join(tmpdir(), "hermes-black-span-qa-"));
const finalPath = join(jobDir, "final-black-span.mp4");

const result = spawnSync(ffmpegPath, [
  "-y",
  "-f", "lavfi",
  "-i", "color=c=black:s=320x180:d=6:r=30",
  "-f", "lavfi",
  "-i", "anullsrc=r=44100:cl=mono",
  "-shortest",
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  "-c:a", "aac",
  finalPath,
], { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });
assert.equal(result.status, 0, result.stderr);

writeFileSync(join(jobDir, "draft.json"), JSON.stringify({
  title: "black span qa",
  duration_seconds: 6,
  scenes: [{ order: 1, narration: "black span test", outputMode: "video", image_prompt: "test" }],
}, null, 2));
writeFileSync(join(jobDir, "job-request.json"), JSON.stringify({ sourceType: "script", options: {} }, null, 2));
writeFileSync(join(jobDir, "render-options.json"), JSON.stringify({ targetSeconds: 6, aspectRatio: "16:9" }, null, 2));
writeFileSync(join(jobDir, "render-report-v2.json"), JSON.stringify({
  ok: true,
  finalPath,
  finalDuration: 6,
  scenes: [{ order: 1, videoDuration: 6, audioDuration: 6, strategy: "setpts", sceneOutputMode: "video" }],
}, null, 2));
writeFileSync(join(jobDir, "scene_audio_manifest.json"), JSON.stringify({
  ok: true,
  scenes: [{ order: 1, duration: 6 }],
}, null, 2));

const qa = analyzeYouTubeOutput(jobDir);
assert.equal(qa.ok, false, "analyzer should fail a final MP4 with sustained black video");
assert.ok(qa.failureCodes.includes("FINAL_VIDEO_BLACK_SPAN"), `expected FINAL_VIDEO_BLACK_SPAN, got ${qa.failureCodes.join(", ")}`);

console.log("check-final-output-black-frame-qa contract OK");
