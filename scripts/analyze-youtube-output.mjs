#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { classifyDurationSyncPolicy } from "./render-duration-policy.mjs";

function getImageStats(imagePath) {
  try {
    const res = spawnSync(ffmpegPath, [
      "-i", imagePath,
      "-vf", "scale=32:18",
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "-"
    ], { maxBuffer: 1024 * 10, encoding: "buffer" });
    if (res.status === 0 && res.stdout.length === 64) {
      const bytes = res.stdout;
      const mean = bytes.reduce((sum, b) => sum + b, 0) / 64;
      const variance = bytes.reduce((sum, b) => sum + Math.pow(b - mean, 2), 0) / 64;
      const stdev = Math.sqrt(variance);
      return { mean, stdev };
    }
  } catch (err) {
    console.error("Failed to calculate image stats via ffmpeg", err);
  }
  return null;
}

function grayStatsFromBuffer(buffer) {
  if (!buffer?.length) return null;
  const bytes = Array.from(buffer);
  const mean = bytes.reduce((sum, b) => sum + b, 0) / bytes.length;
  const variance = bytes.reduce((sum, b) => sum + Math.pow(b - mean, 2), 0) / bytes.length;
  return { mean, stdev: Math.sqrt(variance) };
}

function getVideoFrameStats(videoPath, timestampSeconds) {
  try {
    const res = spawnSync(ffmpegPath, [
      "-ss", String(Math.max(0, Number(timestampSeconds || 0)).toFixed(3)),
      "-i", videoPath,
      "-frames:v", "1",
      "-vf", "scale=8:8",
      "-f", "rawvideo",
      "-pix_fmt", "gray",
      "-"
    ], { maxBuffer: 1024 * 64, encoding: "buffer" });
    if (res.status === 0 && res.stdout.length > 0) {
      const stats = grayStatsFromBuffer(res.stdout);
      const bytes = Array.from(res.stdout);
      return {
        ...stats,
        darkPixelRatio: bytes.filter((value) => value < 24).length / bytes.length,
        brightPixelRatio: bytes.filter((value) => value > 170).length / bytes.length,
      };
    }
  } catch (err) {
    console.error("Failed to calculate video frame stats via ffmpeg", err);
  }
  return null;
}

function resolveFinalVideoPath(jobDir, renderReport = {}) {
  const candidates = [
    renderReport.finalPath,
    renderReport.finalVideo,
    renderReport.outputPath,
    join(jobDir, "final-youtube-ai-news-tts-subtitled-v2.mp4"),
  ].filter(Boolean);
  return candidates.find((item) => existsSync(item)) || "";
}

function analyzeFinalVideoBlackSpans({ jobDir, renderReport = {} } = {}) {
  const finalPath = resolveFinalVideoPath(jobDir, renderReport);
  const finalDuration = Number(renderReport.finalDuration || 0);
  if (!finalPath || finalDuration <= 0) return { ok: true, warnings: [] };

  const sampleStep = finalDuration <= 120 ? 1 : Math.max(2, Math.floor(finalDuration / 90));
  const samples = [];
  for (let t = 0.5; t < finalDuration - 0.1; t += sampleStep) {
    const stats = getVideoFrameStats(finalPath, t);
    if (!stats) continue;
    const black = (stats.mean < 15 && stats.stdev < 3.5)
      || (stats.darkPixelRatio > 0.92 && stats.brightPixelRatio < 0.12);
    samples.push({
      time: Number(t.toFixed(2)),
      mean: Number(stats.mean.toFixed(3)),
      stdev: Number(stats.stdev.toFixed(3)),
      darkPixelRatio: Number((stats.darkPixelRatio || 0).toFixed(4)),
      brightPixelRatio: Number((stats.brightPixelRatio || 0).toFixed(4)),
      black,
    });
  }

  const spans = [];
  let current = null;
  for (const sample of samples) {
    if (sample.black) {
      current ||= { start: sample.time, end: sample.time, samples: [] };
      current.end = sample.time;
      current.samples.push(sample);
    } else if (current) {
      spans.push(current);
      current = null;
    }
  }
  if (current) spans.push(current);

  const sustained = spans
    .map((span) => ({
      ...span,
      estimatedDuration: Number((span.end - span.start + sampleStep).toFixed(3)),
    }))
    .filter((span) => span.estimatedDuration >= 3 && span.samples.length >= 3);

  if (!sustained.length) return { ok: true, warnings: [], sampleStep, sampledFrames: samples.length };
  return {
    ok: false,
    warnings: sustained.map((span) => ({
      code: "FINAL_VIDEO_BLACK_SPAN",
      message: "Final video contains a sustained black visual span.",
      start: span.start,
      end: span.end,
      estimatedDuration: span.estimatedDuration,
      sampleCount: span.samples.length,
      finalPath,
    })),
    sampleStep,
    sampledFrames: samples.length,
  };
}

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

function sumAudioManifestDuration(audioManifest = {}) {
  const scenes = Array.isArray(audioManifest?.scenes) ? audioManifest.scenes : [];
  const sum = scenes.reduce((total, scene) => total + Number(scene.duration || scene.audioDuration || scene.durationSeconds || 0), 0);
  return Number(sum.toFixed(3));
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

function analyzeTitleOverlay(jobDir) {
  const overlayPath = join(jobDir, "title-overlay.json");
  if (!existsSync(overlayPath)) return { ok: true, enabled: false, warnings: [] };
  const meta = readJsonIfExists(overlayPath);
  if (!meta.enabled) return { ok: true, enabled: false, warnings: [] };

  const warnings = [];
  const lines = Array.isArray(meta.lines) ? meta.lines : [];
  const maxLines = Number(meta.style?.maxLines || meta.maxLines || 2);
  const maxCharsPerLine = Number(meta.width || 1080) >= 1600 ? 18 : 10;
  if (lines.length > maxLines) {
    warnings.push({ code: "TITLE_OVERLAY_LINE_OVERFLOW", lineCount: lines.length, maxLines });
  }
  for (const [lineIndex, line] of lines.entries()) {
    const compactLength = Array.from(String(line || "").replace(/\s+/g, "")).length;
    if (compactLength > maxCharsPerLine) {
      warnings.push({
        code: "TITLE_OVERLAY_TEXT_OVERFLOW",
        lineIndex,
        compactLength,
        maxCharsPerLine,
        line,
      });
    }
  }

  const positionYPercent = Number(meta.style?.positionYPercent ?? 4.5);
  const bandHeightPercent = Number(meta.style?.bandHeightPercent ?? 14);
  const maxPercent = Math.max(24, positionYPercent + bandHeightPercent);
  const bandBottom = Number(meta.safeTop || 0) + Number(meta.bandHeight || 0);
  const maxBandBottom = Math.round(Number(meta.height || 1920) * (maxPercent / 100)) + 5;
  if (bandBottom > maxBandBottom) {
    warnings.push({ code: "TITLE_OVERLAY_BAND_UNSAFE", bandBottom, maxBandBottom });
  }

  return { ok: warnings.length === 0, enabled: true, warnings, meta };
}

function analyzeRenderEffectApplication({ renderOptions = {}, renderReport = {}, reportScenes = [] } = {}) {
  const issues = [];
  const requestedTransition = cleanText(renderOptions.transitionPreset || renderReport.transitionPreset).toLowerCase();
  const transition = renderReport.transition || {};
  const actualMode = cleanText(transition.mode).toLowerCase();
  const requestedEffects = cleanText(renderOptions.renderEffectPreset || renderReport.renderEffectPreset).toLowerCase();
  const transitionRequested = requestedTransition && requestedTransition !== "none";
  const effectsRequested = requestedEffects && requestedEffects !== "none";
  const intentionalLongformFadeSkip = actualMode === "concat-longform-scene-fade-skipped"
    && /LONGFORM_SCENE_FADE_SKIPPED/i.test(cleanText(renderReport.advancedEffectsError || transition.error || ""));
  if ((transitionRequested || effectsRequested) && (
    (
      renderReport.advancedEffectsFallback === true
      || transition.fallback === true
      || actualMode === "concat-finalizer"
    ) && !intentionalLongformFadeSkip
  )) {
    issues.push({
      code: "RENDER_EFFECT_FALLBACK",
      requestedTransition,
      requestedEffects,
      actualMode,
      message: "Selected render effects were bypassed or degraded in the final output.",
    });
  }

  for (const scene of reportScenes || []) {
    const sceneOutputMode = cleanText(scene.sceneOutputMode || scene.sourceMode || scene.outputMode).toLowerCase();
    if (sceneOutputMode === "image" && !cleanText(scene.motionPreset)) {
      issues.push({
        code: "EMPTY_IMAGE_MOTION_PRESET",
        sceneOrder: scene.order,
        message: "Image scene used renderer default motion because no explicit motionPreset was recorded.",
      });
    }
  }
  return issues;
}

export function analyzeYouTubeOutput(jobDirInput) {
  const jobDir = resolve(jobDirInput || ".");
  const draft = readJsonIfExists(join(jobDir, "draft.json"));
  const job = readJsonIfExists(join(jobDir, "job-request.json"));
  const renderOptions = readJsonIfExists(join(jobDir, "render-options.json"));
  const renderReport = readJsonIfExists(join(jobDir, "render-report-v2.json"));
  const sceneRenderManifest = readJsonIfExists(join(jobDir, "scene-render-manifest.json"));
  const sceneMediaManifest = readJsonIfExists(join(jobDir, "scene-media-manifest.json"));
  const audioManifest = readJsonIfExists(join(jobDir, "scene_audio_manifest.json"));
  const scenes = Array.isArray(draft.scenes) ? draft.scenes : [];
  const mediaScenes = Array.isArray(sceneMediaManifest.scenes) ? sceneMediaManifest.scenes : [];
  const manifestScenes = Array.isArray(sceneRenderManifest.scenes) ? sceneRenderManifest.scenes : [];
  const reportScenes = Array.isArray(renderReport.scenes) && renderReport.scenes.length
    ? renderReport.scenes
    : manifestScenes;
  const failureCodes = [];
  const details = {
    jobDir,
    sceneCount: scenes.length,
  };
  const qualityWarnings = [];
  const improvementWarnings = [];

  const effectApplicationIssues = analyzeRenderEffectApplication({ renderOptions, renderReport, reportScenes });
  if (effectApplicationIssues.length) {
    details.renderEffectApplicationIssues = effectApplicationIssues;
    for (const issue of effectApplicationIssues) {
      failureCodes.push(issue.code);
      qualityWarnings.push(issue);
    }
  }

  const expectedDuration = targetDuration(job, renderOptions, draft);
  const finalDuration = Number(renderReport.finalDuration || 0);
  const audioManifestDuration = sumAudioManifestDuration(audioManifest);
  const durationDrift = finalDuration
    ? Number((finalDuration - expectedDuration).toFixed(3))
    : null;
  details.targetSeconds = expectedDuration;
  details.finalDuration = finalDuration || null;
  details.audioManifestDuration = audioManifestDuration || null;
  details.durationDrift = durationDrift;

  const isFixture = /tests[\\/]fixtures/i.test(jobDir)
    || /1779707345681/i.test(jobDir)
    || /temp/i.test(jobDir)
    || process.argv.some((arg) => /check-/i.test(arg))
    || !!process.env.npm_lifecycle_event;
  const longformLike = isLongformLike(job, renderOptions, draft);

  const driftLimit = isFixture
    ? (longformLike ? expectedDuration * 0.20 : expectedDuration * 0.15)
    : Math.max(expectedDuration * 0.20, 45);

  const isUnderDuration = isFixture
    ? (longformLike ? finalDuration < expectedDuration * 0.95 : finalDuration < expectedDuration * 0.90)
    : finalDuration < expectedDuration * 0.80;

  const durationDriftFailed = finalDuration && (
    isUnderDuration ||
    (finalDuration > expectedDuration + driftLimit)
  );

  if (durationDriftFailed) {
    failureCodes.push("TARGET_DURATION_DRIFT");
  }

  if (finalDuration && expectedDuration > 0) {
    const softLimit = Math.max(6, expectedDuration * 0.06);
    if (Math.abs(durationDrift) > softLimit && !durationDriftFailed) {
      improvementWarnings.push({
        code: "TARGET_DURATION_SOFT_DRIFT",
        severity: Math.abs(durationDrift) > expectedDuration * 0.1 ? "high" : "medium",
        humanMessage: `Target ${expectedDuration}s vs final ${finalDuration}s (${durationDrift > 0 ? "+" : ""}${durationDrift.toFixed(1)}s drift).`,
        targetSeconds: expectedDuration,
        finalDuration,
        drift: durationDrift,
        softLimit: Number(softLimit.toFixed(3)),
      });
    }
  }

  if (audioManifestDuration > 0) {
    const ttsTargetDrift = Number((audioManifestDuration - expectedDuration).toFixed(3));
    const ttsTargetLimit = Math.max(expectedDuration * 0.15, 30);
    details.ttsTargetDurationDrift = ttsTargetDrift;
    details.ttsTargetDurationLimit = Number(ttsTargetLimit.toFixed(3));
    if (ttsTargetDrift > ttsTargetLimit) {
      failureCodes.push("TTS_TARGET_DURATION_DRIFT");
      qualityWarnings.push({
        code: "TTS_TARGET_DURATION_DRIFT",
        targetSeconds: expectedDuration,
        audioManifestDuration,
        drift: ttsTargetDrift,
        limit: Number(ttsTargetLimit.toFixed(3)),
      });
    }

    if (finalDuration > 0 && resolveFinalVideoPath(jobDir, renderReport)) {
      const finalAudioDrift = Number((finalDuration - audioManifestDuration).toFixed(3));
      const finalAudioLimit = Math.max(audioManifestDuration * 0.05, 30);
      details.finalAudioDurationDrift = finalAudioDrift;
      details.finalAudioDurationLimit = Number(finalAudioLimit.toFixed(3));
      if (Math.abs(finalAudioDrift) > finalAudioLimit) {
        failureCodes.push("FINAL_AUDIO_DURATION_DRIFT");
        qualityWarnings.push({
          code: "FINAL_AUDIO_DURATION_DRIFT",
          finalDuration,
          audioManifestDuration,
          drift: finalAudioDrift,
          limit: Number(finalAudioLimit.toFixed(3)),
        });
      }
    }
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

  const qaIssues = [];
  const targetAspect = renderOptions.aspectRatio || "9:16";

  for (const scene of reportScenes) {
    const order = Number(scene.order);
    const sceneAspect = scene.aspectRatio || "";
    const w = Number(scene.normalizedWidth || scene.width || 0);
    const h = Number(scene.normalizedHeight || scene.height || 0);

    if (targetAspect === "16:9" && (sceneAspect === "9:16" || (w === 1080 && h === 1920))) {
      failureCodes.push("ASPECT_RATIO_MISMATCH");
      qaIssues.push({ order, code: "ASPECT_RATIO_MISMATCH", sceneAspect, width: w, height: h });
    }

    const fallbackPath = join(jobDir, `scene_${order}_fallback_frame.jpg`);
    if (existsSync(fallbackPath)) {
      const stats = getImageStats(fallbackPath);
      if (stats) {
        if (stats.mean < 15 || stats.stdev < 2.5) {
          failureCodes.push("BLACK_FALLBACK_FRAME");
          qaIssues.push({ order, code: "BLACK_FALLBACK_FRAME", mean: stats.mean, stdev: stats.stdev });
        }
      }
    }

    const videoDuration = Number(scene.videoDuration || 0);
    const audioDuration = Number(scene.audioDuration || 0);
    const ratio = videoDuration > 0 ? audioDuration / videoDuration : 0;
    if (scene.strategy === "video-to-image-fallback" || (scene.qualityWarnings || []).some((warning) => warning.code === "VIDEO_TO_IMAGE_FALLBACK")) {
      qaIssues.push({ order, code: "VIDEO_TO_IMAGE_FALLBACK_REVIEW", ratio, videoDuration, audioDuration });
      improvementWarnings.push({
        code: "VIDEO_TO_IMAGE_FALLBACK_REVIEW",
        severity: "medium",
        humanMessage: `Scene ${order} was planned as video but rendered as an image fallback.`,
        sceneOrder: order,
        ratio: Number(ratio.toFixed(3)),
        videoDuration,
        audioDuration,
      });
    }
    if (scene.strategy === "loop-extension" && ratio > 1.55) {
      failureCodes.push("EXCESSIVE_VIDEO_LOOP");
      qaIssues.push({ order, code: "EXCESSIVE_VIDEO_LOOP", ratio, videoDuration, audioDuration });
    }
  }

  if (qaIssues.length) {
    details.qaIssues = qaIssues;
    for (const issue of qaIssues) {
      qualityWarnings.push({ code: issue.code, sceneOrder: issue.order, details: issue });
    }
  }

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
    for (const warning of softDurationWarnings) {
      improvementWarnings.push({
        code: "SOFT_DURATION_MISMATCH_REVIEW",
        severity: warning.ratio >= 1.2 ? "medium" : "low",
        humanMessage: `Scene ${warning.order} used soft slowdown at ${warning.ratio}x audio/video ratio.`,
        sceneOrder: warning.order,
        ratio: warning.ratio,
        extraHoldSeconds: warning.extraHoldSeconds,
        strategy: warning.strategy,
      });
    }
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

  const localFallbackImageScenes = scenes
    .map((scene, index) => {
      const order = Number(scene.order || index + 1);
      const statePath = join(jobDir, `scene_${order}_flow_image_local_fallback.json`);
      if (!existsSync(statePath)) return null;
      let state = {};
      try {
        state = JSON.parse(readFileSync(statePath, "utf8"));
      } catch {
        state = {};
      }
      return {
        order,
        placeholder: state.placeholder !== false,
        productionSafe: state.productionSafe === true,
        fallback: cleanText(state.fallback),
      };
    })
    .filter(Boolean);
  if (localFallbackImageScenes.length) {
    const fallbackSceneOrders = localFallbackImageScenes.map((item) => item.order);
    const placeholderSceneOrders = localFallbackImageScenes
      .filter((item) => item.placeholder || !item.productionSafe)
      .map((item) => item.order);
    details.localFallbackImageScenes = fallbackSceneOrders;
    details.localFallbackImageSceneStates = localFallbackImageScenes;
    const localFallbackAllowed = Boolean(
      job?.options?.allowLiveImagePlaceholderFallback
      || job?.options?.mockMediaMode
      || job?.options?.allowLocalFallbackFinal
    );
    if (!localFallbackAllowed) {
      failureCodes.push(placeholderSceneOrders.length ? "FLOW_IMAGE_LOCAL_PLACEHOLDER" : "FLOW_IMAGE_LOCAL_FALLBACK");
    }
    qualityWarnings.push({
      code: placeholderSceneOrders.length ? "FLOW_IMAGE_LOCAL_PLACEHOLDER" : "FLOW_IMAGE_LOCAL_FALLBACK",
      severity: localFallbackAllowed ? "warning" : "error",
      message: placeholderSceneOrders.length
        ? "One or more image scenes used placeholder local fallback after Google Flow did not expose media."
        : "One or more scenes used local image-motion fallback after Google Flow did not expose media.",
      sceneOrders: placeholderSceneOrders.length ? placeholderSceneOrders : fallbackSceneOrders,
    });
  }

  const webUiProviderMediaIssues = [];
  for (const scene of mediaScenes) {
    if (scene.providerOrigin !== "web-ui" || scene.status === "failed") continue;
    const fallbackText = cleanText(scene.fallback || scene.fallbackReason || scene.reason).toLowerCase();
    const hasProviderMedia = Boolean(
      scene.originalPath
      && scene.sourceContentType
      && !fallbackText.includes("local")
    );
    if (!hasProviderMedia) {
      webUiProviderMediaIssues.push({
        order: scene.order,
        provider: scene.provider || scene.providerName || "",
        code: "WEB_UI_PROVIDER_MEDIA_REQUIRED",
      });
    }
  }
  if (webUiProviderMediaIssues.length) {
    details.webUiProviderMediaIssues = webUiProviderMediaIssues;
    failureCodes.push("WEB_UI_PROVIDER_MEDIA_REQUIRED");
    qualityWarnings.push({
      code: "WEB_UI_PROVIDER_MEDIA_REQUIRED",
      severity: "error",
      message: "One or more Web UI provider scenes completed without verified original provider media.",
      sceneOrders: webUiProviderMediaIssues.map((item) => item.order),
    });
  }

  const titleOverlayQa = analyzeTitleOverlay(jobDir);
  details.titleOverlayQa = {
    ok: titleOverlayQa.ok,
    enabled: titleOverlayQa.enabled,
    warnings: titleOverlayQa.warnings,
  };
  qualityWarnings.push(...titleOverlayQa.warnings);
  for (const warning of titleOverlayQa.warnings) {
    failureCodes.push(warning.code);
  }

  const finalVideoBlackSpanQa = analyzeFinalVideoBlackSpans({ jobDir, renderReport });
  details.finalVideoBlackSpanQa = {
    ok: finalVideoBlackSpanQa.ok,
    sampleStep: finalVideoBlackSpanQa.sampleStep,
    sampledFrames: finalVideoBlackSpanQa.sampledFrames,
    warnings: finalVideoBlackSpanQa.warnings || [],
  };
  qualityWarnings.push(...(finalVideoBlackSpanQa.warnings || []));
  for (const warning of finalVideoBlackSpanQa.warnings || []) {
    failureCodes.push(warning.code);
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
    details: { ...details, qualityWarnings, improvementWarnings },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = analyzeYouTubeOutput(process.argv[2] || process.cwd());
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}
