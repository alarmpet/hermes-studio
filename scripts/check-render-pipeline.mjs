#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = "C:/Users/amd/hermes";
const JOB_DIR = "C:/Users/amd/hermes/outputs/youtube/1779594807781-8151113796-700001";

function runNode(args, expectSuccess = true) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (expectSuccess && result.status !== 0) {
    throw new Error(`${args.join(" ")} failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

const badFinal = resolve(JOB_DIR, "final-youtube-ai-news-tts-subtitled.mp4");
if (existsSync(badFinal)) {
  const result = runNode(["./scripts/check-rendered-video.mjs", badFinal], false);
  assert.notEqual(result.status, 0, "Known bad final render should fail QA because subtitles/audio exceed video");
}

const mediaProbe = await import("./media-probe.mjs");
const sceneDuration = mediaProbe.getMediaDuration(resolve(JOB_DIR, "scene_1.mp4"));
assert.ok(sceneDuration >= 7.9 && sceneDuration <= 8.1, `scene_1 duration should be about 8s, got ${sceneDuration}`);

const scriptText = readFileSync(resolve(ROOT, "scripts/render-youtube-with-tts.mjs"), "utf8");
assert.ok(!scriptText.includes("\"-shortest\""), "renderer must not depend on ffmpeg -shortest");
assert.ok(scriptText.includes("scene_audio_manifest.json"), "renderer should use scene-level TTS manifest");

console.log(JSON.stringify({ ok: true, checked: "render-pipeline" }));
