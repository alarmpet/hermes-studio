import { VOICE_PRESETS } from "./electron/services/voice-presets.mjs";
import { TITLE_OVERLAY_STYLE_IDS, getTitleOverlayPreset } from "./electron/services/title-overlay-presets.mjs";
import { estimateDirectScriptSeconds } from "./electron/services/direct-script-duration.mjs";

export { VOICE_PRESETS };

export const YOUTUBE_RUNTIME_CONTRACT_VERSION = "youtube-hpsl-v2";

export const SCRIPT_LENGTH_PRESETS = {
  micro: { id: "micro", label: "30초", targetSeconds: 30, sceneCount: 3, wordsMin: 75, wordsMax: 95 },
  short: { id: "short", label: "45초", targetSeconds: 45, sceneCount: 4, wordsMin: 105, wordsMax: 130 },
  standard: { id: "standard", label: "60초", targetSeconds: 60, sceneCount: 5, wordsMin: 140, wordsMax: 170 },
  extended: { id: "extended", label: "90초", targetSeconds: 90, sceneCount: 6, wordsMin: 205, wordsMax: 250 },
};

export const SUBTITLE_STYLE_PRESETS = [
  {
    id: "clean-news",
    label: "클린 뉴스",
    ass: { fontName: "Malgun Gothic", fontSize: 20, outline: 4, shadow: 2, marginV: 36, primaryColour: "&H00FFFFFF", maxLineChars: 12, maxLines: 2 },
  },
  {
    id: "bold-shorts",
    label: "볼드 쇼츠",
    ass: { fontName: "Malgun Gothic", fontSize: 22, outline: 4, shadow: 2, marginV: 34, primaryColour: "&H00FFFFFF", maxLineChars: 10, maxLines: 2 },
  },
  {
    id: "minimal",
    label: "미니멀",
    ass: { fontName: "Malgun Gothic", fontSize: 18, outline: 2, shadow: 0, marginV: 36, primaryColour: "&H00FFFFFF", maxLineChars: 13, maxLines: 2 },
  },
];

export const DEFAULT_YOUTUBE_JOB_OPTIONS = {
  scriptLengthMode: "preset",
  videoFormat: "shorts",
  longformTargetSeconds: 720,
  longformChapteredRenderEnabled: false,
  chapterTargetSeconds: 90,
  introVideoSeconds: 60,
  introVideoClipCount: 10,
  bodyVisualMode: "image",
  bodyImageSeconds: 18,
  enableLiveMcp: false,
  scriptLengthPreset: "standard",
  customDurationSeconds: 60,
  estimatedScriptSeconds: 0,
  durationSource: "user-selected",
  scriptStructure: "hpsl",
  sceneStrategy: "sentence-proportional",
  voiceId: "female_30_announcer",
  speechSpeed: 1.06,
  subtitleStyleId: "bold-shorts",
  subtitleStyle: {},
  titleOverlayEnabled: true,
  titleOverlayMode: "auto",
  titleOverlayText: "",
  titleOverlayStyleId: "bold-black-accent",
  titleOverlayMaxLines: 2,
  titleOverlaySafeTop: 84,
  aspectRatio: "9:16",
  autoLandscapeLongform: false,
  renderQuality: "shorts-hq",
  characterMode: "consistent-presenter",
  thumbnailMode: "auto",
  thumbnailHookStyle: "smart-curiosity",
  thumbnailUsesScriptContext: true,
  useChatGptThumbnail: true,
  sendIntermediateMedia: false,
  flowOutputMode: "hybrid",
  hybridIntroVideoSceneCount: 1,
  renderEffectPreset: "cinematic",
  transitionPreset: "scene-fade",
  transitionSeconds: 0.3,
  motionIntensity: "strong",
  smoothFrameInterpolation: false,
  stylePresetId: "stickmanplus",
  stylePreset: {},
  researchProvider: "gemini-gems-browser",
  archiveProvider: "local-files",
  characterSheet: {
    mode: "none",
    profileText: "",
    referenceImagePaths: [],
  },
  openaiProviderMode: "disabled",
  openaiApiKeyConfigured: false,
  ollamaAssistEnabled: false,
  ollamaBaseUrl: "http://127.0.0.1:11434",
  ollamaModel: "gemma4:12b",
  ollamaTimeoutMs: 20000,
  ollamaUseCases: {
    storyboard: true,
    promptQa: true,
    failureReport: true,
    uploadMetadata: false,
    thumbnailIdeas: false,
    scriptPolish: false,
    researchDigest: false,
  },
};

export const DEFAULT_UPLOAD_OPTIONS = {
  enabled: false,
  requireApproval: true,
  privacyStatus: "private",
  madeForKids: false,
  containsSyntheticMedia: true,
  categoryId: "25",
  autoThumbnail: true,
};

export const DEFAULT_THUMBNAIL_OVERLAY = {
  enabled: true,
  headlineText: "",
  subheadlineText: "",
  fontFamily: "Malgun Gothic",
  fontWeight: 900,
  titleFontSize: 96,
  subFontSize: 52,
  textColor: "#ffffff",
  highlightColor: "#fde047",
  backgroundColor: "#050505",
  backgroundOpacity: 0.72,
  outlineColor: "#000000",
  outlineWidth: 8,
  shadowOpacity: 0.45,
  positionYPercent: 5.5,
  bandHeightPercent: 22,
  maxLines: 2,
};

export const DEFAULT_TITLE_OVERLAY_STYLE = {
  fontFamily: "Malgun Gothic",
  fontWeight: 900,
  fontSize: 78,
  textColor: "#ffffff",
  highlightColor: "#fde047",
  backgroundColor: "#050505",
  backgroundOpacity: 0.82,
  outlineColor: "#000000",
  outlineWidth: 7,
  positionYPercent: 4.5,
  bandHeightPercent: 14,
  horizontalPaddingPercent: 8,
  maxLines: 2,
};

const RENDER_EFFECT_PRESETS = ["clean", "cinematic", "dynamic-shorts"];
const TRANSITION_PRESETS = ["none", "scene-fade", "smooth-crossfade", "directional-wipe", "hook-whip"];
const MOTION_INTENSITIES = ["none", "light", "strong"];
const RESEARCH_PROVIDERS = ["gemini-gems-browser", "notebooklm-mcp"];
const ARCHIVE_PROVIDERS = ["local-files", "google-workspace-mcp"];
const VIDEO_FORMATS = ["shorts", "longform"];

function hasPreset(list, id) {
  return list.some((item) => item.id === id);
}

export function normalizeYouTubeJobRequest(input = {}) {
  const requestedSourceType = ["keyword", "url", "script"].includes(input.sourceType) ? input.sourceType : "url";
  const sourceValue = String(input.sourceValue || "").trim();
  if (!sourceValue) throw new Error("sourceValue is required");
  const sourceType = requestedSourceType !== "script" && /^https?:\/\//i.test(sourceValue)
    ? "url"
    : requestedSourceType;
  if (sourceType === "url" && !/^https?:\/\//i.test(sourceValue)) {
    throw new Error("url sourceValue must start with http:// or https://");
  }

  const explicitOptions = input.options || {};
  const hasExplicitResearchProvider = Object.prototype.hasOwnProperty.call(explicitOptions, "researchProvider");
  const hasExplicitEnableLiveMcp = Object.prototype.hasOwnProperty.call(explicitOptions, "enableLiveMcp");
  const hasExplicitFlowOutputMode = Object.prototype.hasOwnProperty.call(explicitOptions, "flowOutputMode");
  const options = { ...DEFAULT_YOUTUBE_JOB_OPTIONS, ...explicitOptions };
  options.videoFormat = String(options.videoFormat || "shorts").toLowerCase();
  if (!VIDEO_FORMATS.includes(options.videoFormat)) {
    throw new Error(`Unknown videoFormat: ${options.videoFormat}`);
  }
  if (!SCRIPT_LENGTH_PRESETS[options.scriptLengthPreset]) {
    throw new Error(`Unknown scriptLengthPreset: ${options.scriptLengthPreset}`);
  }
  options.scriptLengthMode = String(options.scriptLengthMode || "preset").toLowerCase();
  if (!["preset", "custom", "auto"].includes(options.scriptLengthMode)) {
    throw new Error(`Unknown scriptLengthMode: ${options.scriptLengthMode}`);
  }
  options.customDurationSeconds = Math.max(15, Math.min(1200, Number(options.customDurationSeconds || 60)));
  options.estimatedScriptSeconds = Math.max(0, Math.min(1200, Math.round(Number(options.estimatedScriptSeconds || 0))));
  if (sourceType === "script" && options.scriptLengthMode === "auto") {
    const autoSeconds = options.estimatedScriptSeconds || estimateDirectScriptSeconds({
      script: sourceValue,
      speechSpeed: options.speechSpeed,
    });
    options.customDurationSeconds = Math.max(15, Math.min(1200, autoSeconds));
    options.estimatedScriptSeconds = options.customDurationSeconds;
    options.durationSource = "script-auto";
  } else {
    options.durationSource = "user-selected";
    if (options.scriptLengthMode === "auto") options.scriptLengthMode = "preset";
    if (options.videoFormat === "longform") {
      options.customDurationSeconds = Math.max(600, options.customDurationSeconds);
    }
  }
  options.longformTargetSeconds = options.videoFormat === "longform"
    ? (sourceType === "script" && options.scriptLengthMode === "auto"
        ? Math.max(15, Math.min(1200, Number(options.customDurationSeconds || options.estimatedScriptSeconds || 720)))
        : Math.max(600, Math.min(1200, Number(options.longformTargetSeconds || options.customDurationSeconds || 720))))
    : options.customDurationSeconds;
  if (options.videoFormat === "longform") {
    if (sourceType === "script" && options.scriptLengthMode === "auto") {
      options.longformTargetSeconds = Math.max(15, Math.min(1200, options.customDurationSeconds));
    } else {
      options.customDurationSeconds = options.longformTargetSeconds;
      options.scriptLengthMode = "custom";
    }
    if (!hasExplicitFlowOutputMode) options.flowOutputMode = "auto";
    if (!hasExplicitResearchProvider) options.researchProvider = "notebooklm-mcp";
    if (!hasExplicitEnableLiveMcp) options.enableLiveMcp = true;
  }
  options.longformChapteredRenderEnabled = options.videoFormat === "longform"
    ? Boolean(options.longformChapteredRenderEnabled)
    : false;
  options.chapterTargetSeconds = Math.max(60, Math.min(120, Math.round(Number(options.chapterTargetSeconds || 90))));
  options.scriptStructure = sourceType === "script"
    ? "direct-script"
    : String(options.scriptStructure || "hpsl").toLowerCase();
  if (!["hpsl", "direct-script"].includes(options.scriptStructure)) {
    throw new Error(`Unknown scriptStructure: ${options.scriptStructure}`);
  }
  if (!["preset", "sentence-proportional"].includes(options.sceneStrategy)) {
    throw new Error(`Unknown sceneStrategy: ${options.sceneStrategy}`);
  }
  const voicePreset = VOICE_PRESETS.find((voice) => voice.id === options.voiceId);
  if (!voicePreset) {
    throw new Error(`Unknown voiceId: ${options.voiceId}`);
  }
  if (input.options?.speechSpeed == null && voicePreset.speed) {
    options.speechSpeed = voicePreset.speed;
  }
  if (!hasPreset(SUBTITLE_STYLE_PRESETS, options.subtitleStyleId)) {
    throw new Error(`Unknown subtitleStyleId: ${options.subtitleStyleId}`);
  }
  options.stylePresetId = String(options.stylePresetId || "stickmanplus");
  options.stylePreset = options.stylePreset && typeof options.stylePreset === "object" ? options.stylePreset : {};
  options.researchProvider = String(options.researchProvider || "gemini-gems-browser");
  if (!RESEARCH_PROVIDERS.includes(options.researchProvider)) {
    throw new Error(`Unknown researchProvider: ${options.researchProvider}`);
  }
  options.archiveProvider = String(options.archiveProvider || "local-files");
  if (!ARCHIVE_PROVIDERS.includes(options.archiveProvider)) {
    throw new Error(`Unknown archiveProvider: ${options.archiveProvider}`);
  }
  options.characterSheet = normalizeCharacterSheet(options.characterSheet);
  options.enableLiveMcp = Boolean(options.enableLiveMcp);
  options.introVideoSeconds = Math.max(30, Math.min(90, Number(options.introVideoSeconds || 60)));
  options.introVideoClipCount = Math.max(1, Math.min(10, Math.round(Number(options.introVideoClipCount || options.hybridIntroVideoSceneCount || 10))));
  options.bodyVisualMode = String(options.bodyVisualMode || "image").toLowerCase();
  if (!["image"].includes(options.bodyVisualMode)) {
    throw new Error(`Unknown bodyVisualMode: ${options.bodyVisualMode}`);
  }
  options.bodyImageSeconds = Math.max(10, Math.min(30, Number(options.bodyImageSeconds || 18)));
  options.flowOutputMode = String(options.flowOutputMode || "video").toLowerCase();
  if (!["video", "image", "hybrid", "auto"].includes(options.flowOutputMode)) {
    throw new Error(`Unknown flowOutputMode: ${options.flowOutputMode}`);
  }
  options.autoLandscapeLongform = Boolean(options.autoLandscapeLongform);
  const longformLikeDuration = Number(options.customDurationSeconds || options.longformTargetSeconds || 0) >= 180;
  if (options.autoLandscapeLongform && (options.videoFormat === "longform" || longformLikeDuration)) {
    options.aspectRatio = "16:9";
  } else {
    options.aspectRatio = String(options.aspectRatio || "9:16") === "16:9" ? "16:9" : "9:16";
  }
  const suppressTitleOverlay = options.videoFormat === "longform"
    || options.aspectRatio === "16:9"
    || Number(options.customDurationSeconds || options.longformTargetSeconds || 0) >= 180;
  options.titleOverlayEnabled = suppressTitleOverlay
    ? false
    : options.titleOverlayEnabled !== false;
  options.titleOverlayMode = String(options.titleOverlayMode || (options.titleOverlayText ? "manual" : "auto")).toLowerCase();
  if (!["auto", "manual"].includes(options.titleOverlayMode)) {
    throw new Error(`Unknown titleOverlayMode: ${options.titleOverlayMode}`);
  }
  if (options.titleOverlayText && options.titleOverlayMode === "auto") {
    options.titleOverlayMode = "manual";
  }
  options.titleOverlayText = String(options.titleOverlayText || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter((line, i, arr) => line || i < arr.length - 1)
    .join("\n")
    .slice(0, 160);
  options.titleOverlayStyleId = String(options.titleOverlayStyleId || "bold-black-accent");
  if (!TITLE_OVERLAY_STYLE_IDS.includes(options.titleOverlayStyleId)) {
    throw new Error(`Unknown titleOverlayStyleId: ${options.titleOverlayStyleId}`);
  }
  options.titleOverlayMaxLines = Math.max(1, Math.min(4, Math.round(Number(options.titleOverlayMaxLines || 4))));
  options.titleOverlaySafeTop = Math.max(
    0,
    Math.min(options.aspectRatio === "16:9" ? 90 : 160, Number(options.titleOverlaySafeTop ?? 84)),
  );
  const preset = getTitleOverlayPreset(options.titleOverlayStyleId);
  const presetStyle = {
    fontFamily: "Malgun Gothic",
    fontWeight: 900,
    fontSize: 78,
    textColor: preset.primary,
    highlightColor: preset.accent,
    backgroundColor: preset.background,
    backgroundOpacity: preset.backgroundOpacity ?? 0.82,
    outlineColor: preset.outline,
    outlineWidth: 7,
    positionYPercent: 4.5,
    bandHeightPercent: 14,
    horizontalPaddingPercent: 8,
    maxLines: 4,
  };
  options.titleOverlayStyle = normalizeTitleOverlayStyle({
    ...presetStyle,
    ...(explicitOptions.titleOverlayStyle || {}),
  });
  options.titleOverlayMaxLines = options.titleOverlayStyle.maxLines;
  options.hybridIntroVideoSceneCount = Math.max(0, Math.min(10, Math.round(Number(options.hybridIntroVideoSceneCount ?? 2))));
  if (options.videoFormat === "longform") {
    options.hybridIntroVideoSceneCount = options.introVideoClipCount;
  }
  options.renderEffectPreset = String(options.renderEffectPreset || "cinematic").toLowerCase();
  if (!RENDER_EFFECT_PRESETS.includes(options.renderEffectPreset)) {
    throw new Error(`Unknown renderEffectPreset: ${options.renderEffectPreset}`);
  }
  options.transitionPreset = String(options.transitionPreset || "scene-fade").toLowerCase();
  if (!TRANSITION_PRESETS.includes(options.transitionPreset)) {
    throw new Error(`Unknown transitionPreset: ${options.transitionPreset}`);
  }
  options.transitionSeconds = Math.max(0, Math.min(0.6, Number(options.transitionSeconds ?? 0.3)));
  options.motionIntensity = normalizeMotionIntensity(options.motionIntensity || "light");
  if (!MOTION_INTENSITIES.includes(options.motionIntensity)) {
    throw new Error(`Unknown motionIntensity: ${options.motionIntensity}`);
  }
  options.smoothFrameInterpolation = Boolean(options.smoothFrameInterpolation);
  if (!["disabled", "thumbnail-api", "scene-json-api", "prompt-qa-api"].includes(options.openaiProviderMode)) {
    throw new Error(`Unknown openaiProviderMode: ${options.openaiProviderMode}`);
  }
  options.openaiApiKeyConfigured = Boolean(options.openaiApiKeyConfigured);
  options.ollamaAssistEnabled = Boolean(options.ollamaAssistEnabled);
  options.ollamaBaseUrl = String(options.ollamaBaseUrl || DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaBaseUrl)
    .trim()
    .replace(/\/+$/u, "");
  options.ollamaModel = String(options.ollamaModel || DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaModel).trim();
  options.ollamaTimeoutMs = Math.max(3000, Math.min(60000, Number(options.ollamaTimeoutMs || DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaTimeoutMs)));
  options.ollamaUseCases = {
    ...DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaUseCases,
    ...(options.ollamaUseCases && typeof options.ollamaUseCases === "object" ? options.ollamaUseCases : {}),
  };
  for (const key of Object.keys(options.ollamaUseCases)) {
    options.ollamaUseCases[key] = Boolean(options.ollamaUseCases[key]);
  }
  options.thumbnailOverlay = normalizeThumbnailOverlay({
    ...DEFAULT_THUMBNAIL_OVERLAY,
    ...(explicitOptions.thumbnailOverlay || {}),
  });

  const upload = { ...DEFAULT_UPLOAD_OPTIONS, ...(input.upload || {}) };

  return {
    id: input.id || `youtube-${Date.now()}`,
    runtimeContractVersion: YOUTUBE_RUNTIME_CONTRACT_VERSION,
    sourceType,
    sourceValue,
    options,
    upload,
    createdAt: input.createdAt || new Date().toISOString(),
    requestedBy: input.requestedBy || "desktop",
  };
}

function normalizeMotionIntensity(value = "light") {
  const normalized = String(value || "light").trim().toLowerCase();
  if (normalized === "low" || normalized === "medium") return "light";
  if (normalized === "high") return "strong";
  return normalized;
}

function normalizeCharacterSheet(value = {}) {
  const mode = ["none", "text", "image", "text-and-image"].includes(value.mode) ? value.mode : "none";
  return {
    mode,
    profileText: String(value.profileText || "").trim(),
    referenceImagePaths: Array.isArray(value.referenceImagePaths)
      ? value.referenceImagePaths.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 4)
      : [],
  };
}

function normalizeThumbnailOverlay(input = {}) {
  return {
    enabled: input.enabled !== false,
    headlineText: String(input.headlineText || "").replace(/\s+/g, " ").trim().slice(0, 32),
    subheadlineText: String(input.subheadlineText || "").replace(/\s+/g, " ").trim().slice(0, 36),
    fontFamily: ["Malgun Gothic", "Pretendard", "Arial"].includes(input.fontFamily) ? input.fontFamily : "Malgun Gothic",
    fontWeight: clampInt(input.fontWeight, 500, 1000, 900),
    titleFontSize: clampInt(input.titleFontSize, 42, 140, 96),
    subFontSize: clampInt(input.subFontSize, 24, 80, 52),
    textColor: normalizeHex(input.textColor, "#ffffff"),
    highlightColor: normalizeHex(input.highlightColor, "#fde047"),
    backgroundColor: normalizeHex(input.backgroundColor, "#050505"),
    backgroundOpacity: clampNumber(input.backgroundOpacity, 0, 0.92, 0.72),
    outlineColor: normalizeHex(input.outlineColor, "#000000"),
    outlineWidth: clampInt(input.outlineWidth, 0, 16, 8),
    shadowOpacity: clampNumber(input.shadowOpacity, 0, 0.9, 0.45),
    positionYPercent: clampNumber(input.positionYPercent, 0, 55, 5.5),
    bandHeightPercent: clampNumber(input.bandHeightPercent, 12, 38, 22),
    maxLines: clampInt(input.maxLines, 1, 2, 2),
  };
}

function normalizeTitleOverlayStyle(input = {}) {
  return {
    fontFamily: ["Malgun Gothic", "Pretendard", "Arial"].includes(input.fontFamily) ? input.fontFamily : "Malgun Gothic",
    fontWeight: clampInt(input.fontWeight, 500, 1000, 900),
    fontSize: clampInt(input.fontSize, 42, 120, 78),
    textColor: normalizeHex(input.textColor, "#ffffff"),
    highlightColor: normalizeHex(input.highlightColor, "#fde047"),
    backgroundColor: normalizeHex(input.backgroundColor, "#050505"),
    backgroundOpacity: clampNumber(input.backgroundOpacity, 0, 0.92, 0.82),
    outlineColor: normalizeHex(input.outlineColor, "#000000"),
    outlineWidth: clampInt(input.outlineWidth, 0, 10, 7),
    positionYPercent: clampNumber(input.positionYPercent, 0, 18, 4.5),
    bandHeightPercent: clampNumber(input.bandHeightPercent, 10, 24, 14),
    horizontalPaddingPercent: clampNumber(input.horizontalPaddingPercent, 4, 18, 8),
    maxLines: clampInt(input.maxLines, 1, 4, 4),
  };
}

function clampInt(value, min, max, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeHex(value, fallback) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}
