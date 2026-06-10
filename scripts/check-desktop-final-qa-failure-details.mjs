#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");

assert.match(main, /desktop-job-failed/, "desktop job failures should still emit failure events");
assert.match(main, /failureDetails/, "desktop job failure event should include structured failureDetails");
assert.match(main, /render-report-v2\.json|auto-failure-report/, "failure handling should preserve render QA report path or automatic failure report path");

console.log(JSON.stringify({ ok: true, checked: "desktop-final-qa-failure-details" }));
