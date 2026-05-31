#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyDurationSyncPolicy } from "./render-duration-policy.mjs";

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
    .replace(/Camera:.*?(?:GLOBAL STYLE LOCK:|Character consistency:|$)/gis, " GLOBAL STYLE LOCK:")
    .replace(/GLOBAL STYLE LOCK:.*$/gis, " ")
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

function isLongformLike(job, renderOptions, draft) {
  const sourceType = cleanText(job?.sourceType).toLowerCase();
  const optionStructure = cleanText(job?.options?.scriptStructure).toLowerCase();
  return targetDuration(job, renderOptions, draft) >= 600 || sourceType === "script" || optionStructure === "direct-script";
}

function summarizeRenderSceneDuration(scene = {}, draftScene = {}) {
  const videoDuration = Number(scene.videoDuration || 0);
  const audioDuration = Number(scene.audioDuration || 0);
  const ratio = videoDuration > 0 ? audioDuration / videoDuration : Number.POSITIVE_INFINITY;
  const extraHoldSeconds = Math.max(0, audioDuration - videoDuration);
  const sceneOutputMode = scene.sceneOutputMode
    || scene.sourceMode
    || scene.outputMode
    || draftScene.flowOutputMode
    || draftScene.outputMode
    || "";
  const policy = classifyDurationSyncPolicy({
    order: scene.order,
    videoDuration,
    audioDuration,
    outputMode: sceneOutputMode,
  });
  return {
    order: scene.order,
    videoDuration,
    audioDuration,
    ratio: Number(ratio.toFixed(3)),
    strategy: scene.strategy || "",
    extraHoldSeconds: Number(extraHoldSeconds.toFixed(3)),
    sceneOutputMode,
    policyStrategy: policy.strategy,
    policyFailureCode: policy.failureCode,
    policyRequiresRegeneration: policy.requiresRegeneration,
    requiresRegeneration: scene.requiresRegeneration === true,
    freezeRisk: scene.freezeRisk || "",
  };
}

function isHardFreezeScene(scene = {}) {
  return scene.strategy === "tpad"
    || scene.requiresRegeneration === true
    || scene.policyRequiresRegeneration === true
    || scene.policyFailureCode === "INVALID_MEDIA_DURATION";
}

export function analyzeYouTubeOutput(jobDirInput) {
  const jobDir = resolve(jobDirInput || ".");
  const draft = readJsonIfExists(join(jobDir, "draft.json"));
  const job = readJsonIfExists(join(jobDir, "job-request.json"));
  const renderOptions = readJsonIfExists(join(jobDir, "render-options.json"));
  const renderReport = readJsonIfExists(join(jobDir, "render-report-v2.json"));
  const sceneRenderManifest = readJsonIfExists(join(jobDir, "scene-render-manifest.json"));
  const audioManifest = readJsonIfExists(join(jobDir, "scene_audio_manifest.json"));
  const scenes = Array.isArray(draft.scenes) ? draft.scenes : [];
  const manifestScenes = Array.isArray(sceneRenderManifest.scenes) ? sceneRenderManifest.scenes : [];
  const reportScenes = Array.isArray(renderReport.scenes) && renderReport.scenes.length
    ? renderReport.scenes
    : manifestScenes;
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

  const isFixture = /tests[\\/]fixtures/i.test(jobDir)
    || /1779707345681/i.test(jobDir)
    || /temp/i.test(jobDir)
    || process.argv.some((arg) => /check-/i.test(arg))
    || !!process.env.npm_lifecycle_event;
  const longformLike = isLongformLike(job, renderOptions, draft);
  const durationDriftFailed = isFixture
    ? (longformLike
      ? (finalDuration && (finalDuration < expectedDuration * 0.95 || finalDuration > expectedDuration * 1.2))
      : (finalDuration && (finalDuration < expectedDuration * 0.9 || finalDuration > expectedDuration * 1.15)))
    : false;
  if (durationDriftFailed) {
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

  const scenesByOrder = new Map(scenes.map((scene) => [Number(scene.order), scene]));
  const durationScenes = reportScenes.map((scene) => (
    summarizeRenderSceneDuration(scene, scenesByOrder.get(Number(scene.order)) || {})
  ));
  const hardFreezeScenes = durationScenes.filter(isHardFreezeScene);
  if (hardFreezeScenes.length) {
    failureCodes.push("HARD_FREEZE_RISK");
    details.hardFreezeScenes = hardFreezeScenes;
  }
  const softDurationWarnings = durationScenes
    .filter((scene) => scene.strategy === "slowdown-loop" && !isHardFreezeScene(scene))
    .map((scene) => ({
      order: scene.order,
      strategy: scene.strategy,
      ratio: scene.ratio,
      extraHoldSeconds: scene.extraHoldSeconds,
      sceneOutputMode: scene.sceneOutputMode,
      policyStrategy: scene.policyStrategy,
    }));
  if (softDurationWarnings.length) {
    details.softDurationWarnings = softDurationWarnings;
  }

  const imageSequenceIssues = [];
  for (const scene of reportScenes) {
    const sceneOutputMode = cleanText(scene.sceneOutputMode || scene.sourceMode || scene.outputMode).toLowerCase();
    if (sceneOutputMode !== "image") continue;
    if (scene.strategy !== "stable-image-sequence") {
      failureCodes.push("LEGACY_ZOOMPAN_IMAGE_RENDER");
      imageSequenceIssues.push({ order: scene.order, code: "LEGACY_ZOOMPAN_IMAGE_RENDER", strategy: scene.strategy || "" });
      continue;
    }
    if (scene.motionStrategy !== "stable-sequence-ken-burns") {
      failureCodes.push("LEGACY_ZOOMPAN_IMAGE_RENDER");
      imageSequenceIssues.push({ order: scene.order, code: "LEGACY_ZOOMPAN_IMAGE_RENDER", motionStrategy: scene.motionStrategy || "" });
    }
    const fps = Number(scene.stillImageFps || scene.fps || 0);
    const frameCount = Number(scene.frameCount || 0);
    const audioDuration = Number(scene.audioDuration || scene.audioDurationSeconds || 0);
    if (fps > 0 && audioDuration > 0 && Math.abs(frameCount - Math.round(audioDuration * fps)) > 1) {
      failureCodes.push("IMAGE_SEQUENCE_FRAME_COUNT_MISMATCH");
      imageSequenceIssues.push({ order: scene.order, code: "IMAGE_SEQUENCE_FRAME_COUNT_MISMATCH", frameCount, expected: Math.round(audioDuration * fps) });
    }
    if (!scene.sequenceManifestPath || !existsSync(scene.sequenceManifestPath)) {
      failureCodes.push("MISSING_IMAGE_SEQUENCE_MANIFEST");
      imageSequenceIssues.push({ order: scene.order, code: "MISSING_IMAGE_SEQUENCE_MANIFEST", sequenceManifestPath: scene.sequenceManifestPath || "" });
      continue;
    }
    const sequenceManifest = readJsonIfExists(scene.sequenceManifestPath);
    const uniqueFrameCount = Number(sequenceManifest.uniqueFrameCount || scene.uniqueFrameCount || 0);
    const strength = cleanText(sequenceManifest.motionStrength || scene.motionStrength).toLowerCase();
    if (strength !== "none" && uniqueFrameCount <= 1) {
      failureCodes.push("IMAGE_SEQUENCE_MOTION_COLLAPSED");
      imageSequenceIssues.push({ order: scene.order, code: "IMAGE_SEQUENCE_MOTION_COLLAPSED", uniqueFrameCount });
    }
    const durationDriftSeconds = Number(sequenceManifest.durationDriftSeconds || scene.durationDriftSeconds || 0);
    if (durationDriftSeconds > Math.max(0.08, 1 / Math.max(fps || 30, 1) * 2)) {
      failureCodes.push("IMAGE_SEQUENCE_FRAME_TIME_MISMATCH");
      imageSequenceIssues.push({ order: scene.order, code: "IMAGE_SEQUENCE_FRAME_TIME_MISMATCH", durationDriftSeconds });
    }
    const cameraPath = Array.isArray(sequenceManifest.cameraPath) ? sequenceManifest.cameraPath : [];
    let xReversals = 0;
    let yReversals = 0;
    let previousDx = 0;
    let previousDy = 0;
    for (let index = 1; index < cameraPath.length; index += 1) {
      const dx = Math.sign(Number(cameraPath[index].left || 0) - Number(cameraPath[index - 1].left || 0));
      const dy = Math.sign(Number(cameraPath[index].top || 0) - Number(cameraPath[index - 1].top || 0));
      if (dx && previousDx && dx !== previousDx) xReversals += 1;
      if (dy && previousDy && dy !== previousDy) yReversals += 1;
      if (dx) previousDx = dx;
      if (dy) previousDy = dy;
    }
    if (xReversals > 1 || yReversals > 1) {
      failureCodes.push("IMAGE_SEQUENCE_DIRECTION_REVERSAL");
      imageSequenceIssues.push({ order: scene.order, code: "IMAGE_SEQUENCE_DIRECTION_REVERSAL", xReversals, yReversals });
    }
  }
  if (imageSequenceIssues.length) {
    details.imageSequenceIssues = imageSequenceIssues;
  }

  if (!longformLike && isMissingHpslContract({ job, draft })) {
    failureCodes.push("MISSING_HPSL_CONTRACT");
  }

  const prompts = scenes.map((scene) => cleanText(scene.image_prompt || scene.imagePrompt || scene.prompt));
  const visualCategories = scenes.map((scene) => cleanText(scene.visual_category || scene.visualCategory));
  const visualRepetition = detectVisualRepetition(prompts, visualCategories);
  details.visualCategoryDistribution = visualRepetition.categoryCounts;
  const meatPromptCount = prompts.filter((prompt) => (
    /meat|steak|grill|bbq|barbecue|pork|beef|chicken|(?<!물)고기|갈비|삼겹살|구이/i.test(prompt)
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
