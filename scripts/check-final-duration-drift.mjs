#!/usr/bin/env node
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

const result = analyzeYouTubeOutput(resolve(import.meta.dirname, "../tests/fixtures/bad-job-short-duration"));
assert.equal(result.ok, false, "short final duration should fail output QA");
assert.ok(result.failureCodes.includes("TARGET_DURATION_DRIFT"), "short duration drift should use TARGET_DURATION_DRIFT");
assert.equal(result.details.durationDrift, -32.13);

console.log(JSON.stringify({ ok: true, checked: "final-duration-drift" }));
