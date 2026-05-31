#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";
import { generateYouTubeWorkflowAssets } from "../youtube-workflow.mjs";

const script = Array.from({ length: 80 }, (_, index) => (
  `재실행 테스트용 긴 대본 ${index + 1}번째 문장입니다. 자료와 장면을 안정적으로 이어가기 위한 설명입니다.`
)).join(" ");

const job = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: script,
  options: {
    videoFormat: "longform",
    scriptLengthMode: "custom",
    customDurationSeconds: 720,
    flowOutputMode: "hybrid",
    hybridIntroVideoSceneCount: 10,
    introVideoClipCount: 10,
    bodyVisualMode: "image",
    bodyImageSeconds: 18,
    voiceId: "male_30_announcer",
    subtitleStyleId: "clean-news",
    speechSpeed: 1,
  },
});

const root = await mkdtemp(join(tmpdir(), "hermes-longform-resume-"));
const jobDir = join(root, "desktop", job.id);
let firstRunCalls = 0;

await assert.rejects(
  () => generateYouTubeWorkflowAssets(job, {
    outputDir: root,
    jobDir,
    emit: () => {},
    generateSceneMedia: async ({ scene }) => {
      firstRunCalls += 1;
      if (scene.order === 2) throw new Error("simulated Flow interruption");
      const mediaPath = join(jobDir, `scene_${scene.order}.mp4`);
      await writeFile(mediaPath, "dummy media");
      return {
        path: mediaPath,
        contentType: "video/mp4",
        flowOutputMode: scene.outputMode,
        sceneOutputMode: scene.outputMode,
      };
    },
  }),
  /simulated Flow interruption/,
);

assert.equal(firstRunCalls, 2, "first run should stop at the interrupted scene");

const manifestPath = join(jobDir, "scene-media-manifest.json");
assert.ok(existsSync(manifestPath), "partial run should persist scene-media-manifest.json");
const partialManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.equal(partialManifest.scenes.find((item) => item.order === 1)?.status, "completed");
assert.equal(partialManifest.scenes.find((item) => item.order === 2)?.status, "failed");

const secondRunCalls = [];
const assets = await generateYouTubeWorkflowAssets(job, {
  outputDir: root,
  jobDir,
  emit: () => {},
  generateSceneMedia: async ({ scene }) => {
    secondRunCalls.push(scene.order);
    const mediaPath = join(jobDir, `scene_${scene.order}.mp4`);
    await writeFile(mediaPath, "dummy media");
    return {
      path: mediaPath,
      contentType: "video/mp4",
      flowOutputMode: scene.outputMode,
      sceneOutputMode: scene.outputMode,
    };
  },
});

assert.ok(!secondRunCalls.includes(1), "rerun should reuse completed scene 1 instead of regenerating it");
assert.ok(secondRunCalls.includes(2), "rerun should resume from failed scene 2");
assert.equal(assets.sceneMedia.length, assets.draft.scenes.length, "resume run should return media for every scene");

const finalManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
assert.ok(finalManifest.scenes.every((item) => item.status === "completed"), "successful rerun should complete every scene");

console.log(JSON.stringify({
  ok: true,
  checked: "longform-scene-resume-contract",
  skippedScene: 1,
  regeneratedScenes: secondRunCalls.length,
}));
