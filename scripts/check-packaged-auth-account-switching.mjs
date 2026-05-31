#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";

const root = resolve(import.meta.dirname, "..");
const asarPath = resolve(root, "dist-electron/win-unpacked/resources/app.asar");

assert.ok(existsSync(asarPath), "packaged app.asar should exist before checking packaged auth UI");

const require = createRequire(import.meta.url);
const asar = require("@electron/asar");
const extractDir = mkdtempSync(join(tmpdir(), "hermes-packaged-auth-"));

try {
  asar.extractAll(asarPath, extractDir);
  const html = readFileSync(join(extractDir, "electron/renderer/index.html"), "utf8");
  const renderer = readFileSync(join(extractDir, "electron/renderer/app.js"), "utf8");
  const preload = readFileSync(join(extractDir, "electron/preload.mjs"), "utf8");
  const main = readFileSync(join(extractDir, "electron/main.mjs"), "utf8");
  const authService = readFileSync(join(extractDir, "electron/services/auth-service.mjs"), "utf8");

  for (const target of ["chatgpt", "gemini", "googleFlow", "youtube"]) {
    assert.match(html, new RegExp(`auth-change-${target}`), `packaged UI should include ${target} change account button`);
    assert.match(html, new RegExp(`auth-clear-${target}`), `packaged UI should include ${target} clear session button`);
  }

  assert.match(renderer, /authChangeAccount/, "packaged renderer should call authChangeAccount");
  assert.match(renderer, /authClearSession/, "packaged renderer should call authClearSession");
  assert.match(preload, /authChangeAccount/, "packaged preload should expose authChangeAccount");
  assert.match(preload, /authClearSession/, "packaged preload should expose authClearSession");
  assert.match(main, /auth:changeAccount/, "packaged main should register auth change IPC");
  assert.match(main, /auth:clearSession/, "packaged main should register auth clear IPC");
  assert.match(authService, /changeAuthAccount/, "packaged auth service should export changeAuthAccount");
  assert.match(authService, /clearAuthSession/, "packaged auth service should export clearAuthSession");
} finally {
  rmSync(extractDir, { recursive: true, force: true });
}

console.log(JSON.stringify({ ok: true, checked: "packaged-auth-account-switching" }));
