#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "automation/gemini-research-draft.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

const mod = await import("../automation/gemini-research-draft.mjs");

assert.equal(
  mod.GEMINI_GEMS_URL,
  "https://gemini.google.com/gem/500bb37978fe",
  "Gemini Gems URL should point at the configured Hermes Gem",
);
assert.match(source, /requestGemsDraft/, "draft builder should have a Gems-first request path");
assert.match(source, /requestGeminiDraft/, "draft builder should keep the normal Gemini fallback path");
assert.ok(
  source.indexOf("requestGemsDraft") < source.indexOf("requestGeminiDraft"),
  "Gems request should be attempted before normal Gemini",
);
assert.match(source, /gemini-gems-request\.txt/, "job output should save the Gems request prompt");
assert.match(source, /gemini-gems-response\.txt/, "job output should save the Gems response");
assert.match(source, /Gems draft failed; trying normal Gemini/i, "Gems failure should emit a normal-Gemini fallback warning");
assert.match(stages, /Gemini Gems/, "workflow progress should tell users that Gemini Gems is tried first");
assert.ok(packageJson.scripts.check.includes("check-gemini-gems-priority"), "npm run check should include the Gems priority contract");

console.log(JSON.stringify({ ok: true, checked: "gemini-gems-priority" }));
