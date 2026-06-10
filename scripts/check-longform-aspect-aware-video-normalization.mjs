#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { normalizeSceneVideoClip, resolveSceneVideoDimensions } from "../electron/services/scene-video-normalizer.mjs";

function makeClip(path, size) {
  const result = spawnSync(ffmpegPath, [
    "-y",
    "-f", "lavfi",
    "-i", `testsrc=size=${size}:duration=1:rate=30`,
    "-an",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    path,
  ], { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });
  assert.equal(result.status, 0, result.stderr);
}

function probeDimensions(path) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-i", path], { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });
  const text = `${result.stdout}\n${result.stderr}`;
  const match = text.match(/Video:[^\n]+,\s*(\d+)x(\d+)/);
  assert.ok(match, text);
  return { width: Number(match[1]), height: Number(match[2]) };
}

assert.deepEqual(resolveSceneVideoDimensions("16:9"), { width: 1920, height: 1080, aspectRatio: "16:9" });
assert.deepEqual(resolveSceneVideoDimensions("9:16"), { width: 1080, height: 1920, aspectRatio: "9:16" });
assert.deepEqual(resolveSceneVideoDimensions("bad"), { width: 1080, height: 1920, aspectRatio: "9:16" });

const dir = mkdtempSync(join(tmpdir(), "hermes-aspect-normalize-"));
const input = join(dir, "input.mp4");
makeClip(input, "320x180");

const horizontal = join(dir, "out-16x9.mp4");
normalizeSceneVideoClip({ ffmpegBin: ffmpegPath, inputPath: input, outputPath: horizontal, durationSeconds: 1, aspectRatio: "16:9" });
assert.deepEqual(probeDimensions(horizontal), { width: 1920, height: 1080 });

const vertical = join(dir, "out-9x16.mp4");
normalizeSceneVideoClip({ ffmpegBin: ffmpegPath, inputPath: input, outputPath: vertical, durationSeconds: 1, aspectRatio: "9:16" });
assert.deepEqual(probeDimensions(vertical), { width: 1080, height: 1920 });

console.log("check-longform-aspect-aware-video-normalization contract OK");
