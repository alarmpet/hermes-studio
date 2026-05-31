import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildNotebookLmResearchPrompt } from "../electron/services/notebooklm-provider.mjs";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const provider = readFileSync(resolve(root, "electron/services/notebooklm-provider.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const gemini = readFileSync(resolve(root, "automation/gemini-research-draft.mjs"), "utf8");

assert.match(provider, /NOTEBOOKLM_TIMEOUT_MS\s*=\s*30_000/, "NotebookLM provider should default to 30 seconds");
assert.match(provider, /withTimeout/, "NotebookLM provider should wrap calls with timeout");
assert.match(provider, /classifyNotebookLmFailure/, "NotebookLM provider should classify timeout/auth/session failures");
assert.match(provider, /requestNotebookLmResearch/, "NotebookLM provider should expose requestNotebookLmResearch");
assert.match(provider, /notebooklm-mcp/, "NotebookLM provider should use the registry provider id");
assert.match(stages, /researchProvider[^;]+notebooklm-mcp/s, "workflow stages should branch on notebooklm-mcp");
assert.match(stages, /notebooklmResearch/, "workflow should pass NotebookLM research into Gemini context");
assert.match(gemini, /NotebookLM research notes/i, "Gemini prompt should include NotebookLM research notes when present");

const prompt = buildNotebookLmResearchPrompt({
  sourceType: "url",
  sourceValue: "https://example.com/news",
  options: { scriptLengthPreset: "standard" },
});
assert.match(prompt, /https:\/\/example\.com\/news/, "NotebookLM prompt should include the source URL");
assert.match(prompt, /facts/i, "NotebookLM prompt should request facts");
assert.match(prompt, /citations/i, "NotebookLM prompt should request citations");

console.log(JSON.stringify({ ok: true, checked: "notebooklm-provider-contract" }));
