import { VOICE_PRESETS } from "./electron/services/voice-presets.mjs";
import { TITLE_OVERLAY_STYLE_IDS } from "./electron/services/title-overlay-presets.mjs";

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
    ass: { fontName: "Malgun Gothic", fontSize: 10, outline: 2, shadow: 1, marginV: 80, primaryColour: "&H00FFFFFF", maxLineChars: 12, maxLines: 2 },
  },
  {
    id: "bold-shorts",
    label: "볼드 쇼츠",
    ass: { fontName: "Malgun Gothic", fontSize: 11, outline: 2, shadow: 1, marginV: 90, primaryColour: "&H00FFFFFF", maxLineChars: 10, maxLines: 2 },
  },
  {
    id: "minimal",
    label: "미니멀",
    ass: { fontName: "Malgun Gothic", fontSize: 9, outline: 1, shadow: 0, marginV: 80, primaryColour: "&H00FFFFFF", maxLineChars: 13, maxLines: 2 },
  },
];

export const DEFAULT_YOUTUBE_JOB_OPTIONS = {
  scriptLengthMode: "preset",
  videoFormat: "shorts",
  longformTargetSeconds: 720,
  introVideoSeconds: 60,
  introVideoClipCount: 10,
  bodyVisualMode: "image",
  bodyImageSeconds: 18,
  enableLiveMcp: false,
  scriptLengthPreset: "standard",
  customDurationSeconds: 60,
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
  stylePresetId: "cinematic-tech-news",
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
  const hasExplicitTitleOverlayEnabled = Object.prototype.hasOwnProperty.call(explicitOptions, "titleOverlayEnabled");
  const options = { ...DEFAULT_YOUTUBE_JOB_OPTIONS, ...explicitOptions };
  options.videoFormat = String(options.videoFormat || "shorts").toLowerCase();
  if (!VIDEO_FORMATS.includes(options.videoFormat)) {
    throw new Error(`Unknown videoFormat: ${options.videoFormat}`);
  }
  if (!SCRIPT_LENGTH_PRESETS[options.scriptLengthPreset]) {
    throw new Error(`Unknown scriptLengthPreset: ${options.scriptLengthPreset}`);
  }
  options.customDurationSeconds = Math.max(15, Math.min(1200, Number(options.customDurationSeconds || 60)));
  if (options.videoFormat === "longform") {
    options.customDurationSeconds = Math.max(600, options.customDurationSeconds);
  }
  options.longformTargetSeconds = options.videoFormat === "longform"
    ? Math.max(600, Math.min(1200, Number(options.longformTargetSeconds || options.customDurationSeconds || 720)))
    : options.customDurationSeconds;
  if (options.videoFormat === "longform") {
    options.customDurationSeconds = options.longformTargetSeconds;
    options.scriptLengthMode = "custom";
    options.flowOutputMode = "hybrid";
    if (!hasExplicitResearchProvider) options.researchProvider = "notebooklm-mcp";
    if (!hasExplicitEnableLiveMcp) options.enableLiveMcp = true;
  }
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
  options.stylePresetId = String(options.stylePresetId || "cinematic-tech-news");
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
  if (!["video", "image", "hybrid"].includes(options.flowOutputMode)) {
    throw new Error(`Unknown flowOutputMode: ${options.flowOutputMode}`);
  }
  options.autoLandscapeLongform = Boolean(options.autoLandscapeLongform);
  const longformLikeDuration = Number(options.customDurationSeconds || options.longformTargetSeconds || 0) >= 180;
  if (options.autoLandscapeLongform && (options.videoFormat === "longform" || longformLikeDuration)) {
    options.aspectRatio = "16:9";
  } else {
    options.aspectRatio = String(options.aspectRatio || "9:16") === "16:9" ? "16:9" : "9:16";
  }
  options.titleOverlayEnabled = options.videoFormat === "longform"
    ? (hasExplicitTitleOverlayEnabled ? Boolean(explicitOptions.titleOverlayEnabled) : false)
    : options.titleOverlayEnabled !== false;
  options.titleOverlayMode = String(options.titleOverlayMode || (options.titleOverlayText ? "manual" : "auto")).toLowerCase();
  if (!["auto", "manual"].includes(options.titleOverlayMode)) {
    throw new Error(`Unknown titleOverlayMode: ${options.titleOverlayMode}`);
  }
  if (options.titleOverlayText && options.titleOverlayMode === "auto") {
    options.titleOverlayMode = "manual";
  }
  options.titleOverlayText = String(options.titleOverlayText || "").replace(/\s+/g, " ").trim().slice(0, 80);
  options.titleOverlayStyleId = String(options.titleOverlayStyleId || "bold-black-accent");
  if (!TITLE_OVERLAY_STYLE_IDS.includes(options.titleOverlayStyleId)) {
    throw new Error(`Unknown titleOverlayStyleId: ${options.titleOverlayStyleId}`);
  }
  options.titleOverlayMaxLines = Math.max(1, Math.min(2, Math.round(Number(options.titleOverlayMaxLines || 2))));
  options.titleOverlaySafeTop = Math.max(
    0,
    Math.min(options.aspectRatio === "16:9" ? 90 : 160, Number(options.titleOverlaySafeTop ?? 84)),
  );
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
