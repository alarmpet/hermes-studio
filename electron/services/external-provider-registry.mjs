import { spawn, execFile } from "node:child_process";

export const EXTERNAL_PROVIDERS = [
  {
    id: "chrome-devtools-mcp",
    type: "diagnostic-provider",
    status: "experimental",
    defaultEnabled: false,
    auth: "browser-debug-session",
    risk: "browser-data-exposure",
    command: "npx",
    args: ["chrome-devtools-mcp@latest"],
  },
  {
    id: "notebooklm-mcp",
    type: "research-provider",
    status: "experimental",
    defaultEnabled: false,
    auth: "browser-profile",
    risk: "unofficial-browser-automation",
    command: "npx",
    args: ["notebooklm-mcp@latest"],
    timeoutMs: 30_000,
  },
  {
    id: "google-workspace-mcp",
    type: "archive-provider",
    status: "experimental",
    defaultEnabled: false,
    auth: "oauth-token",
    risk: "broad-google-account-permissions",
    command: "npx",
    args: ["@aaronsb/google-workspace-mcp"],
  },
];

const activeMcpProcesses = new Map();

export function listExternalProviders() {
  return EXTERNAL_PROVIDERS.map((provider) => ({ ...provider }));
}

export function getExternalProvider(providerId) {
  return EXTERNAL_PROVIDERS.find((provider) => provider.id === providerId) || null;
}

export function spawnMcpServer(providerId, options = {}) {
  const provider = getExternalProvider(providerId);
  if (!provider) throw new Error(`Unknown external provider: ${providerId}`);
  if (provider.defaultEnabled) throw new Error(`Provider should not be enabled by default: ${providerId}`);

  const command = options.command || provider.command;
  const args = options.args || provider.args || [];
  const child = spawn(command, args, {
    stdio: options.stdio || "pipe",
    windowsHide: true,
    detached: false,
    env: { ...process.env, ...(options.env || {}) },
    cwd: options.cwd || process.cwd(),
  });

  activeMcpProcesses.set(providerId, {
    providerId,
    pid: child.pid,
    child,
    command,
    args,
    startedAt: new Date().toISOString(),
  });
  child.once("close", () => activeMcpProcesses.delete(providerId));
  child.once("error", () => activeMcpProcesses.delete(providerId));
  return child;
}

export function getActiveProviderProcesses() {
  return Array.from(activeMcpProcesses.values()).map(({ child, ...record }) => record);
}

export async function stopProvider(providerId) {
  const record = activeMcpProcesses.get(providerId);
  if (!record) return { ok: true, providerId, status: "not-running" };
  activeMcpProcesses.delete(providerId);
  await killProcessTree(record.pid);
  return { ok: true, providerId, pid: record.pid, status: "stopped" };
}

export async function stopAllProviders() {
  const records = Array.from(activeMcpProcesses.values());
  activeMcpProcesses.clear();
  const results = [];
  for (const record of records) {
    await killProcessTree(record.pid);
    results.push({ ok: true, providerId: record.providerId, pid: record.pid, status: "stopped" });
  }
  return results;
}

export function killProcessTree(pid) {
  if (!pid) return Promise.resolve();
  if (process.platform === "win32") {
    return new Promise((resolve) => {
      execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, () => resolve());
    });
  }
  try {
    process.kill(-Number(pid), "SIGTERM");
  } catch {
    try {
      process.kill(Number(pid), "SIGTERM");
    } catch {
      // Process may already be gone.
    }
  }
  return Promise.resolve();
}
