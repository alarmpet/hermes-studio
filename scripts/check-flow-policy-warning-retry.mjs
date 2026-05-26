#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const thisFile = readFileSync(fileURLToPath(import.meta.url), "utf8");
const flow = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");

assert.doesNotMatch(thisFile, /C:[/\\]Users[/\\]amd[/\\]hermes/i, "check script must not hardcode the local repo path");
assert.match(flow, /isFlowPolicyWarningText/, "Flow automation should detect policy warning text");
assert.match(flow, /policy-warning/, "Flow automation should persist policy warning diagnostics");
assert.match(flow, /safeFallbackPrompt/, "Flow automation should retry with safe fallback prompt");
assert.match(stages, /flow_prompt_safety/, "workflow should emit prompt safety metadata");
assert.match(flow, /flow-policy-warning/, "Flow automation should emit policy warning event details");
assert.match(flow + stages, /recovered/, "Flow policy retry should expose recovery status");
assert.match(flow + stages, /originalPromptHash|sanitizedPromptHash/, "policy events should use prompt hashes for diagnostics");
assert.match(flow, /extendFlowDeadlineForPolicyRetry/, "Flow policy retry should extend generation deadline once");

console.log(JSON.stringify({ ok: true, checked: "flow-policy-warning-retry", root }));
