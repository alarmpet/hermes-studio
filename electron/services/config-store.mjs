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
    scriptLengthMode: "preset",
    scriptLengthPreset: "standard",
    customDurationSeconds: 90,
    voiceId: "male_30_announcer",
    subtitleStyleId: "bold-shorts",
    mockMediaMode: true,
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
