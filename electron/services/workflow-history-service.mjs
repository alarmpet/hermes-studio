import { spawnSync } from "node:child_process";

export function getRecentWorkflowEvents({ dbHelperPath, pythonBin = "python", jobId = "", limit = 50 } = {}) {
  if (!dbHelperPath || !jobId) return [];
  const result = spawnSync(pythonBin, [
    dbHelperPath,
    "get-recent-events",
    String(limit),
    "desktop",
    "0",
    "--job-id",
    jobId,
  ], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.status !== 0) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
