#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createYouTubeJob } from "../electron/services/youtube-job-service.mjs";

const root = resolve(import.meta.dirname, "..");
const jobRoot = await mkdtemp(join(tmpdir(), "hermes-youtube-hybrid-smoke-"));
const events = [];

const result = await createYouTubeJob({
  sourceType: "script",
  sourceValue: "구글 글래스",
  sourceValue: "구글 글래스가 다시 주목받고 있습니다. 첫 장면은 작은 안경형 기기의 가능성을 보여줍니다. 두 번째 장면은 과거와 현재의 사용 방식을 비교합니다. 세 번째 장면은 사생활과 집중력 문제를 경고합니다. 마지막 장면은 기술보다 맥락이 중요하다는 교훈을 전합니다.",
  scriptLengthMode: "custom",
  customDurationSeconds: 20,
  flowOutputMode: "hybrid",
  hybridIntroVideoSceneCount: 1,
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

assert.ok(result.finalVideo?.finalPath, "hybrid mock job should render a final video");
assert.ok(existsSync(result.finalVideo.finalPath), "final hybrid mock video should exist");
assert.equal(result.assets.draft.scenes[0].outputMode, "video", "first hybrid scene should be video");
assert.ok(result.assets.draft.scenes.slice(1).every((scene) => scene.outputMode === "image"), "remaining hybrid scenes should be image");
assert.ok(events.some((event) => event.details?.sceneOutputModes), "scene planning progress should report output modes");

const manifestPath = join(result.assets.jobDir, "scene-render-manifest.json");
assert.ok(existsSync(manifestPath), "hybrid render should write a scene render manifest");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.ok(manifest.scenes?.some((scene) => scene.sceneOutputMode === "video"), "manifest should contain a video scene");
assert.ok(manifest.scenes?.some((scene) => scene.sceneOutputMode === "image"), "manifest should contain image scenes");

console.log(JSON.stringify({
  ok: true,
  finalPath: result.finalVideo.finalPath,
  jobDir: result.assets.jobDir,
  sceneOutputModes: result.assets.draft.scenes.map((scene) => scene.outputMode),
  events: events.length,
}));
