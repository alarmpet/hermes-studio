#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const service = readFileSync(new URL("../electron/services/youtube-draft-service.mjs", import.meta.url), "utf8");

assert.match(service, /buildDurationRepairPrompt/, "OpenRouter draft service should repair drafts that fail duration QA");
assert.match(service, /DRAFT_DURATION_TOO_SHORT/, "OpenRouter draft service should specifically catch short narration QA failures");
assert.match(service, /DRAFT_DURATION_TOO_LONG/, "OpenRouter draft service should specifically catch long narration QA failures");
assert.match(service, /openrouter-response-\$\{safeModel\}-repair\.json/, "OpenRouter repaired drafts should be written for diagnostics");
assert.match(service, /Target Korean spoken narration length/, "OpenRouter prompt should include Korean character-count guidance");
assert.match(service, /charsMin|charsMax/, "OpenRouter target should calculate Korean non-space character bounds");
assert.match(service, /maxTokens:\s*3600/, "OpenRouter repair requests should allow more tokens than the initial draft");

console.log("OpenRouter duration repair contract OK");
