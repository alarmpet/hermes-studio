#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { generateMockMedia } from "../youtube-workflow-stages.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nonDirectoryAppRoot = fileURLToPath(import.meta.url);

async function runMockScene(outputMode) {
  const jobDir = mkdtempSync(join(tmpdir(), `hermes-flow-${outputMode}-fallback-`));
  try {
    const scene = {
      order: outputMode === "image" ? 3 : 4,
      outputMode,
      duration_seconds: 4,
      section: "body",
      visual_category: "explain",
    };
    const result = await generateMockMedia({ scene, jobDir }, {
      ffmpegBin: "C:/definitely/missing/ffmpeg.exe",
      job: {
        id: `ffmpeg-fallback-${outputMode}`,
        options: {
          aspectRatio: "16:9",
          renderEffectPreset: "cinematic",
          motionIntensity: "light",
        },
      },
      paths: {
        appRoot: nonDirectoryAppRoot,
        runtimeRoot: root,
        resourcesRoot: root,
        unpackedRoot: root,
      },
    });

    assert.equal(result.contentType, "video/mp4");
    assert.ok(existsSync(result.path), `${outputMode} mock should create an mp4: ${result.path}`);
    if (outputMode === "image") {
      assert.ok(existsSync(join(jobDir, "scene_3_flow.png")), "image mock should create the local fallback still");
      assert.equal(result.sceneOutputMode, "image");
    } else {
      assert.equal(result.sceneOutputMode, "video");
    }
  } catch (error) {
    assert.doesNotMatch(
      String(error?.message || ""),
      /STDOUT:\s*undefined\s*STDERR:\s*undefined/s,
      "mock media failures must not hide spawn errors behind undefined stdout/stderr",
    );
    throw error;
  } finally {
    rmSync(jobDir, { recursive: true, force: true });
  }
}

await runMockScene("image");
await runMockScene("video");

console.log(JSON.stringify({ ok: true, checked: "flow-image-local-fallback-ffmpeg" }));
