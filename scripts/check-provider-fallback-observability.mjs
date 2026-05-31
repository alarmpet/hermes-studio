#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const gemini = readFileSync(resolve(root, "automation/gemini-research-draft.mjs"), "utf8");
const openrouter = readFileSync(resolve(root, "electron/services/youtube-draft-service.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

assert.match(gemini, /provider-fallback-chain\.json/, "Gemini workflow should persist provider fallback chain");
assert.match(gemini, /provider-fallback-chain\.json\.tmp/, "Provider fallback chain should write to a temp file first");
assert.match(gemini, /rename\(/, "Provider fallback chain should atomically rename temp file into place");
assert.match(gemini, /EACCES|EPERM/, "Atomic provider writes should retry transient Windows file-lock errors");
assert.match(gemini, /delay\(100|100\s*\*\s*attempt/, "Atomic provider writes should use a small retry backoff");
assert.match(gemini, /assertDraftQuality/, "Gemini workflow should use shared draft QA before returning provider drafts");
assert.match(gemini, /failureClass/, "Gemini workflow should classify provider failures");
assert.match(gemini, /interrupted|aborted|provider-run-incomplete/i, "Provider interruptions should be classified");
assert.doesNotMatch(gemini, /PROVIDER_CIRCUIT_BREAKER/, "browser provider failures should not stop OpenRouter fallback");
assert.match(gemini, /Gemini draft failed; using OpenRouter fallback/, "Gemini workflow should fall back to OpenRouter after browser providers fail");
assert.match(openrouter, /openrouter-response-/, "OpenRouter fallback should save raw provider responses");
assert.match(openrouter, /assertDraftQuality/, "OpenRouter fallback should reject bad Korean drafts before returning");
assert.ok(packageJson.scripts.check.includes("check-provider-fallback-observability"), "npm run check should include provider observability contract");

console.log(JSON.stringify({ ok: true, checked: "provider-fallback-observability" }));
