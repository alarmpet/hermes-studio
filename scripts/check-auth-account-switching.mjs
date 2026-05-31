import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const app = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const preload = readFileSync(resolve(root, "electron/preload.mjs"), "utf8");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");
const auth = readFileSync(resolve(root, "electron/services/auth-service.mjs"), "utf8");
const config = readFileSync(resolve(root, "electron/services/config-store.mjs"), "utf8");

for (const target of ["chatgpt", "gemini", "googleFlow", "youtube", "notebooklm", "googleWorkspace"]) {
  assert.match(html, new RegExp(`auth-${target}`), `${target} authenticate button should exist`);
  assert.match(html, new RegExp(`auth-change-${target}`), `${target} change account button should exist`);
  assert.match(html, new RegExp(`auth-clear-${target}`), `${target} clear session button should exist`);
}

assert.match(preload, /authChangeAccount/, "preload should expose authChangeAccount");
assert.match(preload, /authClearSession/, "preload should expose authClearSession");
assert.match(main, /auth:changeAccount/, "main should register auth change IPC");
assert.match(main, /auth:clearSession/, "main should register auth clear IPC");
assert.match(auth, /changeAuthAccount/, "auth service should export changeAuthAccount");
assert.match(auth, /clearAuthSession/, "auth service should export clearAuthSession");
assert.match(config, /notebooklm/, "config should include NotebookLM auth metadata");
assert.match(config, /googleWorkspace/, "config should include Google Workspace auth metadata");
assert.match(app, /authChangeAccount/, "renderer should call authChangeAccount");
assert.match(app, /authClearSession/, "renderer should call authClearSession");

console.log(JSON.stringify({ ok: true, checked: "auth-account-switching" }));
