#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const geminiResearch = readFileSync(resolve(root, "automation/gemini-research-draft.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

assert.match(geminiResearch, /research_brief|sourceEvidence|source_grounding/i, "Gemini/Gems prompt should include source grounding evidence");
assert.match(geminiResearch, /exact keyword|required keyword|missingTokens/i, "Keyword jobs should require the exact subject token");
assert.match(stages, /research_brief\.json|persistResearchBrief/i, "Workflow should persist research brief evidence for audit");
assert.ok(packageJson.scripts.check.includes("check-research-grounding-contract"), "npm run check should include research grounding contract");

console.log(JSON.stringify({ ok: true, checked: "research-grounding-contract" }));
