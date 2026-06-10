import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export const DEFAULT_CONFIG = {
  version: 1,
  ttsRoot: "",
  chromePath: "",
  webwrightDiagnosticsEnabled: false,
  webwrightCommand: "webwright",
  auth: {
    chatgpt: { status: "unknown" },
    gemini: { status: "unknown" },
    googleFlow: { status: "unknown" },
    youtube: { status: "unknown" },
    notebooklm: { status: "unknown" },
    googleWorkspace: { status: "unknown" },
  },
  defaults: {
    sourceType: "script",
    scriptLengthMode: "preset",
    scriptLengthPreset: "standard",
    customDurationSeconds: 90,
    voiceId: "male_30_high",
    subtitleStyleId: "bold-shorts",
    stylePresetId: "stickmanplus",
    mockMediaMode: true,
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
  },
};

export async function loadConfig(configPath) {
  try {
    const parsed = JSON.parse(await readFile(configPath, "utf8"));
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      auth: { ...DEFAULT_CONFIG.auth, ...(parsed.auth || {}) },
      defaults: { ...DEFAULT_CONFIG.defaults, ...(parsed.defaults || {}) },
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(configPath, config) {
  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
  return config;
}
