#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateDraftQuality } from "./youtube-draft-quality.mjs";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

const fixture = resolve(import.meta.dirname, "../tests/fixtures/bad-job-1779789068109");
const draft = JSON.parse(readFileSync(resolve(fixture, "draft.json"), "utf8"));
const draftQa = validateDraftQuality({ draft, stage: "regression", jobDir: fixture });
assert.equal(draftQa.ok, true, "latest failed job fixture should not reject valid UTF-8 Korean draft");

const outputQa = analyzeYouTubeOutput(fixture);
assert.equal(outputQa.ok, false, "latest failed output should be rejected");
assert.ok(outputQa.failureCodes.includes("TARGET_DURATION_DRIFT"));

console.log(JSON.stringify({ ok: true, checked: "latest-failed-job-regression" }));
