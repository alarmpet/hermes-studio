import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createFailureProgressEvent } from "../electron/services/job-progress-events.mjs";

const event = createFailureProgressEvent({
  jobId: "job-rate",
  message: "FLOW_RATE_LIMITED: Google Flow requested cooldown.",
  details: { failureCode: "FLOW_RATE_LIMITED", nextAllowedAt: "2026-06-09T15:00:00.000Z" },
});

assert.equal(event.status, "action-required");
assert.equal(event.phase, "flow-media");
assert.equal(event.details.actionRequired, true);
assert.deepEqual(event.details.failureCodes, ["FLOW_RATE_LIMITED"]);
assert.match(event.actionRequired?.message || "", /cooldown|wait/i);

const dbSource = readFileSync(new URL("../workflow-db-events.mjs", import.meta.url), "utf8");
assert.match(dbSource, /FLOW_RATE_LIMITED/, "DB event mirror should preserve FLOW_RATE_LIMITED as its own failure code");

console.log("[flow-rate-limit-action-required] ok");
