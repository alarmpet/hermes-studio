#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { renderStableImageSequenceClip } from "../electron/services/stable-image-sequence-renderer.mjs";
import { getMediaDuration } from "./media-probe.mjs";

const dir = await mkdtemp(join(tmpdir(), "hermes-stable-sequence-"));
const svgPath = join(dir, "grid.svg");
const imagePath = join(dir, "grid.jpg");
const outputPath = join(dir, "scene.mp4");

await writeFile(svgPath, `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920">
  <rect width="1080" height="1920" fill="#101827"/>
  <g stroke="#38bdf8" stroke-width="3" opacity="0.75">
    ${Array.from({ length: 28 }, (_, i) => `<line x1="${i * 48}" y1="0" x2="${i * 48 - 540}" y2="1920"/>`).join("")}
    ${Array.from({ length: 40 }, (_, i) => `<line x1="0" y1="${i * 52}" x2="1080" y2="${i * 52 + 260}"/>`).join("")}
  </g>
  <circle cx="540" cy="960" r="260" fill="#f59e0b" opacity="0.92"/>
  <rect x="280" y="760" width="520" height="400" rx="28" fill="#0f172a" opacity="0.8"/>
</svg>`, "utf8");
await sharp(svgPath).jpeg({ quality: 94 }).toFile(imagePath);

const result = await renderStableImageSequenceClip({
  ffmpegBin: ffmpegPath,
  imagePath,
  outputPath,
  durationSeconds: 4,
  order: 1,
  motionPreset: "diagonal-drift",
  motionStrength: "strong",
  fps: 30,
  jobDir: dir,
});

assert.equal(result.fps, 30);
assert.equal(result.frameCount, 120);
assert.equal(result.motionStrategy, "stable-sequence-ken-burns");
assert.ok(result.uniqueFrameCount >= 100);
assert.ok(existsSync(outputPath), "stable image sequence output should exist");
assert.ok(statSync(outputPath).size > 1000, "stable image sequence output should be non-empty");
assert.equal(existsSync(join(dir, "motion-cache", "scene_1")), false, "motion cache should be cleaned by default");

const manifest = JSON.parse(readFileSync(result.sequenceManifestPath, "utf8"));
assert.equal(manifest.cacheCleaned, true);
assert.equal(manifest.frameDurationSeconds, 4);
assert.ok(Math.abs(getMediaDuration(outputPath) - 4) < 0.12, "encoded clip duration should match requested duration");
assert.ok(Array.isArray(manifest.cameraPath) && manifest.cameraPath.length >= 100, "manifest should include the generated camera path");

let previousDx = 0;
let previousDy = 0;
let xReversals = 0;
let yReversals = 0;
let movement = 0;
for (let index = 1; index < manifest.cameraPath.length; index += 1) {
  const prev = manifest.cameraPath[index - 1];
  const current = manifest.cameraPath[index];
  const dx = Math.sign(current.left - prev.left);
  const dy = Math.sign(current.top - prev.top);
  movement += Math.abs(current.left - prev.left) + Math.abs(current.top - prev.top) + Math.abs(current.zoom - prev.zoom);
  if (dx && previousDx && dx !== previousDx) xReversals += 1;
  if (dy && previousDy && dy !== previousDy) yReversals += 1;
  if (dx) previousDx = dx;
  if (dy) previousDy = dy;
}
assert.ok(movement > 20, "camera path should have visible movement");
assert.ok(xReversals <= 1, `x motion should be monotonic, got ${xReversals} reversals`);
assert.ok(yReversals <= 1, `y motion should be monotonic, got ${yReversals} reversals`);

console.log(JSON.stringify({ ok: true, outputPath, sequenceManifestPath: result.sequenceManifestPath }));
