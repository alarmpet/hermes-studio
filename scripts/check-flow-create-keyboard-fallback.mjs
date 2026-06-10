#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const flowAutomation = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");

assert.match(
  flowAutomation,
  /async function submitFlowPromptByKeyboard/,
  "Flow automation should have a keyboard submit fallback when the create button is not exposed as a button",
);
assert.match(
  flowAutomation,
  /createLookupError/,
  "Flow automation should preserve the create button lookup failure for diagnostics",
);
assert.match(
  flowAutomation,
  /Control\+Enter|Meta\+Enter/,
  "Flow keyboard fallback should try the platform submit shortcut",
);
assert.match(
  flowAutomation,
  /Keyboard fallback/,
  "Flow create lookup failures should mention the keyboard fallback in diagnostics",
);
assert.match(
  flowAutomation,
  /verifyFlowSubmissionStarted/,
  "Flow automation must still verify that generation actually started after fallback submit",
);
assert.match(
  flowAutomation,
  /serializeFlowSubmitAttempt/,
  "Flow submit diagnostics should handle keyboard fallback attempts without assuming a create-button coordinate exists",
);
assert.doesNotMatch(
  flowAutomation,
  /mouseClick:\s*\{\s*x:\s*[^}]*positions\.create\.x/s,
  "Flow submit diagnostics should not dereference positions.create directly because keyboard fallback can leave it null",
);

console.log(JSON.stringify({ ok: true, checked: "flow-create-keyboard-fallback" }));
