#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";
import { buildLongformMediaPlan, planLongformScenesFromDraft } from "../electron/services/longform-planner.mjs";
import { normalizeResearchBrief, persistResearchBrief } from "../electron/services/longform-research-brief.mjs";
import { buildRenderOptions, generateYouTubeWorkflowAssets } from "../youtube-workflow.mjs";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");

const longformJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "1814년 런던 맥주 홍수",
  options: {
    videoFormat: "longform",
    scriptLengthMode: "custom",
    customDurationSeconds: 720,
    flowOutputMode: "hybrid",
    hybridIntroVideoSceneCount: 10,
    introVideoClipCount: 10,
    bodyVisualMode: "image",
    bodyImageSeconds: 18,
    researchProvider: "notebooklm-mcp",
    enableLiveMcp: true,
  },
});

assert.equal(longformJob.options.videoFormat, "longform");
assert.equal(longformJob.options.longformTargetSeconds, 720);
assert.equal(longformJob.options.introVideoClipCount, 10);
assert.equal(longformJob.options.bodyVisualMode, "image");
assert.equal(longformJob.options.bodyImageSeconds, 18);
assert.equal(longformJob.options.enableLiveMcp, true);
assert.equal(buildRenderOptions(longformJob).targetSeconds, 720, "longform render target should use longformTargetSeconds");

const longformScriptAutoJob = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "짧은 입력 대본이어도 롱폼으로 선택했다면 렌더 목표는 장편 목표 길이를 따라야 합니다.",
  options: {
    videoFormat: "longform",
    scriptLengthMode: "auto",
    estimatedScriptSeconds: 245,
    customDurationSeconds: 245,
    longformTargetSeconds: 600,
  },
});
assert.equal(buildRenderOptions(longformScriptAutoJob).targetSeconds, 245, "longform direct-script auto should use the estimated script duration");

assert.match(html, /name="videoFormat"/, "UI should expose shorts/longform video format");
assert.match(html, /id="longformControls"/, "UI should expose longform controls");
assert.match(renderer, /videoFormat:\s*getVideoFormat\(\)/, "renderer should submit videoFormat");
assert.match(renderer, /enableLiveMcp/, "renderer should submit live MCP opt-in");

const script = Array.from({ length: 64 }, (_, index) => (
  `1814년 런던 맥주 홍수의 ${index + 1}번째 대목은 거대한 산업 장치와 좁은 도시 주거지가 충돌한 장면을 보여줍니다.`
)).join(" ");
const draft = {
  title: "1814년 런던 맥주 홍수",
  structure: "LONGFORM_CHAPTERS",
  script,
  hpsl: {
    hook: { narration: "맥주가 도시를 덮친 이상한 하루입니다.", target_seconds: 60 },
    point: { narration: "핵심은 술이 아니라 산업 안전입니다.", target_seconds: 120 },
    story: { narration: script, target_seconds: 420 },
    lesson: { narration: "큰 시스템일수록 약한 사람을 먼저 보호해야 합니다.", target_seconds: 120 },
  },
};

const scenes = planLongformScenesFromDraft({
  job: longformJob,
  draft,
  stylePreset: {},
  characterSheet: {},
});
assert.equal(scenes.length, 10 + Math.ceil((720 - 60) / 18));
const openingVideoScenes = scenes.slice(0, 10).filter((scene) => scene.outputMode === "video");
assert.ok(openingVideoScenes.length < 10, "longform auto should not force all first 10 opening scenes to video");
assert.ok(scenes.slice(0, 10).some((scene) => scene.autoReason || scene.autoRejectedReason), "longform opening scenes should expose auto decision reasons");
assert.ok(scenes.slice(10).every((scene) => scene.outputMode === "image"));
assert.ok(scenes.every((scene) => scene.duration_seconds >= 4 && scene.duration_seconds <= 30), "longform media scene durations should remain render-safe");
assert.ok(scenes.every((scene) => /Output mode: (video|image)/i.test(scene.image_prompt)), "longform prompts should include explicit output mode");

const mediaPlan = buildLongformMediaPlan({ job: longformJob, draft: { ...draft, scenes } });
assert.equal(mediaPlan.videoFormat, "longform");
assert.equal(mediaPlan.introVideoClipCount, openingVideoScenes.length);
assert.equal(mediaPlan.visualScenes.length, scenes.length);
assert.ok(mediaPlan.narrationSegments.length >= scenes.length);

const brief = normalizeResearchBrief({
  provider: "notebooklm-mcp",
  notes: ["The beer flood happened in 1814.", "Use caution around casualty details."],
  citations: ["History.com - London Beer Flood"],
});
assert.equal(brief.status, "ok");
assert.ok(brief.notes.length >= 2);
const briefDir = await mkdtemp(join(tmpdir(), "hermes-research-brief-"));
const briefPath = await persistResearchBrief({ jobDir: briefDir, brief });
assert.ok(existsSync(briefPath), "research_brief.json should be persisted");

const jobRoot = await mkdtemp(join(tmpdir(), "hermes-longform-create-job-"));
const assetJob = normalizeYouTubeJobRequest({
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
    speechSpeed: 0.9,
  },
});
const assets = await generateYouTubeWorkflowAssets(assetJob, {
  outputDir: jobRoot,
  jobDir: join(jobRoot, "desktop", assetJob.id),
  emit: () => {},
  generateSceneMedia: async ({ scene }) => ({
    path: join(jobRoot, `scene_${scene.order}.mp4`),
    contentType: "video/mp4",
    flowOutputMode: scene.outputMode,
    sceneOutputMode: scene.outputMode,
  }),
});

const planPath = join(assets.jobDir, "longform-media-plan.json");
assert.ok(existsSync(planPath), "longform jobs should persist longform-media-plan.json");
const savedPlan = JSON.parse(readFileSync(planPath, "utf8"));
assert.ok(savedPlan.introVideoClipCount < 10, "saved longform plan should reflect auto-selected opening video count, not the requested max");
assert.equal(savedPlan.visualScenes.filter((scene) => scene.outputMode === "video").length, savedPlan.introVideoClipCount);
assert.ok(savedPlan.visualScenes.some((scene) => scene.outputMode === "image"));
assert.equal(assets.sceneMedia.length, savedPlan.visualScenes.length, "asset generation should visit every planned longform scene");

console.log(JSON.stringify({
  ok: true,
  checked: "longform-production-contract",
  sceneCount: savedPlan.visualScenes.length,
  planPath,
}));
