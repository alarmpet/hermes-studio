#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFlowGenerationFailureText } from "../automation/google-flow-media.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flow = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const workflowDbEvents = readFileSync(resolve(root, "workflow-db-events.mjs"), "utf8");

const koreanFailure = classifyFlowGenerationFailureText("warning\n실패\n비정상적인 활동이 감지되었습니다. 자세한 내용은 고객센터를 참고하세요.\nrefresh 다시 시도");
assert.equal(koreanFailure.code, "FLOW_ABNORMAL_ACTIVITY");
assert.equal(koreanFailure.reason, "flow-abnormal-activity");
assert.equal(koreanFailure.actionRequired, true);
assert.equal(koreanFailure.retryable, false);

const englishFailure = classifyFlowGenerationFailureText("Failed. Unusual activity detected. Try again later.");
assert.equal(englishFailure.code, "FLOW_ABNORMAL_ACTIVITY");

const mojibakeFailure = classifyFlowGenerationFailureText("warning\n?ㅽ뙣\n鍮꾩젙?곸쟻???쒕룞??媛먯??섏뿀?듬땲?? ?먯꽭???댁슜? 怨좉컼?쇳꽣瑜?李멸퀬?섏꽭??\nrefresh\n?ㅼ떆 ?쒕룄");
assert.equal(mojibakeFailure.code, "FLOW_ABNORMAL_ACTIVITY");

const genericFailure = classifyFlowGenerationFailureText("failed\nretry\nreuse prompt");
assert.equal(genericFailure.code, "FLOW_GENERATION_FAILED");

assert.match(flow, /writeFlowFailureDiagnostics/, "Flow automation should persist hard failure diagnostics");
assert.match(flow, /flow-abnormal-activity/, "Flow automation should classify abnormal activity");
assert.match(flow, /FLOW_ABNORMAL_ACTIVITY/, "Flow automation should expose a searchable failure code");
assert.match(flow, /actionRequired/, "Flow hard failure should be action-required");
assert.match(stages, /isFlowHardFailure/, "workflow stages should forward Flow hard failures as warnings");
assert.match(workflowDbEvents, /FLOW_ABNORMAL_ACTIVITY/, "workflow DB mirror should preserve Flow abnormal activity failures");

console.log(JSON.stringify({ ok: true, checked: "flow-abnormal-activity-diagnostics", root }));
