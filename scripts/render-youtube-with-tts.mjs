#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { getMediaDuration, getSrtEndTime } from "./media-probe.mjs";
import { classifyDurationSyncPolicy } from "./render-duration-policy.mjs";
import { buildXfadeFilterGraph, validateXfadePlan } from "../electron/services/timeline-transition-renderer.mjs";
import { getTransitionConfig } from "../electron/services/render-effect-presets.mjs";
import { renderStableImageSequenceClip } from "../electron/services/stable-image-sequence-renderer.mjs";
import { getTitleOverlayPreset } from "../electron/services/title-overlay-presets.mjs";

const ROOT = "C:/Users/amd/hermes";
const TTS_ROOT = "C:/Users/amd/supertonic3-local-tts-20260517-r4/supertonic3-local-tts";
const PY_TTS = `${TTS_ROOT}/.venv-win/Scripts/python.exe`;
const JOB_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : `${ROOT}/outputs/youtube/1779594807781-8151113796-700001`;
const FINAL_NAME = process.env.HERMES_YOUTUBE_FINAL_NAME || "final-youtube-ai-news-tts-subtitled-v2.mp4";
function parseStillImageFps(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { fps: 30, warning: "INVALID_STILL_IMAGE_FPS_DEFAULTED" };
  }
  return { fps: Math.max(24, Math.min(60, Math.round(parsed))), warning: null };
}

const STILL_IMAGE_FPS_CONFIG = parseStillImageFps(process.env.HERMES_STILL_IMAGE_FPS || 30);
const STILL_IMAGE_FPS = STILL_IMAGE_FPS_CONFIG.fps;
const RENDER_OPTIONS_PATH = join(JOB_DIR, "render-options.json");
const RENDER_OPTIONS = existsSync(RENDER_OPTIONS_PATH)
  ? JSON.parse(readFileSync(RENDER_OPTIONS_PATH, "utf8"))
  : {};
const STABLE_KEN_BURNS_STRENGTH = String(
  process.env.HERMES_STABLE_KEN_BURNS_STRENGTH
    || RENDER_OPTIONS.motionIntensity
    || "light",
).toLowerCase();
const transitionPreset = RENDER_OPTIONS.transitionPreset || "scene-fade";
const transitionConfig = getTransitionConfig({
  transitionPreset,
  transitionSeconds: Number(RENDER_OPTIONS.transitionSeconds || 0.3),
});
const TARGET_ASPECT_RATIO = RENDER_OPTIONS.aspectRatio === "16:9" ? "16:9" : "9:16";
const TARGET_WIDTH = TARGET_ASPECT_RATIO === "16:9" ? 1920 : 1080;
const TARGET_HEIGHT = TARGET_ASPECT_RATIO === "16:9" ? 1080 : 1920;
const TARGET_VIDEO_FILTER = `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=increase,crop=${TARGET_WIDTH}:${TARGET_HEIGHT},setsar=1`;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: "utf8",
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", ...(options.env || {}) },
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed\nARGS: ${args.join(" ")}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

function ts(seconds) {
  const whole = Math.floor(seconds);
  const ms = Math.round((seconds - whole) * 1000);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function escapeFilterPath(path) {
  return path.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function subtitleForceStyle() {
  const ass = RENDER_OPTIONS.subtitleAss || {};
  const style = {
    FontName: ass.fontName || "Malgun Gothic",
    FontSize: Math.max(8, Math.min(12, Number(ass.fontSize || 11))),
    PrimaryColour: ass.primaryColour || "&H00FFFFFF",
    OutlineColour: ass.outlineColour || "&H00000000",
    BorderStyle: 1,
    Outline: Math.max(0, Math.min(3, Number(ass.outline ?? 2))),
    Shadow: Number(ass.shadow ?? 1),
    Alignment: Number(ass.alignment || 2),
    MarginV: Math.max(60, Math.min(150, Number(ass.marginV || 90))),
  };
  return Object.entries(style).map(([key, value]) => `${key}=${value}`).join(",");
}

function splitLongToken(token, maxChars) {
  const chunks = [];
  const chars = Array.from(token);
  for (let i = 0; i < chars.length; i += maxChars) {
    chunks.push(chars.slice(i, i + maxChars).join(""));
  }
  return chunks;
}

function escapeXml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compactTitleText(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[|｜].*$/u, "")
    .slice(0, 80);
}

function wrapTitle(text, maxChars, maxLines) {
  const lines = [];
  const tokens = compactTitleText(text).split(/(\s+)/u).filter(Boolean);
  let current = "";
  for (const token of tokens) {
    const next = current ? `${current}${token}` : token.trimStart();
    if (Array.from(next).length > maxChars && current.trim()) {
      lines.push(current.trim());
      current = token.trimStart();
    } else {
      current = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (current.trim() && lines.length < maxLines) lines.push(current.trim());
  return lines.flatMap((line) => {
    if (Array.from(line).length <= maxChars) return [line];
    const chunks = [];
    const chars = Array.from(line);
    for (let i = 0; i < chars.length; i += maxChars) chunks.push(chars.slice(i, i + maxChars).join(""));
    return chunks;
  }).slice(0, maxLines).filter(Boolean);
}

function gradientStopsSvg() {
  return [
    '<stop offset="0" stop-color="#000000" stop-opacity="0.78"/>',
    '<stop offset="1" stop-color="#000000" stop-opacity="0"/>',
  ].join("");
}

function svgOpacity(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(0, Math.min(1, parsed));
}

async function createTitleOverlayImage({ draftTitle, outputPath }) {
  const overlay = RENDER_OPTIONS.titleOverlay || {};
  if (!overlay.enabled) return null;
  const title = compactTitleText(overlay.text || draftTitle);
  if (!title) return null;
  const preset = getTitleOverlayPreset(overlay.styleId);
  const isLandscape = TARGET_ASPECT_RATIO === "16:9";
  const safeTop = Math.max(0, Math.min(isLandscape ? 90 : 160, Number(overlay.safeTop ?? (isLandscape ? 40 : 84))));
  const bandHeight = isLandscape ? 150 : 260;
  const fontSize = isLandscape ? 64 : 86;
  const maxChars = isLandscape ? 19 : 13;
  const lines = wrapTitle(title, maxChars, Number(overlay.maxLines || 2));
  const textY = safeTop + Math.round(bandHeight * 0.34);
  const lineHeight = Math.round(fontSize * 1.08);
  const lineSvg = lines.map((line, index) => {
    const fill = index === 0 && preset.accent ? preset.accent : preset.primary;
    return `<text x="${TARGET_WIDTH / 2}" y="${textY + index * lineHeight}" text-anchor="middle" font-family="Malgun Gothic, Arial, sans-serif" font-size="${fontSize}" font-weight="900" fill="${fill}" stroke="${preset.outline}" stroke-opacity="${svgOpacity(preset.outlineOpacity)}" stroke-width="8" paint-order="stroke fill">${escapeXml(line)}</text>`;
  }).join("");
  const bg = preset.id === "minimal-shadow"
    ? `<rect x="0" y="0" width="${TARGET_WIDTH}" height="${safeTop + bandHeight}" fill="url(#topFade)"/>`
    : `<rect x="0" y="${safeTop}" width="${TARGET_WIDTH}" height="${bandHeight}" fill="${preset.background}" fill-opacity="${svgOpacity(preset.backgroundOpacity)}" rx="0"/>`;
  const svg = `<svg width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}" viewBox="0 0 ${TARGET_WIDTH} ${TARGET_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">${gradientStopsSvg()}</linearGradient></defs>
    ${bg}
    ${lineSvg}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  const metadata = {
    enabled: true,
    title,
    styleId: preset.id,
    outputPath,
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    safeTop,
    bandHeight,
    lines,
  };
  writeFileSync(join(JOB_DIR, "title-overlay.json"), JSON.stringify(metadata, null, 2), "utf8");
  return outputPath;
}

function subtitleTokens(text) {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .flatMap((token) => {
      const clean = token.trim();
      if (!clean) return [];
      const maxLineChars = Number(RENDER_OPTIONS.subtitleAss?.maxLineChars || 11);
      return Array.from(clean).length > maxLineChars ? splitLongToken(clean, maxLineChars) : [clean];
    });
}

function wrapSubtitle(text, maxChars = Number(RENDER_OPTIONS.subtitleAss?.maxLineChars || 11), maxLines = Number(RENDER_OPTIONS.subtitleAss?.maxLines || 2)) {
  const words = subtitleTokens(text);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines).join("\n");
}

function splitSubtitleChunks(text) {
  const maxChars = Number(RENDER_OPTIONS.subtitleAss?.maxLineChars || 11);
  const maxLines = Number(RENDER_OPTIONS.subtitleAss?.maxLines || 2);
  const maxChunkChars = Math.max(maxChars, maxChars * maxLines - 2);
  const words = subtitleTokens(text);
  const chunks = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (Array.from(next).length > maxChunkChars && current) {
      chunks.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [String(text || "").trim()].filter(Boolean);
}

function subtitleCueBlocks({ text, start, duration, firstIndex }) {
  const chunks = splitSubtitleChunks(text);
  const cueDuration = duration / chunks.length;
  return chunks.map((chunk, index) => {
    const cueStart = start + cueDuration * index;
    const cueEnd = index === chunks.length - 1 ? start + duration : start + cueDuration * (index + 1);
    return `${firstIndex + index}\n${ts(cueStart)} --> ${ts(cueEnd)}\n${wrapSubtitle(chunk)}\n`;
  });
}

function fallbackScenes() {
  return [
    { order: 1, narration: "오늘은 최신 AI 뉴스 흐름을 빠르게 정리해보겠습니다." },
    { order: 2, narration: "AI는 챗봇을 넘어 업무 자동화, 영상 제작, 검색, 코딩 도구까지 빠르게 확장되고 있습니다." },
    { order: 3, narration: "기업들은 AI를 활용해 반복 업무를 줄이고 개인 맞춤형 서비스를 더 정교하게 제공하고 있습니다." },
    { order: 4, narration: "창작 분야에서는 이미지, 영상, 음악, 글쓰기 도구가 연결되며 제작 속도가 크게 빨라지고 있습니다." },
    { order: 5, narration: "하지만 AI가 빨라질수록 저작권, 개인정보, 가짜 정보 문제도 함께 중요해지고 있습니다." },
    { order: 6, narration: "핵심은 AI를 무조건 믿는 것이 아니라 좋은 도구로 다루는 능력입니다." },
  ];
}

function looksLikeCorruptKorean(text) {
  const value = String(text || "");
  if (!value.trim()) return true;
  const hangulCount = (value.match(/[가-힣]/g) || []).length;
  const questionCount = (value.match(/\?/g) || []).length;
  const koreanSignal = hangulCount / Math.max(value.length, 1);
  const mojibakeSignal = /[�李理吏紐留硫利]|[-]/.test(value);
  if (questionCount >= 2) return true;
  return mojibakeSignal || koreanSignal < 0.08;
}

function loadScenes() {
  const draftPath = join(JOB_DIR, "draft.json");
  if (existsSync(draftPath)) {
    const draft = JSON.parse(readFileSync(draftPath, "utf8"));
    if (Array.isArray(draft.scenes) && draft.scenes.length) {
      const scenes = draft.scenes.map((scene, index) => ({
        order: Number(scene.order || index + 1),
        narration: String(scene.narration || scene.text || "").trim(),
        outputMode: scene.outputMode || scene.flowOutputMode || "video",
        flowOutputMode: scene.flowOutputMode || scene.outputMode || "video",
        motionPreset: scene.motionPreset || "",
      })).filter((scene) => scene.narration);
      if (scenes.length && scenes.every((scene) => !looksLikeCorruptKorean(scene.narration))) {
        return scenes;
      }
      console.warn("draft.json narration looks corrupted; using curated Korean fallback script.");
    }
  }

  return fallbackScenes();
}

function imageSceneSource(order) {
  const candidates = [
    join(JOB_DIR, `scene_${order}_flow.jpg`),
    join(JOB_DIR, `scene_${order}_flow.jpeg`),
    join(JOB_DIR, `scene_${order}_flow.png`),
    join(JOB_DIR, `scene_${order}_flow.webp`),
  ];
  return candidates.find((item) => existsSync(item)) || "";
}

async function renderStillImageSceneVideo({ imagePath, audioPath, audioDuration, order, motionPreset }) {
  const adjustedVideo = join(JOB_DIR, `scene_${order}_video_adjusted.mp4`);
  const finalScene = join(JOB_DIR, `scene_${order}_synced.mp4`);
  const sequenceResult = await renderStableImageSequenceClip({
    ffmpegBin: ffmpegPath,
    imagePath,
    outputPath: adjustedVideo,
    durationSeconds: audioDuration,
    order,
    motionPreset,
    motionStrength: STABLE_KEN_BURNS_STRENGTH,
    fps: STILL_IMAGE_FPS,
    outputWidth: TARGET_WIDTH,
    outputHeight: TARGET_HEIGHT,
    jobDir: JOB_DIR,
    keepFrames: process.env.HERMES_KEEP_MOTION_FRAMES === "1",
  });

  run(ffmpegPath, [
    "-y",
    "-i", adjustedVideo,
    "-i", audioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-t", String(audioDuration),
    "-movflags", "+faststart",
    finalScene,
  ]);

  return {
    order,
    finalScene,
    videoDuration: audioDuration,
    audioDuration,
    ratio: 1,
    strategy: "stable-image-sequence",
    stillImageFps: sequenceResult.fps,
    motionStrategy: "stable-sequence-ken-burns",
    motionStrength: sequenceResult.motionStrength,
    motionPreset,
    imagePath,
    imageSourcePath: imagePath,
    frameCount: sequenceResult.frameCount,
    uniqueFrameCount: sequenceResult.uniqueFrameCount,
    framesPerMotionStep: sequenceResult.framesPerMotionStep,
    duplicateHoldFrames: sequenceResult.duplicateHoldFrames,
    frameDurationSeconds: sequenceResult.frameDurationSeconds,
    audioDurationSeconds: sequenceResult.audioDurationSeconds,
    durationDriftSeconds: sequenceResult.durationDriftSeconds,
    sequenceManifestPath: sequenceResult.sequenceManifestPath,
    cachePolicy: sequenceResult.cachePolicy,
    cacheCleaned: sequenceResult.cacheCleaned,
    durationPolicy: "image-sequence-match-audio",
    extraHoldSeconds: 0,
    qualityWarnings: [
      ...(STILL_IMAGE_FPS_CONFIG.warning ? [{ code: STILL_IMAGE_FPS_CONFIG.warning, sceneOrder: order }] : []),
      ...(sequenceResult.warnings || []),
    ],
    requiresRegeneration: false,
  };
}

async function renderSceneVideo({ rawVideo, audioPath, audioDuration, order, outputMode, motionPreset }) {
  const isImageMode = String(outputMode || "").toLowerCase() === "image";
  const stillImagePath = isImageMode ? imageSceneSource(order) : "";
  if (stillImagePath) {
    return renderStillImageSceneVideo({ imagePath: stillImagePath, audioPath, audioDuration, order, motionPreset });
  }
  const imageModeStillMissingWarning = isImageMode
    ? [{
      code: "IMAGE_MODE_STILL_SOURCE_MISSING",
      sceneOrder: order,
      message: "Image mode requested but no Flow still source was found; renderer used the raw scene media fallback.",
    }]
    : [];

  const videoDuration = getMediaDuration(rawVideo);
  const adjustedVideo = join(JOB_DIR, `scene_${order}_video_adjusted.mp4`);
  const finalScene = join(JOB_DIR, `scene_${order}_synced.mp4`);
  const ratio = audioDuration / videoDuration;
  const policy = classifyDurationSyncPolicy({ order, videoDuration, audioDuration, outputMode });

  if (policy.requiresRegeneration) {
    const failure = {
      ok: false,
      failureCode: policy.failureCode,
      failedSceneOrder: policy.failedSceneOrder,
      ratio: policy.ratio,
      extraHoldSeconds: policy.extraHoldSeconds,
      qualityWarnings: policy.qualityWarnings,
      freezeRisk: "high",
      requiresRegeneration: true,
      suggestedRecovery: "Split this scene narration or generate an additional Flow B-roll clip before rendering.",
    };
    writeFileSync(join(JOB_DIR, "render-report-v2.json"), JSON.stringify(failure, null, 2), "utf8");
    console.error(JSON.stringify(failure, null, 2));
    throw new Error(`RENDER_QA_FAILURE: ${failure.failureCode} scene=${failure.failedSceneOrder} ratio=${failure.ratio}`);
  }

  if (policy.strategy === "setpts" || policy.strategy === "slowdown-loop") {
    const setpts = ratio.toFixed(6);
    run(ffmpegPath, [
      "-y",
      "-i", rawVideo,
      "-an",
      "-vf", `setpts=${setpts}*PTS,${TARGET_VIDEO_FILTER}`,
      "-t", String(audioDuration),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      adjustedVideo,
    ]);
  } else {
    run(ffmpegPath, [
      "-y",
      "-i", rawVideo,
      "-an",
      "-t", String(audioDuration),
      "-vf", TARGET_VIDEO_FILTER,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      adjustedVideo,
    ]);
  }

  run(ffmpegPath, [
    "-y",
    "-i", adjustedVideo,
    "-i", audioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-t", String(audioDuration),
    "-movflags", "+faststart",
    finalScene,
  ]);

  return {
    order,
    finalScene,
    videoDuration,
    audioDuration,
    ratio,
    strategy: policy.strategy,
    extraHoldSeconds: policy.extraHoldSeconds,
    qualityWarnings: [...imageModeStillMissingWarning, ...policy.qualityWarnings],
    requiresRegeneration: policy.requiresRegeneration,
  };
}

mkdirSync(JOB_DIR, { recursive: true });

const scenes = loadScenes();
const scenesPath = join(JOB_DIR, "tts-scenes-input.json");
writeFileSync(scenesPath, JSON.stringify(scenes, null, 2), "utf8");

run(PY_TTS, [join(ROOT, "scripts/make-scenes-tts.py"), JOB_DIR, scenesPath], { cwd: TTS_ROOT });

const manifest = JSON.parse(readFileSync(join(JOB_DIR, "scene_audio_manifest.json"), "utf8"));
if (!manifest.ok || !Array.isArray(manifest.scenes) || !manifest.scenes.length) {
  throw new Error("Scene TTS manifest is invalid.");
}

let cursor = 0;
const srtBlocks = [];
const concatLines = [];
const renderReport = [];

for (const sceneAudio of manifest.scenes) {
  const order = Number(sceneAudio.order);
  const scene = scenes.find((item) => Number(item.order) === order) || {};
  const rawVideo = join(JOB_DIR, `scene_${order}.mp4`);
  if (!existsSync(rawVideo)) {
    throw new Error(`Missing scene video: ${rawVideo}`);
  }
  const audioPath = resolve(sceneAudio.audio_path);
  const audioDuration = getMediaDuration(audioPath);
  const rendered = await renderSceneVideo({
    rawVideo,
    audioPath,
    audioDuration,
    order,
    outputMode: scene.flowOutputMode || scene.outputMode,
    motionPreset: scene.motionPreset,
  });
  renderReport.push(rendered);
  concatLines.push(`file '${rendered.finalScene.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
  srtBlocks.push(...subtitleCueBlocks({
    text: sceneAudio.text,
    start: cursor,
    duration: audioDuration,
    firstIndex: srtBlocks.length + 1,
  }));
  cursor += audioDuration;
}

const concatPath = join(JOB_DIR, "concat_synced.txt");
const srtPath = join(JOB_DIR, "subtitles-ko-v2.srt");
const mergedPath = join(JOB_DIR, "merged-scenes-synced.mp4");
const finalPath = join(JOB_DIR, FINAL_NAME);
const reportPath = join(JOB_DIR, "render-report-v2.json");
const sceneRenderManifestPath = join(JOB_DIR, "scene-render-manifest.json");
let advancedEffectsFallback = false;
let advancedEffectsError = "";

writeFileSync(concatPath, concatLines.join("\n"), "utf8");
writeFileSync(srtPath, srtBlocks.join("\n"), "utf8");

const shouldTryXfade = transitionConfig.filter === "xfade" && renderReport.length > 1;
if (shouldTryXfade) {
  try {
    const sceneDurations = renderReport.map((item) => item.audioDuration);
    const actualVideoDurations = renderReport.map((item) => getMediaDuration(item.finalScene));
    const validation = validateXfadePlan({
      transitionSeconds: transitionConfig.seconds,
      sceneDurations,
      actualVideoDurations,
    });
    if (!validation.ok) throw new Error(validation.reason);
    buildXfadeFilterGraph({
      sceneCount: renderReport.length,
      transitionName: transitionConfig.transition,
      transitionSeconds: transitionConfig.seconds,
      sceneDurations,
    });
    throw new Error("Xfade visual-tail renderer is not enabled for this build; using safe concat fallback.");
  } catch (error) {
    advancedEffectsFallback = true;
    advancedEffectsError = String(error.message || error);
    run(ffmpegPath, [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", concatPath,
      "-c", "copy",
      mergedPath,
    ]);
  }
} else {
  run(ffmpegPath, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatPath,
    "-c", "copy",
    mergedPath,
  ]);
}

const draftForTitle = existsSync(join(JOB_DIR, "draft.json"))
  ? JSON.parse(readFileSync(join(JOB_DIR, "draft.json"), "utf8"))
  : {};
const titleOverlayPath = join(JOB_DIR, "title-overlay.png");
const createdTitleOverlay = await createTitleOverlayImage({
  draftTitle: draftForTitle.title || "",
  outputPath: titleOverlayPath,
});
const subtitleFilter = `subtitles='${escapeFilterPath(srtPath)}':force_style='${subtitleForceStyle()}'`;
const finalFilterArgs = createdTitleOverlay
  ? [
      "-i", mergedPath,
      "-i", createdTitleOverlay,
      "-filter_complex", `[0:v][1:v]overlay=0:0[v_title];[v_title]${subtitleFilter}[v]`,
      "-map", "[v]",
      "-map", "0:a?",
    ]
  : [
      "-i", mergedPath,
      "-vf", subtitleFilter,
    ];
run(ffmpegPath, [
  "-y",
  ...finalFilterArgs,
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "20",
  "-c:a", "copy",
  "-movflags", "+faststart",
  finalPath,
]);

const finalDuration = getMediaDuration(finalPath);
const subtitleEnd = getSrtEndTime(srtPath);
if (Math.abs(finalDuration - subtitleEnd) > 0.5) {
  throw new Error(`Final duration mismatch: video=${finalDuration}s subtitleEnd=${subtitleEnd}s`);
}

writeFileSync(reportPath, JSON.stringify({
  ok: true,
  jobDir: JOB_DIR,
  finalPath,
  mergedPath,
  srtPath,
  concatPath,
  finalDuration,
  subtitleEnd,
  titleOverlay: createdTitleOverlay
    ? JSON.parse(readFileSync(join(JOB_DIR, "title-overlay.json"), "utf8"))
    : { enabled: false },
  renderEffectPreset: RENDER_OPTIONS.renderEffectPreset || "cinematic",
  aspectRatio: TARGET_ASPECT_RATIO,
  outputWidth: TARGET_WIDTH,
  outputHeight: TARGET_HEIGHT,
  motionIntensity: RENDER_OPTIONS.motionIntensity || "light",
  transitionPreset,
  transitionSeconds: transitionConfig.seconds,
  transition: {
    preset: transitionPreset,
    seconds: transitionConfig.seconds,
    mode: transitionConfig.filter,
    fallback: advancedEffectsFallback,
  },
  advancedEffectsFallback,
  advancedEffectsError,
  qualityWarnings: renderReport.flatMap((item) => item.qualityWarnings || []),
  freezeRisk: renderReport.some((item) => item.requiresRegeneration) ? "high" : "low",
  requiresRegeneration: false,
  scenes: renderReport.map((item) => ({
    ...item,
    finalScene: item.finalScene.replace(/\\/g, "/"),
    motionPreset: scenes.find((scene) => Number(scene.order) === Number(item.order))?.motionPreset || "",
    sceneOutputMode: scenes.find((scene) => Number(scene.order) === Number(item.order))?.outputMode || scenes.find((scene) => Number(scene.order) === Number(item.order))?.flowOutputMode || "video",
  })),
  source: scenes.map((scene) => ({
    ...scene,
    rawVideo: join(JOB_DIR, `scene_${scene.order}.mp4`).replace(/\\/g, "/"),
    file: basename(join(JOB_DIR, `scene_${scene.order}.mp4`)),
    sceneOutputMode: scene.outputMode || scene.flowOutputMode || "video",
    sourceMode: scene.outputMode || scene.flowOutputMode || "video",
  })),
  sceneRenderManifestPath,
}, null, 2), "utf8");

writeFileSync(sceneRenderManifestPath, JSON.stringify({
  ok: true,
  jobDir: JOB_DIR,
  finalPath,
  scenes: renderReport.map((item) => {
    const source = scenes.find((scene) => Number(scene.order) === Number(item.order)) || {};
    const sceneOutputMode = source.outputMode || source.flowOutputMode || "video";
    return {
      order: item.order,
      sourceMode: sceneOutputMode,
      sceneOutputMode,
      rawVideo: join(JOB_DIR, `scene_${item.order}.mp4`).replace(/\\/g, "/"),
      finalScene: item.finalScene.replace(/\\/g, "/"),
      videoDuration: item.videoDuration,
      audioDuration: item.audioDuration,
      strategy: item.strategy,
      stillImageFps: item.stillImageFps,
      motionStrategy: item.motionStrategy,
      motionStrength: item.motionStrength,
      motionPreset: item.motionPreset,
      imageSourcePath: item.imageSourcePath,
      frameCount: item.frameCount,
      uniqueFrameCount: item.uniqueFrameCount,
      framesPerMotionStep: item.framesPerMotionStep,
      duplicateHoldFrames: item.duplicateHoldFrames,
      frameDurationSeconds: item.frameDurationSeconds,
      audioDurationSeconds: item.audioDurationSeconds,
      durationDriftSeconds: item.durationDriftSeconds,
      sequenceManifestPath: item.sequenceManifestPath,
      cachePolicy: item.cachePolicy,
      cacheCleaned: item.cacheCleaned,
      durationPolicy: item.durationPolicy,
    };
  }),
}, null, 2), "utf8");

console.log(JSON.stringify({
  ok: true,
  jobDir: JOB_DIR,
  finalPath,
  srtPath,
  reportPath,
  finalDuration,
  subtitleEnd,
}, null, 2));
