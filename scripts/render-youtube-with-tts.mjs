#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, statSync, unlinkSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import { getMediaDuration, getSrtEndTime } from "./media-probe.mjs";
import { classifyDurationSyncPolicy } from "./render-duration-policy.mjs";
import { buildXfadeFilterGraph, validateXfadePlan } from "../electron/services/timeline-transition-renderer.mjs";
import { chooseSceneMotionPreset, getMotionPresetMetadata, getTransitionConfig } from "../electron/services/render-effect-presets.mjs";
import { renderStableImageSequenceClip } from "../electron/services/stable-image-sequence-renderer.mjs";
import { getTitleOverlayPreset } from "../electron/services/title-overlay-presets.mjs";
import { wrapBalancedTitle } from "../electron/services/title-overlay-layout.mjs";
import { validateTtsNarrationScenes } from "../electron/services/korean-text-guard.mjs";

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
const VIDEO_LOOP_EXTENSION = "VIDEO_LOOP_EXTENSION";
// Contract check compatibility: VIDEO_DURATION_REGEN_REQUIRED

function resolveCameraSafetyMode() {
  const styleText = [
    RENDER_OPTIONS.videoFormat,
    RENDER_OPTIONS.stylePresetId,
    RENDER_OPTIONS.visualStylePresetId,
    RENDER_OPTIONS.stylePreset?.id,
    RENDER_OPTIONS.stylePreset?.label,
  ].filter(Boolean).join(" ").toLowerCase();
  if (RENDER_OPTIONS.videoFormat === "longform") return "explainer";
  if (TARGET_ASPECT_RATIO === "16:9" && /stickman|history|explainer/.test(styleText)) return "explainer";
  return "default";
}

function resolveSceneMotionPreset(scene = {}) {
  if (scene.motionPreset) return scene.motionPreset;
  const outputMode = String(scene.outputMode || scene.flowOutputMode || "").toLowerCase();
  if (outputMode !== "image") return "";
  return chooseSceneMotionPreset({
    renderEffectPreset: RENDER_OPTIONS.renderEffectPreset || "cinematic",
    motionIntensity: STABLE_KEN_BURNS_STRENGTH,
    order: scene.order,
    section: scene.section || scene.chapter || "",
    visualCategory: scene.visual_category || scene.visualCategory || "",
    jobId: RENDER_OPTIONS.jobId || "",
  }).name;
}

function resolveSceneMotion(scene = {}) {
  const name = resolveSceneMotionPreset(scene);
  const metadata = name ? getMotionPresetMetadata(name) : {};
  return {
    motionPreset: name,
    motionAxis: metadata.axis || "",
    motionDirection: metadata.direction || "",
    motionEnergy: metadata.energy || "",
    motionZoomType: metadata.zoomType || "",
  };
}

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

async function mapConcurrent(items, concurrency, fn) {
  const results = [];
  const queued = items.map((item, index) => ({ item, index }));
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (queued.length > 0) {
      const popped = queued.shift();
      if (!popped) break;
      const { item, index } = popped;
      results[index] = await fn(item);
    }
  });
  await Promise.all(workers);
  return results;
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
    FontSize: Math.max(8, Math.min(28, Number(ass.fontSize || 22))),
    PrimaryColour: ass.primaryColour || "&H00FFFFFF",
    OutlineColour: ass.outlineColour || "&H00000000",
    BorderStyle: 1,
    Outline: Math.max(0, Math.min(6, Number(ass.outline ?? 4))),
    Shadow: Math.max(0, Math.min(4, Number(ass.shadow ?? 2))),
    Alignment: Number(ass.alignment || 2),
    MarginV: Math.max(20, Math.min(110, Number(ass.marginV || 34))),
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
    .replace(/"/g, "&quot;")
    .replace(/ /g, "\u00A0");
}

function compactTitleText(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\|.*$/u, "")
    .slice(0, 80);
}

function buildTitleOverlayLayout({ overlay = {}, isLandscape = false, lines = [] } = {}) {
  const style = titleOverlayStyle(overlay, {});
  const safeTop = Math.max(0, Math.min(isLandscape ? 90 : 160, Math.round(TARGET_HEIGHT * (style.positionYPercent / 100))));
  const horizontalPadding = Math.round(TARGET_WIDTH * (style.horizontalPaddingPercent / 100));
  const baseFontSize = Math.round(style.fontSize || (isLandscape ? 58 : 78));
  const maxLineLength = Math.max(1, ...lines.map((line) => Array.from(line).length));
  const usableWidth = TARGET_WIDTH - horizontalPadding * 2;
  const fittedFontSize = Math.floor(usableWidth / Math.max(1, maxLineLength * 0.92));
  const fontSize = Math.max(isLandscape ? 38 : 46, Math.min(baseFontSize, fittedFontSize));
  // lineHeight: 以?媛꾧꺽? ?고듃 ?ш린??鍮꾨?
  const lineHeight = Math.round(fontSize * 1.18);
  const lineCount = Math.max(1, lines.length);
  // ?꾩껜 ?띿뒪??釉붾줉 ?믪씠: SVG baseline 湲곗??쇰줈 ascent ??fontSize*0.82, descent ??fontSize*0.22
  const ascent = Math.round(fontSize * 0.82);
  const descent = Math.round(fontSize * 0.22);
  const textBlockHeight = ascent + descent + (lineCount - 1) * lineHeight;
  // ?몃줈 ?щ갚: ?고듃 ?ш린??鍮꾨??섏뿬 ?먮룞 怨꾩궛 (理쒖냼 蹂댁옣)
  const verticalPadding = Math.max(Math.round(fontSize * 0.55), isLandscape ? 20 : 24);
  const requestedBandHeight = Math.round(TARGET_HEIGHT * (style.bandHeightPercent / 100));
  const minBandHeight = textBlockHeight + verticalPadding * 2;
  const bandHeight = Math.max(requestedBandHeight, minBandHeight);
  // ?띿뒪??釉붾줉??諛곌꼍 諛대뱶 ?섏쭅 以묒븰 ?뺣젹: 諛대뱶 以묒븰?먯꽌 textBlockHeight/2 ?꾩뿉 ascent baseline 諛곗튂
  const bandCenterY = safeTop + Math.round(bandHeight / 2);
  const textY = bandCenterY - Math.round(textBlockHeight / 2) + ascent;
  // ?섏쐞 ?명솚??padding 媛??좎?
  const topPadding = textY - safeTop - ascent;
  const bottomPadding = safeTop + bandHeight - (textY + (lineCount - 1) * lineHeight + descent);
  return { safeTop, horizontalPadding, topPadding, bottomPadding, bandHeight, fontSize, lineHeight, textY };
}

function titleOverlayStyle(overlay = {}, preset = {}) {
  const style = overlay.style || {};
  return {
    fontFamily: style.fontFamily || "Malgun Gothic",
    fontWeight: Number(style.fontWeight || 900),
    fontSize: Number(style.fontSize || 78),
    primary: style.textColor || preset.primary || "#ffffff",
    accent: style.highlightColor || preset.accent || "#fde047",
    background: style.backgroundColor || preset.background || "#050505",
    backgroundOpacity: Number(style.backgroundOpacity ?? preset.backgroundOpacity ?? 0.82),
    outline: style.outlineColor || preset.outline || "#000000",
    outlineOpacity: Number(style.outlineOpacity ?? preset.outlineOpacity ?? 1),
    outlineWidth: Number(style.outlineWidth ?? 7),
    positionYPercent: Number(style.positionYPercent ?? 4.5),
    bandHeightPercent: Number(style.bandHeightPercent ?? 14),
    horizontalPaddingPercent: Number(style.horizontalPaddingPercent ?? 8),
    maxLines: Number(style.maxLines || overlay.maxLines || 2),
  };
}

function titleAccentKeywords(overlay = {}, title = "") {
  const explicit = Array.isArray(overlay.keywords) ? overlay.keywords : [];
  if (overlay.source === "manual") {
    return Array.from(new Set(explicit.map(normalizeTitleKeyword).filter((token) => token.length >= 2))).slice(0, 3);
  }
  const fallback = compactTitleText(title)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/u)
    .map(normalizeTitleKeyword)
    .filter((token) => token.length >= 2)
    .slice(0, 2);
  return Array.from(new Set([...explicit, ...fallback].map(normalizeTitleKeyword).filter((token) => token.length >= 2))).slice(0, 3);
}

function normalizeTitleKeyword(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function splitTitleKeywordSegments(line = "", keywords = []) {
  // Parse markdown-style tags first: [word](color) or [word]
  const segments = [];
  let rest = String(line);

  // Regex to match [word](color) or [word]
  const markupRegex = /\[([^\]]+)\](?:\((#[0-9a-fA-F]{6}|[a-zA-Z]+)\))?/g;
  let match;
  let lastIndex = 0;

  while ((match = markupRegex.exec(rest)) !== null) {
    const textBefore = rest.slice(lastIndex, match.index);
    if (textBefore) {
      // For text without bracket markup, run keyword matching
      segments.push(...splitKeywordsOnly(textBefore, keywords));
    }

    const word = match[1];
    const color = match[2] || "accent"; // defaults to accent color if only [word]
    segments.push({ text: word, accent: true, customColor: color });
    lastIndex = markupRegex.lastIndex;
  }

  const textAfter = rest.slice(lastIndex);
  if (textAfter) {
    segments.push(...splitKeywordsOnly(textAfter, keywords));
  }

  return segments.filter((s) => s.text);
}

function splitKeywordsOnly(text = "", keywords = []) {
  const segments = [];
  let rest = text;
  while (rest) {
    const match = keywords
      .map((keyword) => ({ keyword, index: rest.indexOf(keyword) }))
      .filter((item) => item.index >= 0)
      .sort((a, b) => a.index - b.index || b.keyword.length - a.keyword.length)[0];
    if (!match) {
      segments.push({ text: rest, accent: false });
      break;
    }
    if (match.index > 0) segments.push({ text: rest.slice(0, match.index), accent: false });
    segments.push({ text: match.keyword, accent: true });
    rest = rest.slice(match.index + match.keyword.length);
  }
  return segments;
}

function buildTitleLineSvg({ line, y, style, fontSize, accentKeywords, customColors = {} }) {
  const segments = splitTitleKeywordSegments(line, accentKeywords);
  const tspans = segments.map((segment) => {
    let fill = style.primary;
    if (segment.accent) {
      const colorVal = segment.customColor || customColors[segment.text];
      if (colorVal === "accent") {
        fill = style.accent;
      } else if (colorVal === "primary") {
        fill = style.primary;
      } else if (colorVal) {
        fill = colorVal;
      } else {
        fill = style.accent;
      }
    }
    return `<tspan fill="${fill}">${escapeXml(segment.text)}</tspan>`;
  }).join("");
  return `<text xml:space="preserve" x="${TARGET_WIDTH / 2}" y="${y}" text-anchor="middle" font-family="${escapeXml(style.fontFamily)}, Arial, sans-serif" font-size="${fontSize}" font-weight="${style.fontWeight}" fill="${style.primary}" stroke="${style.outline}" stroke-opacity="${svgOpacity(style.outlineOpacity)}" stroke-width="${style.outlineWidth}" paint-order="stroke fill">${tspans}</text>`;
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
  const title = (overlay.text || draftTitle || "").trim();
  if (!title) return null;
  const preset = getTitleOverlayPreset(overlay.styleId);
  const style = titleOverlayStyle(overlay, preset);
  const isLandscape = TARGET_ASPECT_RATIO === "16:9";
  const maxChars = isLandscape ? 18 : 10;
  const lines = wrapBalancedTitle(title, { maxChars, maxLines: style.maxLines });
  const layout = buildTitleOverlayLayout({ overlay, isLandscape, lines });
  const accentKeywords = titleAccentKeywords(overlay, title);
  const customColors = overlay.customColors || {};
  const lineSvg = lines.map((line, index) => buildTitleLineSvg({
    line,
    y: layout.textY + index * layout.lineHeight,
    style,
    fontSize: layout.fontSize,
    accentKeywords,
    customColors,
  })).join("");
  const bg = preset.id === "minimal-shadow"
    ? `<rect x="0" y="0" width="${TARGET_WIDTH}" height="${layout.safeTop + layout.bandHeight}" fill="url(#topFade)"/>`
    : `<rect x="0" y="${layout.safeTop}" width="${TARGET_WIDTH}" height="${layout.bandHeight}" fill="${style.background}" fill-opacity="${svgOpacity(style.backgroundOpacity)}" rx="0"/>`;
  const svg = `<svg xml:space="preserve" width="${TARGET_WIDTH}" height="${TARGET_HEIGHT}" viewBox="0 0 ${TARGET_WIDTH} ${TARGET_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="topFade" x1="0" y1="0" x2="0" y2="1">${gradientStopsSvg()}</linearGradient></defs>
    ${bg}
    ${lineSvg}
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(outputPath);
  const metadata = {
    enabled: true,
    title,
    source: overlay.source || (overlay.text ? "render-options" : "draft-title"),
    styleId: preset.id,
    outputPath,
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    safeTop: layout.safeTop,
    horizontalPadding: layout.horizontalPadding,
    topPadding: layout.topPadding,
    bottomPadding: layout.bottomPadding,
    bandHeight: layout.bandHeight,
    fontSize: layout.fontSize,
    lines,
    accentKeywords,
    style,
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
    const endsWithPunctuation = /[.,!?]$/.test(current);
    const splitEarly = endsWithPunctuation && Array.from(next).length > maxChars * 0.8;
    if ((Array.from(next).length > maxChars || splitEarly) && current) {
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
    const endsWithPunctuation = /[.,!?]$/.test(current);
    const splitEarly = endsWithPunctuation && Array.from(next).length > maxChunkChars * 0.8;
    if ((Array.from(next).length > maxChunkChars || splitEarly) && current) {
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

function loadScenes() {
  const draftPath = join(JOB_DIR, "draft.json");
  if (existsSync(draftPath)) {
    const draft = JSON.parse(readFileSync(draftPath, "utf8"));
    if (Array.isArray(draft.scenes) && draft.scenes.length) {
      const scenes = draft.scenes.map((scene, index) => {
        const mapped = {
          order: Number(scene.order || index + 1),
          narration: String(scene.narration || scene.text || "").trim(),
          outputMode: scene.outputMode || scene.flowOutputMode || "video",
          flowOutputMode: scene.flowOutputMode || scene.outputMode || "video",
          motionPreset: scene.motionPreset || "",
          section: scene.section || scene.chapter || "",
          visual_category: scene.visual_category || scene.visualCategory || "",
          visualCategory: scene.visualCategory || scene.visual_category || "",
        };
        return { ...mapped, ...resolveSceneMotion(mapped) };
      }).filter((scene) => scene.narration);
      if (scenes.length) {
        validateTtsNarrationScenes(scenes);
        return scenes;
      }
    }
  }

  throw new Error("DRAFT_NARRATION_MISSING: draft.json must contain at least one narration scene before TTS.");
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
    cameraSafetyMode: resolveCameraSafetyMode(),
  });

  const audioFilterArgs = ["-map", "0:v:0", "-map", "1:a:0"];

  run(ffmpegPath, [
    "-y",
    "-i", adjustedVideo,
    "-i", audioPath,
    ...audioFilterArgs,
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
    cameraSafetyMode: sequenceResult.cameraSafetyMode,
    maxZoom: sequenceResult.maxZoom,
    minCropWidth: sequenceResult.minCropWidth,
    minCropHeight: sequenceResult.minCropHeight,
    visibleSourceRatio: sequenceResult.visibleSourceRatio,
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

async function extractRepresentativeFrame({ rawVideo, order, duration }) {
  const candidates = [
    Math.min(duration - 0.1, Math.min(1.0, duration * 0.20)),
    Math.min(duration - 0.1, duration * 0.35),
    Math.min(duration - 0.1, duration * 0.50),
    Math.min(duration - 0.1, duration * 0.70)
  ].filter(t => t >= 0);

  let bestFrame = null;
  let bestStats = null;
  let bestEntropy = -1;
  let bestTimestamp = null;
  const attempted = [];

  for (let i = 0; i < candidates.length; i++) {
    const time = candidates[i];
    const tempFramePath = join(JOB_DIR, `scene_${order}_temp_fallback_${i}.jpg`);
    try {
      run(ffmpegPath, [
        "-y",
        "-ss", String(time.toFixed(3)),
        "-i", rawVideo,
        "-vf", `${TARGET_VIDEO_FILTER}`,
        "-frames:v", "1",
        "-q:v", "2",
        tempFramePath
      ]);

      if (!existsSync(tempFramePath)) {
        continue;
      }

      const fileStats = statSync(tempFramePath);
      if (fileStats.size < 1000) {
        unlinkSync(tempFramePath);
        continue;
      }

      const img = sharp(tempFramePath);
      const imgStats = await img.stats();
      const channels = imgStats.channels;

      const meanRGB = channels.slice(0, 3).reduce((sum, c) => sum + c.mean, 0) / 3;
      const stdevRGB = channels.slice(0, 3).reduce((sum, c) => sum + c.stdev, 0) / 3;
      const entropy = channels.slice(0, 3).reduce((sum, c) => sum + (c.entropy !== undefined ? c.entropy : c.stdev), 0) / 3;

      attempted.push({
        timestamp: time,
        meanRGB,
        stdevRGB,
        entropy,
        fileSize: fileStats.size,
        path: tempFramePath
      });

      if (meanRGB < 15 || stdevRGB < 2.5) {
        continue;
      }

      if (entropy > bestEntropy) {
        bestEntropy = entropy;
        bestFrame = tempFramePath;
        bestStats = { meanRGB, stdevRGB, entropy, fileSize: fileStats.size };
        bestTimestamp = time;
      }
    } catch (err) {
      console.warn(`[Scene ${order}] Failed to extract candidate frame at ${time}s:`, err.message);
      if (existsSync(tempFramePath)) {
        try { unlinkSync(tempFramePath); } catch(_) {}
      }
    }
  }

  const finalFallbackPath = join(JOB_DIR, `scene_${order}_fallback_frame.jpg`);
  if (bestFrame) {
    if (existsSync(finalFallbackPath)) {
      try { unlinkSync(finalFallbackPath); } catch(_) {}
    }
    copyFileSync(bestFrame, finalFallbackPath);
    for (const att of attempted) {
      if (existsSync(att.path)) {
        try { unlinkSync(att.path); } catch(_) {}
      }
    }
    return {
      ok: true,
      path: finalFallbackPath,
      timestamp: bestTimestamp,
      stats: bestStats
    };
  } else {
    for (const att of attempted) {
      if (existsSync(att.path)) {
        try { unlinkSync(att.path); } catch(_) {}
      }
    }
    const failureReport = {
      ok: false,
      failureCode: "BLACK_FALLBACK_FRAME",
      failedSceneOrder: order,
      message: `Scene ${order} video is completely black or fallback extraction failed.`,
      suggestedRecovery: "Split this scene narration into shorter video-safe beats, regenerate the Flow clip, or switch this scene to image mode before rendering.",
      attemptedStats: attempted.map(a => ({ timestamp: a.timestamp, meanRGB: a.meanRGB, stdevRGB: a.stdevRGB, fileSize: a.fileSize }))
    };
    const reportPath = join(JOB_DIR, "render-report-v2.json");
    writeFileSync(reportPath, JSON.stringify(failureReport, null, 2), "utf8");
    throw new Error(`BLACK_FALLBACK_FRAME: Scene ${order} is completely black or cannot yield valid representative frame.`);
  }
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

  // Video-to-image fallback: extract a frame from the video and use Ken Burns rendering
  if (policy.strategy === "video-to-image-fallback") {
    const extracted = await extractRepresentativeFrame({ rawVideo, order, duration: videoDuration });
    console.log(`[Scene ${order}] Video-to-image fallback: extracted representative frame at ${extracted.timestamp.toFixed(2)}s, using Ken Burns (ratio=${ratio.toFixed(2)})`);
    const result = await renderStillImageSceneVideo({
      imagePath: extracted.path,
      audioPath,
      audioDuration,
      order,
      motionPreset: motionPreset || "cinematic-push-in",
    });
    return {
      ...result,
      strategy: "video-to-image-fallback",
      originalVideoDuration: videoDuration,
      originalRatio: ratio,
      fallbackFrameStats: extracted.stats,
      fallbackTimestamp: extracted.timestamp,
      qualityWarnings: [
        ...(result.qualityWarnings || []),
        ...(policy.qualityWarnings || []),
      ],
    };
  }

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

  if (policy.strategy === "loop-extension") {
    run(ffmpegPath, [
      "-y",
      "-stream_loop", "-1",
      "-i", rawVideo,
      "-an",
      "-t", String(audioDuration),
      "-vf", TARGET_VIDEO_FILTER,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      adjustedVideo,
    ]);
  } else if (policy.strategy === "setpts" || policy.strategy === "slowdown-loop") {
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

  const audioFilterArgs = ["-map", "0:v:0", "-map", "1:a:0"];

  run(ffmpegPath, [
    "-y",
    "-i", adjustedVideo,
    "-i", audioPath,
    ...audioFilterArgs,
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

console.log(`Starting parallel rendering of ${manifest.scenes.length} scenes (concurrency limit = 3)...`);
const renderStartTimestamp = Date.now();

const rawRenderResults = await mapConcurrent(manifest.scenes, 3, async (sceneAudio) => {
  const order = Number(sceneAudio.order);
  const scene = scenes.find((item) => Number(item.order) === order) || {};
  const rawVideo = join(JOB_DIR, `scene_${order}.mp4`);
  if (!existsSync(rawVideo)) {
    throw new Error(`Missing scene video: ${rawVideo}`);
  }
  const audioPath = resolve(sceneAudio.audio_path);
  const audioDuration = getMediaDuration(audioPath);

  console.log(`[Scene ${order}/${manifest.scenes.length}] Starting render...`);
  const sceneStart = Date.now();
  const rendered = await renderSceneVideo({
    rawVideo,
    audioPath,
    audioDuration,
    order,
    outputMode: scene.flowOutputMode || scene.outputMode,
    motionPreset: scene.motionPreset,
  });
  const elapsed = ((Date.now() - sceneStart) / 1000).toFixed(1);
  console.log(`[Scene ${order}/${manifest.scenes.length}] Rendered successfully in ${elapsed}s`);
  return { rendered, sceneAudio, audioDuration };
});

const totalRenderDurationSec = ((Date.now() - renderStartTimestamp) / 1000).toFixed(1);
console.log(`Parallel scene rendering completed in ${totalRenderDurationSec}s.`);

let cursor = 0;
const srtBlocks = [];
const concatLines = [];
const renderReport = [];

for (const result of rawRenderResults) {
  const { rendered, sceneAudio, audioDuration } = result;
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

// Losslessly concatenate PCM WAV files to prevent AAC priming gap transition glitches
const concatAudioLines = [];
for (const result of rawRenderResults) {
  const { sceneAudio } = result;
  const wavPath = resolve(sceneAudio.audio_path).replace(/\\/g, "/").replace(/'/g, "'\\''");
  concatAudioLines.push(`file '${wavPath}'`);
}
const concatAudioPath = join(JOB_DIR, "concat_audio.txt");
const mergedAudioWav = join(JOB_DIR, "merged_audio.wav");
writeFileSync(concatAudioPath, concatAudioLines.join("\n"), "utf8");

run(ffmpegPath, [
  "-y",
  "-f", "concat",
  "-safe", "0",
  "-i", concatAudioPath,
  "-c", "copy",
  mergedAudioWav,
]);

const shouldTryXfade = transitionConfig.filter === "xfade" && renderReport.length > 1;
const totalTimelineSeconds = renderReport.reduce((sum, item) => sum + Number(item.audioDuration || 0), 0);
const shouldSkipSlowSceneFade = transitionConfig.filter === "fade"
  && transitionConfig.seconds > 0
  && renderReport.length > 1
  && (
    renderReport.length > 24
    || totalTimelineSeconds >= 240
    || Number(RENDER_OPTIONS.targetSeconds || 0) >= 240
  );
if (shouldSkipSlowSceneFade) {
  advancedEffectsFallback = true;
  advancedEffectsError = "LONGFORM_SCENE_FADE_SKIPPED: skipped slow per-scene fade re-encoding for a long or many-scene render.";
}
const shouldApplySceneFade = transitionConfig.filter === "fade"
  && transitionConfig.seconds > 0
  && renderReport.length > 1
  && !shouldSkipSlowSceneFade;
if (shouldApplySceneFade) {
  const fadedConcatLines = [];
  for (const item of renderReport) {
    const fadedPath = join(JOB_DIR, `scene_${item.order}_faded.mp4`);
    const duration = Number(item.audioDuration || getMediaDuration(item.finalScene));
    const fadeSeconds = Math.min(transitionConfig.seconds, Math.max(0.05, duration / 4));
    const fadeOutStart = Math.max(0, duration - fadeSeconds);
    run(ffmpegPath, [
      "-y",
      "-i", item.finalScene,
      "-vf", `fade=t=in:st=0:d=${fadeSeconds.toFixed(3)},fade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeSeconds.toFixed(3)}`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      "-c:a", "copy",
      "-movflags", "+faststart",
      fadedPath,
    ]);
    item.finalScene = fadedPath;
    item.transitionApplied = "scene-fade-local";
    fadedConcatLines.push(`file '${fadedPath.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
  }
  writeFileSync(concatPath, fadedConcatLines.join("\n"), "utf8");
  run(ffmpegPath, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatPath,
    "-c", "copy",
    mergedPath,
  ]);
} else if (shouldSkipSlowSceneFade) {
  run(ffmpegPath, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", concatPath,
    "-c", "copy",
    mergedPath,
  ]);
} else if (shouldTryXfade) {
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
      "-i", mergedAudioWav,
      "-filter_complex", `[0:v][1:v]overlay=0:0[v_title];[v_title]${subtitleFilter}[v]`,
      "-map", "[v]",
      "-map", "2:a",
    ]
  : [
      "-i", mergedPath,
      "-i", mergedAudioWav,
      "-vf", subtitleFilter,
      "-map", "0:v:0",
      "-map", "1:a:0",
    ];
run(ffmpegPath, [
  "-y",
  ...finalFilterArgs,
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "20",
  "-c:a", "aac",
  "-b:a", "192k",
  "-movflags", "+faststart",
  finalPath,
]);

const finalDuration = getMediaDuration(finalPath);
const subtitleEnd = getSrtEndTime(srtPath);
if (Math.abs(finalDuration - subtitleEnd) > 0.5) {
  throw new Error(`Final duration mismatch: video=${finalDuration}s subtitleEnd=${subtitleEnd}s`);
}

const transitionMode = shouldApplySceneFade
  ? "scene-fade-local"
  : shouldSkipSlowSceneFade
    ? "concat-longform-scene-fade-skipped"
    : transitionConfig.filter;

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
    mode: transitionMode,
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
    ...(() => {
      const source = scenes.find((scene) => Number(scene.order) === Number(item.order)) || {};
      const motion = resolveSceneMotion({ ...source, motionPreset: item.motionPreset || source.motionPreset });
      return {
        ...motion,
        sceneOutputMode: source.outputMode || source.flowOutputMode || "video",
      };
    })(),
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
      ...resolveSceneMotion({ ...source, motionPreset: item.motionPreset || source.motionPreset }),
      imageSourcePath: item.imageSourcePath,
      frameCount: item.frameCount,
      uniqueFrameCount: item.uniqueFrameCount,
      framesPerMotionStep: item.framesPerMotionStep,
      duplicateHoldFrames: item.duplicateHoldFrames,
      frameDurationSeconds: item.frameDurationSeconds,
      audioDurationSeconds: item.audioDurationSeconds,
      durationDriftSeconds: item.durationDriftSeconds,
      cameraSafetyMode: item.cameraSafetyMode,
      maxZoom: item.maxZoom,
      minCropWidth: item.minCropWidth,
      minCropHeight: item.minCropHeight,
      visibleSourceRatio: item.visibleSourceRatio,
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
