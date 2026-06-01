#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { createYouTubeJob } from "../electron/services/youtube-job-service.mjs";
import { resolveTitleOverlayText } from "../electron/services/title-overlay-text-resolver.mjs";

const root = resolve(import.meta.dirname, "..");
const jobRoot = await mkdtemp(join(tmpdir(), "hermes-youtube-smoke-"));
const events = [];
const expectedAutoTitle = "구글 글래스 테스트";

assert.equal(
  resolveTitleOverlayText({
    job: { options: { titleOverlayMode: "manual", titleOverlayText: "직접 입력 제목" } },
    draft: { title: expectedAutoTitle },
  }).text,
  "직접 입력 제목",
  "manual title overlay text should still override generated text",
);

const result = await createYouTubeJob({
  sourceType: "script",
  sourceValue: [
    `${expectedAutoTitle}.`,
    "구글 글래스가 다시 주목받고 있습니다.",
    "첫 장면은 작은 안경형 기기의 가능성을 보여줍니다.",
    "두 번째 장면은 과거와 현재의 사용 방식을 비교합니다.",
    "세 번째 장면은 사생활과 집중력의 문제를 경고합니다.",
    "마지막 장면은 기술보다 맥락이 중요하다는 교훈을 전합니다.",
  ].join(" "),
  scriptLengthMode: "custom",
  customDurationSeconds: 20,
  voiceId: "male_30_announcer",
  subtitleStyleId: "bold-shorts",
  titleOverlayMode: "auto",
  titleOverlayText: "",
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
const titleOverlayPath = join(result.assets.jobDir, "title-overlay.json");
assert.ok(existsSync(titleOverlayPath), "mock job should create title overlay metadata");
const titleOverlay = JSON.parse(readFileSync(titleOverlayPath, "utf8"));
assert.equal(titleOverlay.enabled, true, "mock job should enable top title overlay by default for Shorts");
assert.equal(titleOverlay.title, expectedAutoTitle, "mock job should render the generated title");
assert.equal(titleOverlay.source, "draft-title", "mock job should record generated title source");
assert.ok(titleOverlay.lines.length <= 2, "title overlay should wrap to at most two lines");
assert.ok(events.some((event) => event.phase === "draft"), "draft phase should be emitted");
assert.ok(events.some((event) => event.phase === "render"), "render phase should be emitted");
assert.ok(events.some((event) => event.phase === "completed"), "completed phase should be emitted");

console.log(JSON.stringify({
  ok: true,
  finalPath: result.finalVideo.finalPath,
  sceneCount: result.assets.draft.scenes.length,
  titleOverlay,
  events: events.length,
}));
