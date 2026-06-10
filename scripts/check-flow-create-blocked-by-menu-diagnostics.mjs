import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const media = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");

assert.match(media, /FLOW_CREATE_BUTTON_BLOCKED_BY_SETTINGS_MENU/, "create button blocked by menu should have a specific failure code");
assert.match(media, /blockingOverlayCandidates/, "submit state should include blocking overlay candidates");
assert.match(media, /promptTextboxFocused/, "submit state should include prompt focus details");
assert.match(media, /promptLength/, "submit state should include prompt length details");

console.log("[flow-create-blocked-by-menu-diagnostics] ok");
