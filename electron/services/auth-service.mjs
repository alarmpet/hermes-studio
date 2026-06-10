import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { startYouTubeOAuth } from "../../pipeline/youtube-auth.mjs";
import { claimBrowserProfile, findChromeExecutable, writeBrowserProfileLock } from "./browser-profile-service.mjs";
import { clearSavedToken } from "./secure-token-store.mjs";

export const AUTH_TARGETS = {
  chatgpt: { label: "ChatGPT", url: "https://chatgpt.com/" },
  gemini: { label: "Gemini", url: "https://gemini.google.com/" },
  googleFlow: { label: "Google Flow", url: "https://labs.google/fx/ko/tools/flow" },
  youtube: { label: "YouTube Upload", url: "youtube-oauth" },
  notebooklm: { label: "NotebookLM", url: "https://notebooklm.google.com/" },
  googleWorkspace: { label: "Google Workspace", url: "workspace-oauth" },
};

export function getAuthStatus(config = {}) {
  return {
    chatgpt: config.auth?.chatgpt || { status: "unknown" },
    gemini: config.auth?.gemini || { status: "unknown" },
    googleFlow: config.auth?.googleFlow || { status: "unknown" },
    flowAccountA: config.auth?.["flow-profile-flow-a"] || { status: "unknown" },
    flowAccountB: config.auth?.["flow-profile-flow-b"] || { status: "unknown" },
    youtube: config.auth?.youtube || { status: "unknown" },
    notebooklm: config.auth?.notebooklm || { status: "unknown" },
    googleWorkspace: config.auth?.googleWorkspace || { status: "unknown" },
  };
}

export function resolveProfileDir(target, paths) {
  if (target === "chatgpt") return paths.chatgptProfileDir;
  if (target === "gemini") return paths.geminiProfileDir;
  if (target === "googleFlow") return paths.flowProfileDir;
  if (target === "notebooklm") return paths.notebooklmProfileDir;
  throw new Error(`No browser profile for auth target: ${target}`);
}

export function openPersistentChrome({ chromePath, profileDir, url }) {
  const child = spawn(chromePath, [
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--start-maximized",
    "--window-size=1920,1080",
    "--window-position=0,0",
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

export async function startAuth(target, { config, paths, openExternal }) {
  if (!AUTH_TARGETS[target]) throw new Error(`Unknown auth target: ${target}`);
  if (target === "googleWorkspace") {
    return {
      ok: false,
      target,
      label: AUTH_TARGETS[target].label,
      status: "oauth-not-configured",
      message: "Google Workspace MCP OAuth is planned for the first MCP wave. Token storage will use Electron safeStorage.",
      tokenPath: paths.googleWorkspaceTokenPath,
    };
  }
  if (target === "youtube") {
    if (!existsSync(paths.youtubeClientSecretsPath)) {
      return {
        ok: false,
        target,
        status: "client-secrets-missing",
        clientSecretsPath: paths.youtubeClientSecretsPath,
        setupDir: paths.userData,
        message: "YouTube 업로드 인증을 시작하려면 Google OAuth client_secrets.json 파일을 앱 데이터 폴더에 넣어야 합니다.",
      };
    }
    if (typeof openExternal !== "function") throw new Error("openExternal is required for YouTube OAuth.");
    return startYouTubeOAuth({
      clientSecretsPath: paths.youtubeClientSecretsPath,
      tokenPath: paths.youtubeTokenPath,
      openExternal,
    });
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

export async function changeAuthAccount(target, context) {
  await clearAuthSession(target, { ...context, requireKnownTarget: true });
  return startAuth(target, context);
}

export async function clearAuthSession(target, { paths, requireKnownTarget = false } = {}) {
  if (!AUTH_TARGETS[target]) {
    if (requireKnownTarget) throw new Error(`Unknown auth target: ${target}`);
    return { ok: false, target, status: "unknown-target" };
  }
  if (target === "youtube") {
    await rm(paths.youtubeTokenPath, { force: true });
    return { ok: true, target, status: "cleared", clearedPath: paths.youtubeTokenPath };
  }
  if (target === "googleWorkspace") {
    await clearSavedToken(paths.googleWorkspaceTokenPath);
    return { ok: true, target, status: "cleared", clearedPath: paths.googleWorkspaceTokenPath };
  }
  const profileDir = resolve(resolveProfileDir(target, paths));
  const profilesRoot = resolve(join(paths.userData, "browser-profiles"));
  if (!profileDir.toLowerCase().startsWith(profilesRoot.toLowerCase())) {
    throw new Error(`Refusing to clear auth profile outside browser-profiles: ${profileDir}`);
  }
  await rm(profileDir, { recursive: true, force: true });
  return { ok: true, target, status: "cleared", clearedPath: profileDir };
}
