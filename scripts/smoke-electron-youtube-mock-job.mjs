#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createYouTubeJob } from "../electron/services/youtube-job-service.mjs";

const root = resolve(import.meta.dirname, "..");
const jobRoot = await mkdtemp(join(tmpdir(), "hermes-youtube-smoke-"));
const events = [];

const result = await createYouTubeJob({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  scriptLengthMode: "preset",
  scriptLengthPreset: "micro",
  voiceId: "male_30_announcer",
  subtitleStyleId: "bold-shorts",
  mockMediaMode: true,
}, {
  outputDir: jobRoot,
  ffmpegBin: ffmpegPath,
  chromePath: "",
  emit: (event) => events.push(event),
  paths: {
    appRoot: root,
    runtimeRoot: root,
    outputDir: jobRoot,
    flowProfileDir: join(jobRoot, "flow-profile"),
    geminiProfileDir: join(jobRoot, "gemini-profile"),
    renderScriptPath: join(root, "scripts/render-youtube-with-tts.mjs"),
  },
  allowOpenRouterFallback: false,
});

assert.ok(result.finalVideo?.finalPath, "mock job should render a final video");
assert.ok(result.assets?.draft?.scenes?.length, "mock job should have scenes");
assert.ok(events.some((event) => event.phase === "research"), "research phase should be emitted");
assert.ok(events.some((event) => event.phase === "draft"), "draft phase should be emitted");
assert.ok(events.some((event) => event.phase === "render"), "render phase should be emitted");
assert.ok(events.some((event) => event.phase === "completed"), "completed phase should be emitted");

console.log(JSON.stringify({
  ok: true,
  finalPath: result.finalVideo.finalPath,
  sceneCount: result.assets.draft.scenes.length,
  events: events.length,
}));
