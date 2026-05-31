#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const diagnostics = readFileSync(resolve(root, "automation/chatgpt-thumbnail-diagnostics.mjs"), "utf8");
const source = readFileSync(resolve(root, "automation/chatgpt-thumbnail-source.mjs"), "utf8");

assert.match(diagnostics, /export async function diagnoseChatGptThumbnailState/, "diagnostic probe must export diagnoseChatGptThumbnailState");
assert.match(diagnostics, /composerFound/, "diagnostic report must include composerFound");
assert.match(diagnostics, /imageToolFound/, "diagnostic report must include imageToolFound");
assert.match(diagnostics, /accountLabel/, "diagnostic report should capture visible account label when available");
assert.match(diagnostics, /chatgpt-thumbnail-diagnostics\.json/, "diagnostic report must be persisted");
assert.match(diagnostics, /chatgpt-thumbnail-diagnostics\.png/, "diagnostic screenshot must be persisted");
assert.match(source, /diagnoseChatGptThumbnailState/, "thumbnail source should call diagnostics");
assert.match(source, /phase:\s*"composer-search"/, "thumbnail source should call diagnostics when the composer cannot be found");
assert.match(source, /phase:\s*"image-tool-selection"/, "thumbnail source should call diagnostics when the image tool cannot be selected");

console.log(JSON.stringify({ ok: true, checked: "chatgpt-thumbnail-diagnostics-contract" }));
