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
assert.match(flow, /tryAbnormalActivityFallback/, "Flow automation should implement a retry fallback for abnormal activity");
assert.match(flow, /alreadySubmitted/, "Flow automation should check if submission started before doing DOM click fallback");
assert.match(flow, /actionRequired/, "Flow hard failure should be action-required");
assert.match(stages, /isFlowHardFailure/, "workflow stages should forward Flow hard failures as warnings");
assert.match(workflowDbEvents, /FLOW_ABNORMAL_ACTIVITY/, "workflow DB mirror should preserve Flow abnormal activity failures");

// FLOW_GENERATION_FAILED retryable 자동 재시도 계약
const retryableFailure = classifyFlowGenerationFailureText("실패\n생성하는 데 예상보다 오래 걸릴 수 있습니다. 잠시 후 다시 확인해 주세요.\n다시 시도 삭제");
assert.equal(retryableFailure?.code, "FLOW_GENERATION_FAILED", "generation failure card should be classified as FLOW_GENERATION_FAILED");
assert.equal(retryableFailure?.retryable, true, "generation failure card should be retryable");
assert.match(flow, /tryGenerationFailedFallback/, "Flow automation should implement a retry fallback for retryable generation failures");
assert.match(flow, /FLOW_GENERATION_FAILED.*retryable|retryable.*FLOW_GENERATION_FAILED|flowFailure\.retryable/, "wait-loop should check retryable before hard-throwing on FLOW_GENERATION_FAILED");

console.log(JSON.stringify({ ok: true, checked: "flow-abnormal-activity-diagnostics", root }));
