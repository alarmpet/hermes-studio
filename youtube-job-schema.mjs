import { VOICE_PRESETS } from "./electron/services/voice-presets.mjs";

export { VOICE_PRESETS };

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
    ass: { fontName: "Malgun Gothic", fontSize: 18, outline: 2, shadow: 1, marginV: 60, primaryColour: "&H00FFFFFF" },
  },
  {
    id: "bold-shorts",
    label: "볼드 쇼츠",
    ass: { fontName: "Malgun Gothic", fontSize: 24, outline: 4, shadow: 1, marginV: 78, primaryColour: "&H00FFFFFF" },
  },
  {
    id: "minimal",
    label: "미니멀",
    ass: { fontName: "Malgun Gothic", fontSize: 17, outline: 1, shadow: 0, marginV: 54, primaryColour: "&H00FFFFFF" },
  },
];

export const DEFAULT_YOUTUBE_JOB_OPTIONS = {
  scriptLengthMode: "preset",
  scriptLengthPreset: "standard",
  customDurationSeconds: 90,
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

function hasPreset(list, id) {
  return list.some((item) => item.id === id);
}

export function normalizeYouTubeJobRequest(input = {}) {
  const sourceType = input.sourceType === "url" ? "url" : "keyword";
  const sourceValue = String(input.sourceValue || "").trim();
  if (!sourceValue) throw new Error("sourceValue is required");
  if (sourceType === "url" && !/^https?:\/\//i.test(sourceValue)) {
    throw new Error("url sourceValue must start with http:// or https://");
  }

  const options = { ...DEFAULT_YOUTUBE_JOB_OPTIONS, ...(input.options || {}) };
  if (!SCRIPT_LENGTH_PRESETS[options.scriptLengthPreset]) {
    throw new Error(`Unknown scriptLengthPreset: ${options.scriptLengthPreset}`);
  }
  options.customDurationSeconds = Math.max(15, Math.min(600, Number(options.customDurationSeconds || 90)));
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

  const upload = { ...DEFAULT_UPLOAD_OPTIONS, ...(input.upload || {}) };

  return {
    id: input.id || `youtube-${Date.now()}`,
    sourceType,
    sourceValue,
    options,
    upload,
    createdAt: input.createdAt || new Date().toISOString(),
    requestedBy: input.requestedBy || "desktop",
  };
}
