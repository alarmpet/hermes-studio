import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { generateGoogleFlowVideoFromPrompt } from "../automation/google-flow-media.mjs";
import { buildFlowThumbnailPrompt, buildThumbnailOverlayPlan } from "./youtube-thumbnail-prompt.mjs";
import { findChromeExecutable } from "../electron/services/browser-profile-service.mjs";

export async function createThumbnailForJob({
  draft,
  paths,
  jobDir,
  chromePath,
  aspectRatio = "9:16",
  emit,
  flowTimeoutMs,
  thumbnailOverlay = {},
  stylePresetId = "",
  stylePreset = {},
}) {
  const resolvedChromePath = chromePath || findChromeExecutable();
  const overlayPlan = buildThumbnailOverlayPlan({
    title: draft?.title,
    script: draft?.script,
    hpsl: draft?.hpsl,
    userOverlay: thumbnailOverlay,
    stylePresetId,
    stylePreset,
  });
  const prompt = buildFlowThumbnailPrompt({
    title: draft?.title,
    script: draft?.script,
    hpsl: draft?.hpsl,
    aspectRatio,
    visualContext: summarizeSceneVisuals(draft?.scenes),
    userOverlay: thumbnailOverlay,
    stylePresetId,
    stylePreset,
  });

  emit?.({
    type: "workflow-progress",
    phase: "thumbnail",
    message: "Google Flow thumbnail background generation started.",
    details: {
      provider: "google-flow-image",
      aspectRatio,
      hookHeadline: overlayPlan.hookHeadline,
      highlightKeywords: overlayPlan.highlightKeywords,
      styleMode: overlayPlan.styleMode,
    },
  });

  const flow = await generateGoogleFlowVideoFromPrompt({
    prompt,
    jobDir,
    sceneOrder: "thumbnail",
    chromePath: resolvedChromePath,
    profileDir: paths?.flowProfileDir,
    outputMode: "image",
    aspectRatio,
    timeoutMs: flowTimeoutMs,
    onProgress: ({ message, details } = {}) => {
      emit?.({
        type: details?.eventType === "flow-policy-warning" ? "workflow-warning" : "workflow-progress",
        phase: details?.eventType || "thumbnail-flow-progress",
        message,
        details: {
          ...(details || {}),
          provider: "google-flow-image",
          thumbnail: true,
        },
      });
    },
  }).catch((error) => ({
    ok: false,
    code: error.code || error.details?.code || "FLOW_THUMBNAIL_GENERATION_FAILED",
    error: error.message,
    details: error.details || {},
  }));

  if (flow?.path) {
    return composeFlowThumbnail({
      backgroundPath: flow.path,
      overlayPlan,
      jobDir,
      aspectRatio,
    });
  }

  const failureResultPath = join(jobDir, "flow-thumbnail-result.json");
  const flowFailure = {
    ok: false,
    provider: "google-flow-image",
    code: flow?.code || "FLOW_THUMBNAIL_GENERATION_FAILED",
    message: flow?.error || flow?.message || "Google Flow thumbnail background generation failed",
    actionRequired: Boolean(flow?.details?.actionRequired),
    details: flow?.details || {},
    prompt,
    overlayPlan,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(join(jobDir, "flow-thumbnail-result.json"), JSON.stringify(flowFailure, null, 2), "utf8");

  const fallback = await createLocalCompositedThumbnail({
    overlayPlan,
    jobDir,
    aspectRatio,
    reason: flowFailure.message,
  });
  return {
    ...fallback,
    primaryProvider: "google-flow-image",
    primaryProviderFailure: {
      ok: false,
      code: flowFailure.code,
      message: flowFailure.message,
      actionRequired: flowFailure.actionRequired,
      resultPath: failureResultPath,
      details: flowFailure.details,
    },
  };
}

export async function composeFlowThumbnail({ backgroundPath, overlayPlan, jobDir, aspectRatio = "9:16" }) {
  await mkdir(jobDir, { recursive: true });
  const outputPath = join(jobDir, "thumbnail-flow.png");
  const { width, height } = thumbnailSize(aspectRatio);

  let image = sharp(backgroundPath).resize(width, height, { fit: "cover", position: "center" });
  if (overlayPlan.enabled !== false) {
    const titleSvg = buildOverlaySvg(buildOverlayLayout({ overlayPlan, width, height, aspectRatio }));
    image = image.composite([{ input: Buffer.from(titleSvg), top: 0, left: 0 }]);
  }
  await image.png().toFile(outputPath);

  await writeFile(join(jobDir, "thumbnail-flow-metadata.json"), JSON.stringify({
    ok: true,
    provider: "google-flow-image",
    path: outputPath,
    sourcePath: backgroundPath,
    hookHeadline: overlayPlan.hookHeadline,
    subheadline: overlayPlan.subheadline,
    highlightKeywords: overlayPlan.highlightKeywords || [],
    overlayEnabled: overlayPlan.enabled !== false,
    style: overlayPlan.style || {},
    styleMode: overlayPlan.styleMode || "cinematic-contrast",
    styleWarning: thumbnailStyleWarning(overlayPlan),
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");

  return {
    ok: true,
    provider: "google-flow-image",
    path: outputPath,
    sourcePath: backgroundPath,
    overlayPlan,
  };
}

export async function createLocalCompositedThumbnail({ title, script, overlayPlan, jobDir, aspectRatio = "9:16", reason }) {
  await mkdir(jobDir, { recursive: true });
  const outputPath = join(jobDir, "thumbnail-local-fallback.png");
  const { width, height } = thumbnailSize(aspectRatio);
  const plan = overlayPlan || buildThumbnailOverlayPlan({ title, script });
  const fallbackSvg = buildFallbackBackgroundSvg({ width, height, reason });
  const background = await sharp(Buffer.from(fallbackSvg)).png().toBuffer();
  let image = sharp(background).resize(width, height, { fit: "cover", position: "center" });

  if (plan.enabled !== false) {
    const titleSvg = buildOverlaySvg(buildOverlayLayout({ overlayPlan: plan, width, height, aspectRatio }));
    image = image.composite([{ input: Buffer.from(titleSvg), top: 0, left: 0 }]);
  }
  await image.png().toFile(outputPath);

  return {
    ok: true,
    provider: "local-composited",
    path: outputPath,
    reason,
    overlayPlan: plan,
  };
}

function buildOverlayLayout({ overlayPlan, width, height, aspectRatio }) {
  const style = overlayPlan.style || {};
  const titleFont = style.titleFontSize || (aspectRatio === "16:9" ? 82 : 96);
  const subFont = style.subFontSize || (aspectRatio === "16:9" ? 42 : 52);
  const maxLines = style.maxLines || 2;
  const titleLines = wrapKoreanTitle(overlayPlan.hookHeadline, aspectRatio === "16:9" ? 15 : 11, maxLines);
  const subline = wrapKoreanTitle(overlayPlan.subheadline, aspectRatio === "16:9" ? 18 : 13, 1)[0] || "";
  const yPercent = style.positionYPercent ?? 5.5;
  const hPercent = style.bandHeightPercent ?? (aspectRatio === "16:9" ? 29 : 22);
  const topPad = Math.round(height * (yPercent / 100));
  const bandHeight = Math.round(height * (hPercent / 100));
  const lineGap = Math.round(titleFont * 1.05);
  const firstLineY = topPad + Math.round(titleFont * 0.95);
  const sublineY = firstLineY + (titleLines.length * lineGap) + Math.round(subFont * 0.45);

  return {
    width,
    height,
    topPad,
    bandHeight,
    titleLines,
    subline,
    titleFont,
    subFont,
    firstLineY,
    lineGap,
    sublineY,
    highlightKeywords: overlayPlan.highlightKeywords || [],
    style,
  };
}

function buildOverlaySvg({
  width,
  height,
  topPad,
  bandHeight,
  titleLines,
  subline,
  titleFont,
  subFont,
  firstLineY,
  lineGap,
  sublineY,
  highlightKeywords,
  style,
}) {
  const centerX = Math.round(width / 2);
  const bgColor = style.backgroundColor || "#050505";
  const bgOpacity = style.backgroundOpacity ?? 0.72;
  const stop1Opacity = Math.min(0.98, bgOpacity * 1.22);
  const stop2Opacity = Math.max(0, Math.min(0.92, bgOpacity * 0.85));
  const fontFamily = escapeXml(style.fontFamily || "Malgun Gothic");
  const fontWeight = style.fontWeight || 900;
  const outlineColor = style.outlineColor || "#000000";
  const outlineWidth = style.outlineWidth ?? 8;
  const textColor = style.textColor || "#ffffff";
  const highlightColor = style.highlightColor || "#fde047";
  const shadowOpacity = style.shadowOpacity ?? 0.45;
  const titleSpans = titleLines.map((line, index) => {
    const y = firstLineY + index * lineGap;
    return `<text x="${centerX}" y="${y}" text-anchor="middle" font-family="${fontFamily}, Pretendard, Arial, sans-serif" font-size="${titleFont}" font-weight="${fontWeight}" stroke="${outlineColor}" stroke-width="${outlineWidth}" paint-order="stroke" filter="url(#text-shadow)" fill="${textColor}">${colorKeywordSpans(line, highlightKeywords, highlightColor)}</text>`;
  }).join("\n");

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="${bgColor}" stop-opacity="${stop1Opacity}"/>
          <stop offset="1" stop-color="${bgColor}" stop-opacity="${stop2Opacity}"/>
        </linearGradient>
        <filter id="text-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="5" dy="5" stdDeviation="5" flood-color="#000000" flood-opacity="${shadowOpacity}"/>
        </filter>
      </defs>
      <rect x="0" y="${topPad}" width="${width}" height="${bandHeight}" fill="url(#band)"/>
      ${titleSpans}
      <text x="${centerX}" y="${sublineY}" text-anchor="middle" font-family="${fontFamily}, Pretendard, Arial, sans-serif" font-size="${subFont}" font-weight="${Math.max(700, fontWeight - 50)}" stroke="${outlineColor}" stroke-width="${Math.max(0, outlineWidth - 2)}" paint-order="stroke" filter="url(#text-shadow)" fill="${highlightColor}">${escapeXml(subline)}</text>
    </svg>`;
}

function colorKeywordSpans(line, highlightKeywords, highlightColor) {
  const escaped = escapeXml(line);
  const keyword = (highlightKeywords || []).find((item) => item && line.includes(item));
  if (!keyword) return escaped;
  const safeKeyword = escapeXml(keyword);
  return escaped.replace(safeKeyword, `<tspan fill="${highlightColor}">${safeKeyword}</tspan>`);
}

function wrapKoreanTitle(value, maxCharsPerLine, maxLines) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return [];
  const words = text.split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if ([...next].length <= maxCharsPerLine) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = word;
    }
    if (lines.length >= maxLines) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  return lines.slice(0, maxLines);
}

function summarizeSceneVisuals(scenes = []) {
  return scenes
    .slice(0, 5)
    .map((scene) => [scene.visual_intent, scene.main_subject, scene.action, scene.setting].filter(Boolean).join(", "))
    .filter(Boolean)
    .join(" | ")
    .slice(0, 360);
}

function thumbnailStyleWarning(overlayPlan = {}) {
  if (overlayPlan.styleMode === "cinematic-contrast" && overlayPlan.videoStyleFamily === "flat-explainer") {
    return "THUMBNAIL_VIDEO_STYLE_CONTRAST";
  }
  return "";
}

function thumbnailSize(aspectRatio) {
  return aspectRatio === "16:9"
    ? { width: 1280, height: 720 }
    : { width: 1080, height: 1920 };
}

function buildFallbackBackgroundSvg({ width, height, reason }) {
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#0f766e"/>
          <stop offset="0.52" stop-color="#1f2937"/>
          <stop offset="1" stop-color="#7c2d12"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)"/>
      <text x="${Math.round(width * 0.08)}" y="${Math.round(height * 0.92)}" font-family="Arial, sans-serif" font-size="24" fill="#d1d5db">Local fallback: ${escapeXml(reason || "Flow thumbnail unavailable")}</text>
    </svg>`;
}

function escapeXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
