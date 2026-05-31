#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

assert.match(main, /desktop-failure\.json/, "desktop failures should be persisted into the job folder");
assert.match(main, /jobIdFromInput|activeJobDir/, "failure persistence should know which job directory to write to");
assert.match(main, /sanitizeFailurePayload|redactSensitive/, "desktop failure persistence should sanitize sensitive values");
assert.ok(packageJson.scripts.check.includes("check-desktop-failure-persistence"), "npm run check should include desktop failure persistence contract");

console.log(JSON.stringify({ ok: true, checked: "desktop-failure-persistence" }));
