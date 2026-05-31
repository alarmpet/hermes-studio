#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";
import { planScenesFromScript } from "../electron/services/script-planner.mjs";
import { validateDraftQuality } from "./youtube-draft-quality.mjs";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const directScript = readFileSync(resolve(root, "electron/services/direct-script-draft-service.mjs"), "utf8");

const longScript = Array.from({ length: 64 }, (_, index) => (
  `1814년 런던 맥주 홍수의 ${index + 1}번째 장면은 산업화 초기 도시 안전의 허점을 보여주는 구체적인 사례입니다.`
)).join(" ");

const scenes = planScenesFromScript({
  script: longScript,
  title: "1814년 런던 맥주 홍수",
  targetSeconds: 600,
  customDurationSeconds: 600,
  flowOutputMode: "hybrid",
  hybridIntroVideoSceneCount: 10,
});

assert.ok(scenes.length >= 10, "longform script should produce enough scenes for a 10 minute workflow");
assert.ok(scenes.every((scene) => String(scene.narration || "").trim()), "longform scene planner must not create empty narration scenes");
assert.ok(scenes.every((scene) => !String(scene.narration || "").includes(longScript)), "no scene should fall back to the full script");
assert.deepEqual(scenes.slice(0, 10).map((scene) => scene.outputMode), Array(10).fill("video"), "first 10 hybrid scenes should be video");
assert.ok(scenes.slice(10).every((scene) => scene.outputMode === "image"), "scenes after the first 10 should be images");

const draft = {
  title: "1814년 런던 맥주 홍수",
  structure: "direct-script",
  script: longScript,
  scenes,
};
assert.equal(validateDraftQuality({ draft, stage: "longform-guard" }).ok, true, "long direct script scenes should pass duplicate-full-script QA");

const job = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: longScript,
  options: {
    scriptLengthMode: "custom",
    customDurationSeconds: 720,
    flowOutputMode: "hybrid",
    hybridIntroVideoSceneCount: 10,
  },
});
assert.equal(job.options.customDurationSeconds, 720, "custom duration should allow over 10 minutes");
assert.equal(job.options.hybridIntroVideoSceneCount, 10, "schema should preserve 10 opening video scenes");

assert.match(html, /id="customDurationSeconds"[^>]+max="1200"/, "UI should allow longform durations up to 1200 seconds");
assert.match(html, /id="hybridIntroVideoSceneCount"[^>]+max="10"/, "UI should allow 10 opening video scenes");
assert.match(renderer, /Math\.min\(1200/, "renderer should clamp custom duration at 1200 seconds");
assert.match(renderer, /Math\.min\(10/, "renderer should clamp hybrid opening video count at 10");
assert.match(directScript, /Math\.min\(10/, "direct script hook warning should use the same 10-scene hybrid cap");

const qaDir = await mkdtemp(resolve(tmpdir(), "hermes-longform-qa-"));
await writeFile(resolve(qaDir, "job-request.json"), JSON.stringify({
  sourceType: "script",
  options: { scriptStructure: "direct-script", customDurationSeconds: 600 },
}, null, 2), "utf8");
await writeFile(resolve(qaDir, "render-options.json"), JSON.stringify({ targetSeconds: 600 }, null, 2), "utf8");
await writeFile(resolve(qaDir, "draft.json"), JSON.stringify({
  structure: "direct-script",
  script: longScript,
  scenes,
}, null, 2), "utf8");
await writeFile(resolve(qaDir, "render-report-v2.json"), JSON.stringify({
  finalDuration: 681.74,
  scenes: scenes.map((scene) => ({
    order: scene.order,
    videoDuration: 44,
    audioDuration: 51.46,
    ratio: 1.17,
    strategy: "slowdown-loop",
  })),
}, null, 2), "utf8");
await writeFile(resolve(qaDir, "scene_audio_manifest.json"), JSON.stringify({ ok: true, scenes }, null, 2), "utf8");
const outputQa = analyzeYouTubeOutput(qaDir);
assert.equal(outputQa.ok, true, "10 minute direct-script output around 11m21s with slowdown-loop should pass longform QA");

console.log(JSON.stringify({ ok: true, checked: "longform-ui-workflow-guards", sceneCount: scenes.length }));
