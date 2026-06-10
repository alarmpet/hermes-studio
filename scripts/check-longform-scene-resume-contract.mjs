#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
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

const landscapeJob = normalizeYouTubeJobRequest({
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
    aspectRatio: "16:9",
    voiceId: "male_30_announcer",
    subtitleStyleId: "clean-news",
    speechSpeed: 1,
  },
});

const legacyRoot = await mkdtemp(join(tmpdir(), "hermes-longform-legacy-aspect-"));
const legacyJobDir = join(legacyRoot, "desktop", landscapeJob.id);
await mkdir(legacyJobDir, { recursive: true });
const legacyScenePath = join(legacyJobDir, "scene_1.mp4");
const legacyRender = spawnSync(ffmpegPath, [
  "-y",
  "-f", "lavfi",
  "-i", "color=c=blue:s=1920x1080:d=1",
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  legacyScenePath,
], { encoding: "utf8", maxBuffer: 1024 * 1024 * 4 });
assert.equal(legacyRender.status, 0, `fixture video should render: ${legacyRender.stderr}`);
await writeFile(join(legacyJobDir, "scene-media-manifest.json"), JSON.stringify({
  ok: true,
  version: 1,
  scenes: [{
    order: 1,
    path: legacyScenePath,
    status: "completed",
    outputMode: "video",
    sceneOutputMode: "video",
  }],
}, null, 2));
const legacyRunCalls = [];
await generateYouTubeWorkflowAssets(landscapeJob, {
  outputDir: legacyRoot,
  jobDir: legacyJobDir,
  emit: () => {},
  generateSceneMedia: async ({ scene }) => {
    legacyRunCalls.push(scene.order);
    const mediaPath = join(legacyJobDir, `scene_${scene.order}.mp4`);
    await writeFile(mediaPath, "fresh media");
    return {
      path: mediaPath,
      contentType: "video/mp4",
      flowOutputMode: scene.outputMode,
      sceneOutputMode: scene.outputMode,
      aspectRatio: "16:9",
      normalizedWidth: 1920,
      normalizedHeight: 1080,
    };
  },
});
assert.ok(!legacyRunCalls.includes(1), "16:9 rerun should reuse legacy completed media when probing confirms 1920x1080 dimensions");

const staleRoot = await mkdtemp(join(tmpdir(), "hermes-longform-stale-aspect-"));
const staleJobDir = join(staleRoot, "desktop", landscapeJob.id);
await mkdir(staleJobDir, { recursive: true });
const staleScenePath = join(staleJobDir, "scene_1.mp4");
await writeFile(staleScenePath, "stale vertical media");
await writeFile(join(staleJobDir, "scene-media-manifest.json"), JSON.stringify({
  ok: true,
  version: 1,
  scenes: [{
    order: 1,
    path: staleScenePath,
    status: "completed",
    outputMode: "video",
    sceneOutputMode: "video",
    aspectRatio: "9:16",
    normalizedWidth: 1080,
    normalizedHeight: 1920,
  }],
}, null, 2));

const staleRunCalls = [];
await generateYouTubeWorkflowAssets(landscapeJob, {
  outputDir: staleRoot,
  jobDir: staleJobDir,
  emit: () => {},
  generateSceneMedia: async ({ scene, job }) => {
    staleRunCalls.push(scene.order);
    const mediaPath = join(staleJobDir, `scene_${scene.order}.mp4`);
    await writeFile(mediaPath, "fresh landscape media");
    return {
      path: mediaPath,
      contentType: "video/mp4",
      flowOutputMode: scene.outputMode,
      sceneOutputMode: scene.outputMode,
      aspectRatio: job.options.aspectRatio,
      normalizedWidth: 1920,
      normalizedHeight: 1080,
    };
  },
});
assert.ok(staleRunCalls.includes(1), "16:9 rerun must not reuse stale 9:16 normalized media");

console.log(JSON.stringify({
  ok: true,
  checked: "longform-scene-resume-contract",
  skippedScene: 1,
  regeneratedScenes: secondRunCalls.length,
}));
