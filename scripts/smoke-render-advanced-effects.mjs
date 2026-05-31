#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { renderImageSceneClip } from "../electron/services/image-scene-renderer.mjs";

const dir = await mkdtemp(join(tmpdir(), "hermes-effects-smoke-"));
const svgPath = join(dir, "test-source.svg");
const imagePath = join(dir, "test.jpg");
await writeFile(svgPath, `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#123"/><circle cx="540" cy="820" r="260" fill="#14b8a6"/></svg>`, "utf8");
await sharp(svgPath).jpeg({ quality: 90 }).toFile(imagePath);

for (const preset of ["cinematic-push-in", "diagonal-drift", "tilt-reveal", "hook-punch-zoom"]) {
  const outputPath = join(dir, `${preset}.mp4`);
  await renderImageSceneClip({
    ffmpegBin: ffmpegPath,
    imagePath,
    outputPath,
    durationSeconds: 4,
    motionPreset: preset,
  });
  assert.ok(existsSync(outputPath), `${preset} output should exist`);
  assert.ok(statSync(outputPath).size > 1000, `${preset} output should be non-empty`);
}

console.log(JSON.stringify({ ok: true, dir }));
