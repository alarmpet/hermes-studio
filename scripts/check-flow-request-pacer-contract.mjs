import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pacer = readFileSync(new URL("../electron/services/flow-request-pacer.mjs", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");

assert.match(pacer, /FLOW_GLOBAL_PACING_FILE\s*=\s*"flow-global-pacing\.json"/, "global Flow pacing filename should be stable");
assert.match(pacer, /stateFileName\s*=\s*FLOW_GLOBAL_PACING_FILE/, "Flow pacer should allow per-account state files");
assert.match(pacer, /accountSlotId\s*=\s*"default"/, "Flow pacer should persist account slot metadata");
assert.match(pacer, /accountSlotId,\s*jobId,\s*sceneOrder/s, "Flow pacer writes should include accountSlotId");
assert.match(pacer, /createFlowRequestPacer/, "Flow request pacer should expose a factory");
assert.match(pacer, /recordFlowRateLimit/, "Flow request pacer should persist rate-limit cooldowns");
assert.match(stages, /flowPacer:\s*context\.flowPacer/, "scene media generation should pass the global pacer into Flow automation");

console.log("[flow-request-pacer-contract] ok");
