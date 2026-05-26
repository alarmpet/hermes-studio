#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const localJobDir = "C:/Users/amd/AppData/Roaming/hermes/outputs/desktop/youtube-1779707345681";
const fixtureJobDir = resolve(root, "tests/fixtures/bad-job-1779707345681");
const jobDir = existsSync(localJobDir) ? localJobDir : fixtureJobDir;

assert.ok(existsSync(jobDir), `bad output fixture is missing: ${jobDir}`);

const result = analyzeYouTubeOutput(jobDir);

assert.equal(result.ok, false, "known bad artifact must fail final output QA");
assert.ok(result.failureCodes.includes("DUPLICATE_FULL_SCRIPT_SCENE"), "scene 5 repeats the whole script");
assert.ok(result.failureCodes.includes("HARD_FREEZE_RISK"), "scene 5 pads 8s video to ~37s audio");
assert.ok(result.failureCodes.includes("TARGET_DURATION_DRIFT"), "final duration should not drift");
assert.ok(result.failureCodes.includes("MISSING_HPSL_CONTRACT"), "old runtime has no HPSL");

console.log(JSON.stringify({ ok: true, checked: "final-output-artifact-qa", fixture: jobDir, result }, null, 2));
