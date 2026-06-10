#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isEffectivelyMaximizedBounds } from "../automation/chromium-window-bounds.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flowAutomation = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");
const geminiAutomation = readFileSync(resolve(root, "automation/gemini-research-draft.mjs"), "utf8");

assert.equal(
  isEffectivelyMaximizedBounds({ left: 0, top: 0, width: 1936, height: 1100, windowState: "normal" }),
  true,
  "large normal-state Chrome bounds should be accepted as effectively maximized",
);
assert.equal(
  isEffectivelyMaximizedBounds({ left: 0, top: 0, width: 1280, height: 720, windowState: "normal" }),
  false,
  "small normal-state Chrome bounds should not be accepted",
);
assert.match(flowAutomation, /chromium-window-bounds\.mjs/, "Flow automation should use the shared Chromium bounds guard");
assert.match(geminiAutomation, /chromium-window-bounds\.mjs/, "Gemini automation should use the shared Chromium bounds guard");
assert.doesNotMatch(flowAutomation, /Chrome window did not enter maximized state/, "Flow automation should not hard-fail on a normal state when the bounds are large");
assert.doesNotMatch(geminiAutomation, /Chrome window did not enter maximized state/, "Gemini automation should not hard-fail on a normal state when the bounds are large");

console.log(JSON.stringify({ ok: true, checked: "chromium-window-bounds-contract" }));
