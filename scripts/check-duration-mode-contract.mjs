#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeYouTubeJobRequest, SCRIPT_LENGTH_PRESETS } from "../youtube-job-schema.mjs";
import { buildRenderOptions } from "../youtube-workflow.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const service = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");

assert.match(html, /id="customDurationSeconds"[^>]+value="60"/, "manual duration UI default must be 60, not 120");
assert.match(renderer, /effectiveTargetSeconds|updateDurationPreview/, "renderer should show the actual applied duration");
assert.match(service, /customDurationSeconds:\s*input\.customDurationSeconds\s*\|\|\s*60/, "desktop service default custom duration should be 60");

const job = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: {
    scriptLengthMode: "preset",
    scriptLengthPreset: "standard",
    customDurationSeconds: 120,
  },
});
const renderOptions = buildRenderOptions(job);
assert.equal(SCRIPT_LENGTH_PRESETS.standard.targetSeconds, 60);
assert.equal(renderOptions.targetSeconds, 60, "preset 60s must ignore stale manual 120s value");

const customJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: {
    scriptLengthMode: "custom",
    scriptLengthPreset: "standard",
    customDurationSeconds: 120,
  },
});
assert.equal(buildRenderOptions(customJob).targetSeconds, 120, "custom mode should use manual seconds");

console.log(JSON.stringify({ ok: true, checked: "duration-mode-contract" }));
