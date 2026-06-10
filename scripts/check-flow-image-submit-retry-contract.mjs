#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");

assert.match(source, /FLOW_IMAGE_SUBMIT_DID_NOT_START/, "Image submit idle failure should use a specific code");
assert.match(source, /retryFlowImageSubmitAfterIdle/, "Image submit idle state should trigger one explicit retry");
assert.match(source, /generatorMenuOpen/, "Submit diagnostics should record whether the generator settings menu is still open");
assert.match(source, /submitAttempt = 2/, "Retry diagnostics should record the second submit attempt");
assert.match(source, /scene_\$\{sceneOrder\}_flow_submit_retry_state\.json/, "Retry state should be persisted for later debugging");

console.log(JSON.stringify({ ok: true, checked: "flow-image-submit-retry-contract" }));
