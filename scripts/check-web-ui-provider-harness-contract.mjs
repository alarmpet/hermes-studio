#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const contract = readFileSync(resolve(root, "automation/web-ui-provider-contract.mjs"), "utf8");
const harness = readFileSync(resolve(root, "automation/web-ui-provider-harness.mjs"), "utf8");
const auth = readFileSync(resolve(root, "automation/web-ui-auth-window.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(contract, /export function createWebUiProviderSuccess/, "contract should expose success result builder");
assert.match(contract, /export function createWebUiProviderFailure/, "contract should expose failure result builder");
assert.match(contract, /providerOrigin:\s*"web-ui"/, "provider results should mark web-ui origin");
assert.match(contract, /assertProviderMediaResult/, "contract should expose media result validator");
assert.match(contract, /bytes[\s\S]*<=\s*0/, "validator should require non-empty media bytes");
assert.match(contract, /contentType/, "validator should require content type");
assert.match(contract, /evidence/, "provider results should carry evidence paths");
assert.match(harness, /export async function createWebUiProviderContext/, "harness should create persistent Playwright contexts");
assert.match(harness, /launchPersistentContext/, "harness should use persistent browser profiles for logged-in sessions");
assert.match(harness, /releaseAppManagedAuthWindow/, "harness should release app-managed profile locks before launching");
assert.match(harness, /maximizeChromiumWindow\(page,/, "harness should maximize using the Playwright page object");
assert.match(harness, /locale:\s*"ko-KR"/, "harness should preserve Korean locale for stable UI labels");
assert.match(harness, /acceptDownloads:\s*true/, "harness should allow provider media downloads");
assert.match(harness, /startWebUiTrace/, "harness should support Playwright trace start");
assert.match(harness, /stopWebUiTrace/, "harness should support Playwright trace stop");
assert.match(harness, /enableWebUiTracing/, "harness should gate tracing behind job options or environment");
assert.match(harness, /saveSuccessfulWebUiTrace/, "harness should avoid successful trace ZIPs unless explicitly requested");
assert.match(harness, /writeWebUiEvidence/, "harness should persist screenshots and snapshots");
assert.match(harness, /page\.screenshot/, "evidence helper should save screenshots");
assert.match(harness, /textContent/, "evidence helper should save page text snapshots");
assert.match(auth, /wmic process/, "auth window helper should release chrome processes holding the profile");
assert.match(packageJson, /check-web-ui-provider-harness-contract\.mjs/, "package checks should include web UI provider harness contract");

console.log(JSON.stringify({ ok: true, checked: "web-ui-provider-harness-contract" }));
