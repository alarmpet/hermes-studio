import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const FLOW_GLOBAL_PACING_FILE = "flow-global-pacing.json";

const DEFAULT_MIN_SUBMIT_GAP_MS = 60_000;
const DEFAULT_FAILURE_COOLDOWN_MS = 90_000;

export function flowGlobalPacingPath({ userData } = {}) {
  if (!userData) throw new Error("userData is required for Flow global pacing state.");
  return join(userData, FLOW_GLOBAL_PACING_FILE);
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return {};
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2), "utf8");
  return value;
}

function iso(ms) {
  return new Date(ms).toISOString();
}

export function createFlowRequestPacer({
  userData,
  minSubmitGapMs = DEFAULT_MIN_SUBMIT_GAP_MS,
  failureCooldownMs = DEFAULT_FAILURE_COOLDOWN_MS,
} = {}) {
  const globalPath = flowGlobalPacingPath({ userData });

  const writeState = async (state, jobDir = "") => {
    const next = { ...state, updatedAt: iso(state.now ?? Date.now()) };
    await writeJson(globalPath, next);
    if (jobDir) await writeJson(join(jobDir, "flow-request-pacing.json"), next);
    return next;
  };

  return {
    globalPath,
    async readState() {
      return readJson(globalPath);
    },
    async beforeSubmit({ jobId = "", sceneOrder = 0, outputMode = "", jobDir = "", now = Date.now() } = {}) {
      const state = await readJson(globalPath);
      if (Number.isFinite(state.nextAllowedAtMs) && state.nextAllowedAtMs > now) {
        const error = new Error(`FLOW_RATE_LIMITED: Google Flow cooldown active until ${iso(state.nextAllowedAtMs)}.`);
        error.failureCode = "FLOW_RATE_LIMITED";
        error.actionRequired = true;
        error.retryAfterMs = state.nextAllowedAtMs - now;
        error.nextAllowedAt = iso(state.nextAllowedAtMs);
        error.details = { failureCode: "FLOW_RATE_LIMITED", retryAfterMs: error.retryAfterMs, nextAllowedAt: error.nextAllowedAt };
        throw error;
      }
      const nextAllowedAtMs = Math.max(now, Number(state.lastSubmitAtMs || 0) + minSubmitGapMs);
      return writeState({
        ...state,
        source: "pre-submit",
        jobId,
        sceneOrder,
        outputMode,
        now,
        previousSubmitAtMs: state.lastSubmitAtMs ?? null,
        nextAllowedAtMs,
        nextAllowedAt: iso(nextAllowedAtMs),
      }, jobDir);
    },
    async recordSubmit({ jobId = "", sceneOrder = 0, outputMode = "", jobDir = "", now = Date.now() } = {}) {
      return writeState({
        source: "post-submit",
        jobId,
        sceneOrder,
        outputMode,
        now,
        lastSubmitAtMs: now,
        lastSubmitAt: iso(now),
        nextAllowedAtMs: now + minSubmitGapMs,
        nextAllowedAt: iso(now + minSubmitGapMs),
      }, jobDir);
    },
    async recordFlowRateLimit({ jobId = "", sceneOrder = 0, outputMode = "", jobDir = "", now = Date.now() } = {}) {
      const state = await readJson(globalPath);
      return writeState({
        ...state,
        source: "rate-limit-detected",
        failureCode: "FLOW_RATE_LIMITED",
        jobId,
        sceneOrder,
        outputMode,
        now,
        failureCount: Number(state.failureCount || 0) + 1,
        nextAllowedAtMs: now + failureCooldownMs,
        nextAllowedAt: iso(now + failureCooldownMs),
      }, jobDir);
    },
  };
}
