import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const media = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");

assert.match(media, /async function rejectFlowVideoCreditConfirmation/, "Flow automation should explicitly reject video credit confirmation dialogs");
assert.match(media, /FLOW_VIDEO_CREDIT_CONFIRMATION_REJECTED/, "Video credit rejection should have a stable failure code");
assert.match(media, /\\uac70\\ubd80\|reject\|decline\|cancel/, "Reject button detection should include Korean and English labels");
assert.match(media, /if \(outputMode === "video"\)[\s\S]*rejectFlowVideoCreditConfirmation/, "Credit rejection should apply to video mode before approval handling");
assert.match(stages, /FLOW_VIDEO_CREDIT_CONFIRMATION_REJECTED/, "Video credit rejection should route to the video-to-image fallback path");

console.log("[flow-video-credit-reject-contract] ok");
