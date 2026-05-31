#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(resolve(import.meta.dirname, "../automation/gemini-research-draft.mjs"), "utf8");

assert.match(source, /GEMINI_JSON_STABLE_POLLS/, "Gemini wait should use an explicit stable poll constant");
assert.match(source, /GEMINI_JSON_MIN_STABLE_MS/, "Gemini wait should require a minimum stable time before closing");
assert.match(source, /lastGoodCandidateAt/, "Gemini wait should track when the candidate first became stable");
assert.doesNotMatch(source, /stableCount\s*>=\s*2/, "Gemini wait must not close after only two identical polls");
assert.match(source, /waitForJsonResponse\(page,\s*\{/, "Gemini request should pass provider-specific wait options");

console.log(JSON.stringify({ ok: true, checked: "gemini-response-wait-contract" }));
