#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pathResolver = readFileSync(resolve(root, "electron/services/path-resolver.mjs"), "utf8");
const configStore = readFileSync(resolve(root, "electron/services/config-store.mjs"), "utf8");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");

assert.match(pathResolver, /getRuntimePaths/, "path resolver should export getRuntimePaths");
assert.match(pathResolver, /app\.getPath\("userData"\)/, "packaged app should use userData");
assert.match(pathResolver, /chatgpt-profile/, "should define ChatGPT profile path");
assert.match(pathResolver, /flow-profile/, "should define Google Flow profile path");
assert.match(pathResolver, /gemini-profile/, "should define Gemini profile path");
assert.match(pathResolver, /defaultTtsRoot/, "path resolver should expose a user-relative default TTS candidate");
assert.match(configStore, /loadConfig/, "config store should export loadConfig");
assert.match(configStore, /saveConfig/, "config store should export saveConfig");
assert.doesNotMatch(configStore, /C:\/Users\/amd\/supertonic3-local-tts-20260517-r4/, "config defaults must not hardcode the developer TTS path");
assert.match(main, /getRuntimePaths/, "main should use centralized path resolver");
assert.match(main, /config:get/, "main should expose config get IPC");
assert.match(main, /config:save/, "main should expose config save IPC");

console.log(JSON.stringify({ ok: true, checked: "local-studio-product" }));
