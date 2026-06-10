#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";
import { generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "../youtube-workflow.mjs";

const root = mkdtempSync(join(tmpdir(), "hermes-chapter-render-"));
const script = Array.from({ length: 44 }, (_, index) => {
  const subjects = ["교과서", "다큐멘터리", "신문", "박물관", "기념식", "영화", "위인전", "관광 안내문"];
  const verbs = ["확대했다", "포장했다", "반복했다", "판매했다", "보호했다", "연출했다", "숨겼다", "미화했다"];
  const clues = ["지갑", "체면", "권력", "흥행", "증언", "기록", "사진", "시간표"];
  return `${index + 1}번째 단락은 ${subjects[index % subjects.length]}가 신화를 ${verbs[index % verbs.length]}는 과정을 ${clues[index % clues.length]} 단서로 설명한다.`;
}).join(" ");
const job = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: script,
  options: {
    videoFormat: "longform",
    scriptLengthMode: "custom",
    customDurationSeconds: 600,
    longformTargetSeconds: 600,
    longformChapteredRenderEnabled: true,
    chapterTargetSeconds: 90,
    flowOutputMode: "image",
  },
});

const assets = await generateYouTubeWorkflowAssets(job, {
  outputDir: root,
  jobDir: join(root, "desktop", job.id),
  emit: () => {},
  generateSceneMedia: async ({ scene, jobDir }) => {
    const path = join(jobDir, `scene_${scene.order}.mp4`);
    await writeFile(path, `fake media ${scene.order}`, "utf8");
    return { path, contentType: "video/mp4", flowOutputMode: scene.outputMode, sceneOutputMode: scene.outputMode };
  },
});

const chapterPlanPath = join(assets.jobDir, "longform-chapter-plan.json");
assert.ok(existsSync(chapterPlanPath), "asset generation should persist longform-chapter-plan.json");
const chapterPlan = JSON.parse(readFileSync(chapterPlanPath, "utf8"));
assert.ok(chapterPlan.chapters.length > 1, "test job should split into multiple chapters");

for (const chapter of chapterPlan.chapters) {
  const childDir = join(assets.jobDir, chapter.jobDir);
  assert.ok(existsSync(join(childDir, "job-request.json")), "child job-request.json should exist");
  assert.ok(existsSync(join(childDir, "draft.json")), "child draft.json should exist");
  assert.ok(existsSync(join(childDir, "render-options.json")), "child render-options.json should exist");
  const childDraft = JSON.parse(readFileSync(join(childDir, "draft.json"), "utf8"));
  assert.deepEqual(childDraft.scenes.map((scene) => scene.order), childDraft.scenes.map((_, index) => index + 1), "child scenes must be re-indexed from 1");
  assert.ok(existsSync(join(childDir, "scene_1.mp4")), "child scene media should be copied into chapter folder");
}

const firstChapterDir = join(assets.jobDir, chapterPlan.chapters[0].jobDir);
const firstChapterScene = join(firstChapterDir, "scene_1.mp4");
writeFileSync(join(firstChapterDir, "already-completed.mp4"), "done", "utf8");
chapterPlan.chapters[0].status = "completed";
chapterPlan.chapters[0].finalPath = join(firstChapterDir, "already-completed.mp4");
writeFileSync(chapterPlanPath, JSON.stringify(chapterPlan, null, 2), "utf8");
unlinkSync(firstChapterScene);

await generateYouTubeWorkflowAssets(job, {
  outputDir: root,
  jobDir: join(root, "desktop", job.id),
  emit: () => {},
  generateSceneMedia: async () => {
    throw new Error("resume path should reuse parent media and still resync chapter media");
  },
});
const reconciledPlan = JSON.parse(readFileSync(chapterPlanPath, "utf8"));
assert.equal(reconciledPlan.chapters[0].status, "completed", "resume should preserve completed chapter status");
assert.ok(existsSync(firstChapterScene), "resume/reuse path should resync missing child scene media");

const rendered = [];
const finalVideo = await renderFinalYouTubeVideo(job, assets, {
  finalName: "final-youtube-chaptered.mp4",
  emit: () => {},
  runRenderChild: async ({ jobDir, finalName }) => {
    const finalPath = join(jobDir, finalName);
    await writeFile(finalPath, `chapter video ${rendered.length + 1}`, "utf8");
    await writeFile(join(jobDir, "subtitles-ko-v2.srt"), "1\n00:00:00,000 --> 00:00:02,000\nchapter subtitle\n", "utf8");
    await writeFile(join(jobDir, "render-report-v2.json"), JSON.stringify({ ok: true, finalPath, finalDuration: 2, subtitleEnd: 2, scenes: [] }, null, 2), "utf8");
    rendered.push(jobDir);
    return { stdout: JSON.stringify({ ok: true, finalPath, finalDuration: 2, subtitleEnd: 2 }), stderr: "" };
  },
  stitchChapterVideos: async ({ finalPath, chapterPlan }) => {
    await writeFile(finalPath, "stitched chapter video", "utf8");
    return { finalPath, finalDuration: chapterPlan.chapters.length * 2, subtitleEnd: chapterPlan.chapters.length * 2 };
  },
});

assert.equal(rendered.length, chapterPlan.chapters.length, "renderer should render every chapter child job");
assert.ok(existsSync(finalVideo.finalPath), "chaptered renderer should return final stitched path");
const updatedPlan = JSON.parse(readFileSync(chapterPlanPath, "utf8"));
assert.ok(updatedPlan.chapters.every((chapter) => chapter.status === "completed"), "completed chapters should be persisted");

console.log(JSON.stringify({ ok: true, checked: "longform-chapter-render-contract", chapterCount: chapterPlan.chapters.length }));
