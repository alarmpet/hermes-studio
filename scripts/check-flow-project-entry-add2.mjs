#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const flow = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(flow, /"add_2"/, "Flow project entry should match the current add_2 new-project control");
assert.match(flow, /Flow project start button not found/, "Flow project entry failure should remain diagnosable");
assert.match(packageJson, /check-flow-project-entry-add2\.mjs/, "package checks should include add_2 project entry regression");

console.log(JSON.stringify({ ok: true, checked: "flow-project-entry-add2" }));
