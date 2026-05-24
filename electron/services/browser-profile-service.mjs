import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

export function findChromeExecutable(env = process.env) {
  const candidates = [
    env.HERMES_CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    env.LOCALAPPDATA ? join(env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe") : "",
  ].filter(Boolean);
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

export async function claimBrowserProfile(profileDir) {
  await mkdir(profileDir, { recursive: true });
  const lockPath = join(profileDir, "hermes-profile.lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(await readFile(lockPath, "utf8").catch(() => "{}"));
    if (lock.pid && isProcessRunning(lock.pid)) {
      throw new Error(`Browser profile is already in use by process ${lock.pid}: ${profileDir}`);
    }
  }
  return lockPath;
}

export async function writeBrowserProfileLock(lockPath, pid) {
  await writeFile(lockPath, JSON.stringify({ pid, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

export async function releaseBrowserProfile(lockPath) {
  if (lockPath) await rm(lockPath, { force: true });
}

function isProcessRunning(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}
