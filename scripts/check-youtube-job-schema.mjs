#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  DEFAULT_UPLOAD_OPTIONS,
  DEFAULT_YOUTUBE_JOB_OPTIONS,
  normalizeYouTubeJobRequest,
  SCRIPT_LENGTH_PRESETS,
  SUBTITLE_STYLE_PRESETS,
  VOICE_PRESETS,
} from "../youtube-job-schema.mjs";

assert.ok(SCRIPT_LENGTH_PRESETS.short.sceneCount >= 3, "short preset should create multiple scenes");
assert.ok(SCRIPT_LENGTH_PRESETS.standard.targetSeconds >= 60, "standard preset should support normal shorts length");
assert.ok(VOICE_PRESETS.some((voice) => voice.id === "M1"), "Supertonic M1 voice preset should exist");
assert.ok(SUBTITLE_STYLE_PRESETS.some((style) => style.id === "bold-shorts"), "bold shorts subtitle preset should exist");

const keywordJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "최신 AI 뉴스",
  options: { scriptLengthPreset: "standard", voiceId: "M1", subtitleStyleId: "bold-shorts" },
});

assert.equal(keywordJob.sourceType, "keyword");
assert.equal(keywordJob.options.voiceId, "M1");
assert.equal(keywordJob.options.subtitleStyleId, "bold-shorts");
assert.equal(keywordJob.options.scriptLengthPreset, "standard");
assert.equal(keywordJob.options.sceneStrategy, "sentence-proportional");
assert.equal(keywordJob.options.customDurationSeconds, 90);
assert.equal(keywordJob.options.sendIntermediateMedia, false);
assert.equal(keywordJob.upload.enabled, false);
assert.equal(keywordJob.upload.containsSyntheticMedia, true);

const urlJob = normalizeYouTubeJobRequest({
  sourceType: "url",
  sourceValue: "https://example.com/article",
  options: DEFAULT_YOUTUBE_JOB_OPTIONS,
  upload: DEFAULT_UPLOAD_OPTIONS,
});

assert.equal(urlJob.sourceType, "url");
assert.match(urlJob.sourceValue, /^https:\/\//);

const customJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "custom length",
  options: { scriptLengthMode: "custom", customDurationSeconds: 180 },
});

assert.equal(customJob.options.scriptLengthMode, "custom");
assert.equal(customJob.options.customDurationSeconds, 180);

assert.throws(
  () => normalizeYouTubeJobRequest({ sourceType: "keyword", sourceValue: "", options: {} }),
  /sourceValue/,
);

assert.throws(
  () => normalizeYouTubeJobRequest({ sourceType: "url", sourceValue: "not-a-url", options: {} }),
  /http/,
);

console.log(JSON.stringify({ ok: true, checked: "youtube-job-schema" }));
