#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const timelinePath = resolve(root, "timeline.md");

assert.ok(existsSync(timelinePath), "timeline.md should exist at the repository root");
const timeline = readFileSync(timelinePath, "utf8");

assert.match(timeline, /# Hermes Studio Timeline/, "timeline should have a clear title");
assert.match(timeline, /YYYY-MM-DD HH:mm/, "timeline should document the timestamp format");
assert.match(timeline, /기능 추가|수정|삭제|아키텍처 변경/, "timeline should define which changes must be logged");
assert.match(timeline, /Gemini Gems/, "timeline should include the Gemini Gems priority change");

console.log(JSON.stringify({ ok: true, checked: "timeline-contract" }));
