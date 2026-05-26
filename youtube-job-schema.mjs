import { VOICE_PRESETS } from "./electron/services/voice-presets.mjs";

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
  scriptLengthPreset: "standard",
  customDurationSeconds: 60,
  scriptStructure: "hpsl",
  sceneStrategy: "sentence-proportional",
  voiceId: "male_30_announcer",
  speechSpeed: 1.06,
  subtitleStyleId: "bold-shorts",
  subtitleStyle: {},
  aspectRatio: "9:16",
  renderQuality: "shorts-hq",
  characterMode: "consistent-presenter",
  thumbnailMode: "auto",
  thumbnailHookStyle: "smart-curiosity",
  thumbnailUsesScriptContext: true,
  useChatGptThumbnail: true,
  sendIntermediateMedia: false,
  flowOutputMode: "video",
  hybridIntroVideoSceneCount: 2,
  renderEffectPreset: "cinematic",
  transitionPreset: "scene-fade",
  transitionSeconds: 0.3,
  motionIntensity: "medium",
  smoothFrameInterpolation: false,
  stylePresetId: "cinematic-tech-news",
  stylePreset: {},
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
const MOTION_INTENSITIES = ["low", "medium", "high"];

function hasPreset(list, id) {
  return list.some((item) => item.id === id);
}

export function normalizeYouTubeJobRequest(input = {}) {
  const sourceType = ["keyword", "url", "script"].includes(input.sourceType) ? input.sourceType : "keyword";
  const sourceValue = String(input.sourceValue || "").trim();
  if (!sourceValue) throw new Error("sourceValue is required");
  if (sourceType === "url" && !/^https?:\/\//i.test(sourceValue)) {
    throw new Error("url sourceValue must start with http:// or https://");
  }

  const options = { ...DEFAULT_YOUTUBE_JOB_OPTIONS, ...(input.options || {}) };
  if (!SCRIPT_LENGTH_PRESETS[options.scriptLengthPreset]) {
    throw new Error(`Unknown scriptLengthPreset: ${options.scriptLengthPreset}`);
  }
  options.customDurationSeconds = Math.max(15, Math.min(600, Number(options.customDurationSeconds || 60)));
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
  options.characterSheet = normalizeCharacterSheet(options.characterSheet);
  options.flowOutputMode = String(options.flowOutputMode || "video").toLowerCase();
  if (!["video", "image", "hybrid"].includes(options.flowOutputMode)) {
    throw new Error(`Unknown flowOutputMode: ${options.flowOutputMode}`);
  }
  options.hybridIntroVideoSceneCount = Math.max(0, Math.min(6, Math.round(Number(options.hybridIntroVideoSceneCount ?? 2))));
  options.renderEffectPreset = String(options.renderEffectPreset || "cinematic").toLowerCase();
  if (!RENDER_EFFECT_PRESETS.includes(options.renderEffectPreset)) {
    throw new Error(`Unknown renderEffectPreset: ${options.renderEffectPreset}`);
  }
  options.transitionPreset = String(options.transitionPreset || "scene-fade").toLowerCase();
  if (!TRANSITION_PRESETS.includes(options.transitionPreset)) {
    throw new Error(`Unknown transitionPreset: ${options.transitionPreset}`);
  }
  options.transitionSeconds = Math.max(0, Math.min(0.6, Number(options.transitionSeconds ?? 0.3)));
  options.motionIntensity = String(options.motionIntensity || "medium").toLowerCase();
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
