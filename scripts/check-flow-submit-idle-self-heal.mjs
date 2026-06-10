#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");

assert.match(source, /FLOW_SUBMIT_DID_NOT_START/, "video submit idle should keep a specific failure code");
assert.match(source, /async\s+function\s+retryFlowSubmitAfterIdle/, "Flow submit idle should have a shared self-heal retry path");
assert.match(source, /submitAttempt = 2;\s*submitAttempt <= 3/, "Submit idle retry diagnostics should support more than one retry attempt");
assert.match(source, /scene_\$\{sceneOrder\}_flow_submit_retry_state\.json/, "Submit retry state should be persisted for postmortem");
assert.match(source, /FLOW_PROMPT_CARD_CREATED_BUT_NOT_SUBMITTED/, "Prompt-card idle should be classified separately from generic submit idle");
assert.match(source, /flow-submit-idle-self-heal/, "Progress events should expose submit idle self-heal attempts");
assert.doesNotMatch(
  source,
  /if \(outputMode === "image" && error\?\.state\?\.generatorMenuOpen\)/,
  "Submit idle retry should not be limited to image scenes with an open menu",
);

console.log(JSON.stringify({ ok: true, checked: "flow-submit-idle-self-heal" }));
