import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createFlowRequestPacer,
  flowGlobalPacingPath,
} from "../electron/services/flow-request-pacer.mjs";

const userData = await mkdtemp(join(tmpdir(), "hermes-flow-pacing-"));
const jobDir = await mkdtemp(join(tmpdir(), "hermes-flow-job-"));

try {
  const pacer = createFlowRequestPacer({ userData, minSubmitGapMs: 10_000, failureCooldownMs: 90_000 });
  await pacer.recordSubmit({ jobId: "job-a", sceneOrder: 1, outputMode: "image", now: 1_000 });
  await pacer.recordFlowRateLimit({ jobId: "job-a", sceneOrder: 1, outputMode: "image", jobDir, now: 2_000 });
  const globalState = JSON.parse(await readFile(flowGlobalPacingPath({ userData }), "utf8"));
  const jobState = JSON.parse(await readFile(join(jobDir, "flow-request-pacing.json"), "utf8"));

  assert.equal(globalState.failureCode, "FLOW_RATE_LIMITED");
  assert.equal(globalState.jobId, "job-a");
  assert.ok(globalState.nextAllowedAtMs >= 92_000);
  assert.equal(jobState.source, "rate-limit-detected");
  assert.equal(jobState.failureCode, "FLOW_RATE_LIMITED");
} finally {
  await rm(userData, { recursive: true, force: true });
  await rm(jobDir, { recursive: true, force: true });
}

console.log("[flow-global-pacing-state] ok");
