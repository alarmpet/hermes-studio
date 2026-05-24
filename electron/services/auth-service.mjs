import { spawn } from "node:child_process";
import { claimBrowserProfile, findChromeExecutable, writeBrowserProfileLock } from "./browser-profile-service.mjs";

export const AUTH_TARGETS = {
  chatgpt: { label: "ChatGPT", url: "https://chatgpt.com/" },
  gemini: { label: "Gemini", url: "https://gemini.google.com/" },
  googleFlow: { label: "Google Flow", url: "https://labs.google/fx/ko/tools/flow" },
  youtube: { label: "YouTube Upload", url: "youtube-oauth" },
};

export function getAuthStatus(config = {}) {
  return {
    chatgpt: config.auth?.chatgpt || { status: "unknown" },
    gemini: config.auth?.gemini || { status: "unknown" },
    googleFlow: config.auth?.googleFlow || { status: "unknown" },
    youtube: config.auth?.youtube || { status: "unknown" },
  };
}

export function resolveProfileDir(target, paths) {
  if (target === "chatgpt") return paths.chatgptProfileDir;
  if (target === "gemini") return paths.geminiProfileDir;
  if (target === "googleFlow") return paths.flowProfileDir;
  throw new Error(`No browser profile for auth target: ${target}`);
}

export function openPersistentChrome({ chromePath, profileDir, url }) {
  const child = spawn(chromePath, [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--new-window",
    url,
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
  return { ok: true, pid: child.pid, profileDir, url };
}

export async function startAuth(target, { config, paths }) {
  if (!AUTH_TARGETS[target]) throw new Error(`Unknown auth target: ${target}`);
  if (target === "youtube") {
    return {
      ok: false,
      target,
      status: "oauth-not-configured",
      message: "YouTube OAuth will be enabled after client_secrets.json is configured.",
    };
  }

  const chromePath = config.chromePath || findChromeExecutable();
  if (!chromePath) throw new Error("Chrome executable was not found. Set Chrome path in Settings.");
  const profileDir = resolveProfileDir(target, paths);
  const lockPath = await claimBrowserProfile(profileDir);
  const launch = openPersistentChrome({ chromePath, profileDir, url: AUTH_TARGETS[target].url });
  await writeBrowserProfileLock(lockPath, launch.pid);
  return {
    ...launch,
    target,
    label: AUTH_TARGETS[target].label,
    lockPath,
    status: "auth-window-opened",
  };
}
