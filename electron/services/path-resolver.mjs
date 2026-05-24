import { app } from "electron";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export function getRuntimePaths() {
  const appRoot = resolve(__dirname, "..", "..");
  const userData = app.getPath("userData");
  const runtimeRoot = app.isPackaged ? userData : appRoot;
  const resourcesRoot = app.isPackaged ? process.resourcesPath : appRoot;
  const unpackedRoot = app.isPackaged ? join(process.resourcesPath, "app.asar.unpacked") : appRoot;
  const defaultTtsRoot = join(os.homedir(), "supertonic3-local-tts");

  return {
    appRoot,
    userData,
    runtimeRoot,
    resourcesRoot,
    unpackedRoot,
    defaultTtsRoot,
    outputDir: join(runtimeRoot, "outputs"),
    configPath: join(userData, "config.json"),
    jobsDir: join(userData, "jobs"),
    youtubeTokenPath: join(userData, "youtube-token.json"),
    youtubeClientSecretsPath: join(userData, "client_secrets.json"),
    chatgptProfileDir: join(userData, "browser-profiles", "chatgpt-profile"),
    flowProfileDir: join(userData, "browser-profiles", "flow-profile"),
    geminiProfileDir: join(userData, "browser-profiles", "gemini-profile"),
    renderScriptPath: join(unpackedRoot, "scripts", "render-youtube-with-tts.mjs"),
  };
}
