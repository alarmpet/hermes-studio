#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const setup = resolve(root, "dist-electron", "Hermes YouTube Studio Setup 1.0.0.exe");
const unpacked = resolve(root, "dist-electron", "win-unpacked", "Hermes YouTube Studio.exe");

assert.ok(existsSync(setup), "setup exe should exist");
assert.ok(existsSync(unpacked), "unpacked exe should exist");
assert.ok(statSync(setup).size > 100_000_000, "setup exe should include Electron runtime");
assert.ok(statSync(unpacked).size > 100_000_000, "unpacked exe should be real executable");

console.log(JSON.stringify({ ok: true, checked: "packaged-local-studio", setup, unpacked }));
