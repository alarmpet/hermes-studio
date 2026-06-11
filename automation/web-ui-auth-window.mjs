import { existsSync } from "node:fs";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isProcessRunning(pid) {
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

async function killChromeHoldingProfile(profileDir) {
  const { execSync } = await import("node:child_process");
  const normalizedDir = String(profileDir || "").replace(/\\/g, "\\\\").replace(/'/g, "''");
  if (!normalizedDir) return;
  try {
    const raw = execSync(
      `wmic process where "name='chrome.exe' and CommandLine like '%${normalizedDir}%'" get ProcessId /format:value`,
      { encoding: "utf8", timeout: 8000 },
    );
    const pids = [...raw.matchAll(/ProcessId=(\d+)/gi)].map((match) => Number(match[1])).filter(Boolean);
    for (const pid of pids) {
      try {
        process.kill(pid);
      } catch {
        // Process may have exited between WMIC query and kill.
      }
    }
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (!pids.some(isProcessRunning)) break;
      await delay(250);
    }
  } catch {
    // WMIC may be unavailable on some Windows builds. The lock-file path below
    // still handles Hermes-owned browser windows.
  }
}

export async function releaseAppManagedAuthWindow(profileDir) {
  if (!profileDir) return;
  const lockPath = join(profileDir, "hermes-profile.lock.json");
  if (existsSync(lockPath)) {
    const lock = JSON.parse(await readFile(lockPath, "utf8").catch(() => "{}"));
    if (lock.pid && isProcessRunning(lock.pid)) {
      try {
        process.kill(Number(lock.pid));
      } catch {
        // Browser may already have exited.
      }
      for (let attempt = 0; attempt < 20; attempt += 1) {
        if (!isProcessRunning(lock.pid)) break;
        await delay(250);
      }
    }
    await rm(lockPath, { force: true });
  }
  await killChromeHoldingProfile(profileDir);
}
