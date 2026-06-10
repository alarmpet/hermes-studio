import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { classifyFlowGenerationFailureText } from "../automation/google-flow-media.mjs";

const media = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");
const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");

const cancelled = classifyFlowGenerationFailureText("I've cancelled that generation. Are there any changes you'd like to make before we try again?");
assert.equal(cancelled?.code, "FLOW_GENERATION_CANCELLED");
assert.equal(cancelled?.retryable, true);
assert.equal(cancelled?.actionRequired, false);

const stalled = classifyFlowGenerationFailureText("\uc0dd\uc131\uc774 \uc911\ub2e8\ub418\uc5c8\uc2b5\ub2c8\ub2e4. generation stopped without media.");
assert.equal(stalled?.code, "FLOW_GENERATION_STALLED");
assert.equal(stalled?.retryable, true);
assert.equal(stalled?.actionRequired, false);

const disclaimerOnly = classifyFlowGenerationFailureText("Flow\ub294 \uc2e4\uc218\ub97c \ud560 \uc218 \uc788\uc73c\ub2c8 \ub2e4\uc2dc \ud55c\ubc88 \ud655\uc778\ud558\uc138\uc694. \ubbf8\ub514\uc5b4 \ub9cc\ub4e4\uae30\ub97c \uc2dc\uc791\ud558\uac70\ub098 \ubbf8\ub514\uc5b4\ub97c \ub4dc\ub86d\ud558\uc138\uc694.");
assert.equal(disclaimerOnly, null, "Flow's persistent disclaimer and empty-gallery copy must not be treated as a failure by itself");

assert.match(media, /FLOW_GENERATION_CANCELLED/, "Flow cancellation should have a specific failure code");
assert.match(media, /FLOW_GENERATION_STALLED/, "Flow stalled idle state should have a specific failure code");
assert.match(stages, /flow-video-cancelled-image-fallback/, "video cancellation should route to an image fallback event");
assert.match(stages, /originalSceneOutputMode:\s*"video"/, "image fallback should record original video mode");
assert.match(stages, /FLOW_GENERATION_STALLED/, "video stalled state should route through the same image fallback");
assert.match(stages, /Flow did not expose a new video URL/, "generic no-new-video failures should also route to image fallback");
assert.match(stages, /fallbackReason:\s*error\.failureCode/, "image fallback should persist the exact failure reason");
assert.match(stages, /outputMode:\s*"image"/, "video cancellation fallback should request Flow image generation");

console.log("[flow-cancelled-fallback-contract] ok");
