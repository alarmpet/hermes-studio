#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve("C:/Users/amd/hermes");
const config = readFileSync(resolve(root, "electron/services/config-store.mjs"), "utf8");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const app = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const preload = readFileSync(resolve(root, "electron/preload.mjs"), "utf8");

assert.match(config, /ollamaAssistEnabled:\s*false/);
assert.match(html, /Use local LLM assist|ollamaAssistEnabled/i);
assert.match(html, /ollamaBaseUrl/i);
assert.match(html, /ollamaModel/i);
assert.match(html, /ollamaUseCaseStoryboard/i);
assert.match(html, /ollamaUseCasePromptQa/i);
assert.match(html, /ollamaUseCaseFailureReport/i);
assert.match(html, /ollamaUseCaseUploadMetadata/i);
assert.match(html, /ollamaUseCaseThumbnailIdeas/i);
assert.match(html, /ollamaStatusBadge/i);
assert.match(html, /Only Storyboard assist is active/i);
assert.match(html, /ollamaUnsupportedUseCase/i);
assert.match(app, /ollamaAssistEnabled/);
assert.match(app, /ollamaBaseUrl/);
assert.match(app, /ollamaModel/);
assert.match(app, /ollamaUseCases/);
assert.match(app, /refreshOllamaStatus/);
assert.match(preload, /ollama:health/);
assert.match(preload, /ollamaHealth/);
assert.match(app, /ollamaStatusBadge/);
assert.match(app, /ollamaUnsupportedUseCase/);

console.log(JSON.stringify({ ok: true, checked: "ollama-ui-contract" }));
