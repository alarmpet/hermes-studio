#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const STOP_WORDS = new Set([
  "the", "and", "with", "scene", "video", "camera", "visual", "goal", "action",
  "show", "showing", "make", "this", "that", "from", "into", "close", "shot",
  "cinematic", "youtube", "shorts", "without", "text", "logos", "watermarks",
]);

function readJsonIfExists(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizePromptForSimilarity(value = "") {
  return cleanText(value)
    .replace(/9:16 cinematic YouTube shorts B-roll scene\./gi, " ")
    .replace(/Visual goal:\s*make this narration instantly understandable without showing subtitles or text:/gi, " ")
    .replace(/Main subject:\s*the core object or situation from the narration\./gi, " ")
    .replace(/Context keywords:.*?(?:Camera:|$)/gis, " Camera:")
    .replace(/Camera:.*?(?:Character consistency:|$)/gis, " Character consistency:")
    .replace(/Character consistency:.*?(?:No talking head|$)/gis, " No talking head")
    .replace(/No talking head.*$/gis, " ")
    .replace(/Do not depict.*$/gis, " ")
    .replace(/Use only fictional.*$/gis, " ")
    .replace(/Avoid faces.*$/gis, " ")
    .replace(/No subtitles.*$/gis, " ")
    .replace(/No logos.*$/gis, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(text = "") {
  return new Set(normalizePromptForSimilarity(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !STOP_WORDS.has(token)));
}

function setSimilarity(left, right) {
  if (!left.size || !right.size) return 0;
  let hit = 0;
  for (const item of left) if (right.has(item)) hit += 1;
  return hit / Math.max(1, left.size + right.size - hit);
}

function countCategories(visualCategories = []) {
  const categoryCounts = new Map();
  for (const category of visualCategories.map(cleanText).filter(Boolean)) {
    categoryCounts.set(category, (categoryCounts.get(category) || 0) + 1);
  }
  return categoryCounts;
}

export function detectVisualRepetition(prompts = [], visualCategories = []) {
  const sets = prompts.map(tokenSet);
  let maxPromptSimilarity = 0;
  let adjacentDuplicateCount = 0;
  for (let index = 1; index < sets.length; index += 1) {
    const similarity = setSimilarity(sets[index - 1], sets[index]);
    maxPromptSimilarity = Math.max(maxPromptSimilarity, similarity);
    if (similarity >= 0.75) adjacentDuplicateCount += 1;
  }

  const categoryCounts = countCategories(visualCategories);
  const maxCategoryCount = Math.max(0, ...categoryCounts.values());
  const categoryDenominator = Math.max(visualCategories.filter(Boolean).length, prompts.length || 0);
  const categoryDominance = categoryDenominator ? maxCategoryCount / categoryDenominator : 0;
  const adjacentDuplicateRatio = adjacentDuplicateCount / Math.max(1, prompts.length - 1);

  return {
    repetitionRisk: prompts.length >= 3 && (
      adjacentDuplicateRatio >= 0.7
      || categoryDominance >= 0.75
    ),
    maxPromptSimilarity: Number(maxPromptSimilarity.toFixed(3)),
    adjacentDuplicateCount,
    adjacentDuplicateRatio: Number(adjacentDuplicateRatio.toFixed(3)),
    categoryDominance: Number(categoryDominance.toFixed(3)),
    categoryCounts: Object.fromEntries(categoryCounts),
  };
}

function textSimilarity(left = "", right = "") {
  return setSimilarity(tokenSet(left), tokenSet(right));
}

function isMissingHpslContract({ job, draft }) {
  const optionStructure = cleanText(job?.options?.scriptStructure).toLowerCase();
  const draftStructure = cleanText(draft?.structure).toLowerCase();
  return optionStructure !== "hpsl" || draftStructure !== "hpsl" || !draft?.hpsl;
}

function targetDuration(job, renderOptions, draft) {
  return Number(
    renderOptions?.targetSeconds
    || job?.options?.customDurationSeconds
    || draft?.duration_seconds
    || 60,
  );
}

export function analyzeYouTubeOutput(jobDirInput) {
  const jobDir = resolve(jobDirInput || ".");
  const draft = readJsonIfExists(join(jobDir, "draft.json"));
  const job = readJsonIfExists(join(jobDir, "job-request.json"));
  const renderOptions = readJsonIfExists(join(jobDir, "render-options.json"));
  const renderReport = readJsonIfExists(join(jobDir, "render-report-v2.json"));
  const audioManifest = readJsonIfExists(join(jobDir, "scene_audio_manifest.json"));
  const scenes = Array.isArray(draft.scenes) ? draft.scenes : [];
  const reportScenes = Array.isArray(renderReport.scenes) ? renderReport.scenes : [];
  const failureCodes = [];
  const details = {
    jobDir,
    sceneCount: scenes.length,
  };

  const expectedDuration = targetDuration(job, renderOptions, draft);
  const finalDuration = Number(renderReport.finalDuration || 0);
  const durationDrift = finalDuration
    ? Number((finalDuration - expectedDuration).toFixed(3))
    : null;
  details.targetSeconds = expectedDuration;
  details.finalDuration = finalDuration || null;
  details.durationDrift = durationDrift;

  if (finalDuration && durationDrift > Math.max(3, expectedDuration * 0.08)) {
    failureCodes.push("TARGET_DURATION_DRIFT");
  }

  const script = cleanText(draft.script);
  const duplicateScenes = scenes
    .map((scene) => ({
      order: scene.order,
      similarity: textSimilarity(scene.narration, script),
      narrationLength: cleanText(scene.narration).length,
      scriptLength: script.length,
    }))
    .filter((item) => (
      item.scriptLength > 80
      && item.narrationLength >= item.scriptLength * 0.75
      && item.similarity >= 0.75
    ));
  if (duplicateScenes.length) {
    failureCodes.push("DUPLICATE_FULL_SCRIPT_SCENE");
    details.duplicateScenes = duplicateScenes;
  }

  const hardFreezeScenes = reportScenes
    .map((scene) => {
      const videoDuration = Number(scene.videoDuration || 0);
      const audioDuration = Number(scene.audioDuration || 0);
      const ratio = videoDuration > 0 ? audioDuration / videoDuration : Number.POSITIVE_INFINITY;
      const extraHoldSeconds = Math.max(0, audioDuration - videoDuration);
      return {
        order: scene.order,
        videoDuration,
        audioDuration,
        ratio: Number(ratio.toFixed(3)),
        strategy: scene.strategy || "",
        extraHoldSeconds: Number(extraHoldSeconds.toFixed(3)),
      };
    })
    .filter((scene) => scene.strategy === "tpad" || scene.ratio > 1.3 || scene.extraHoldSeconds > 2);
  if (hardFreezeScenes.length) {
    failureCodes.push("HARD_FREEZE_RISK");
    details.hardFreezeScenes = hardFreezeScenes;
  }

  if (isMissingHpslContract({ job, draft })) {
    failureCodes.push("MISSING_HPSL_CONTRACT");
  }

  const prompts = scenes.map((scene) => cleanText(scene.image_prompt || scene.imagePrompt || scene.prompt));
  const visualCategories = scenes.map((scene) => cleanText(scene.visual_category || scene.visualCategory));
  const visualRepetition = detectVisualRepetition(prompts, visualCategories);
  details.visualCategoryDistribution = visualRepetition.categoryCounts;
  const meatPromptCount = prompts.filter((prompt) => (
    /meat|steak|grill|bbq|barbecue|pork|beef|chicken|고기|갈비|삼겹살|구이/i.test(prompt)
  )).length;
  visualRepetition.meatPromptCount = meatPromptCount;

  if (visualRepetition.repetitionRisk || meatPromptCount >= Math.max(3, Math.ceil(prompts.length * 0.7))) {
    failureCodes.push("VISUAL_REPETITION_RISK");
    details.visualRepetition = visualRepetition;
  }

  details.audioManifestSceneCount = Array.isArray(audioManifest.scenes) ? audioManifest.scenes.length : 0;

  return {
    ok: failureCodes.length === 0,
    failureCodes: Array.from(new Set(failureCodes)),
    details,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = analyzeYouTubeOutput(process.argv[2] || process.cwd());
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
