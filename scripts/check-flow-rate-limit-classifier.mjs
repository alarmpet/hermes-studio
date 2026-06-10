import assert from "node:assert/strict";
import { classifyFlowGenerationFailureText } from "../automation/google-flow-media.mjs";

const korean = classifyFlowGenerationFailureText("생성을 너무 빨리 요청하고 있습니다. 잠시 후 다시 시도해 주세요.");
assert.equal(korean?.code, "FLOW_RATE_LIMITED");
assert.equal(korean?.actionRequired, true);
assert.equal(korean?.retryable, false);

const english = classifyFlowGenerationFailureText("You are requesting generations too fast. Try again later.");
assert.equal(english?.code, "FLOW_RATE_LIMITED");

const abnormal = classifyFlowGenerationFailureText("Google Flow reported abnormal activity for this account.");
assert.equal(abnormal?.code, "FLOW_ABNORMAL_ACTIVITY");

console.log("[flow-rate-limit-classifier] ok");
