#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DEFAULT_YOUTUBE_JOB_OPTIONS, normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

assert.equal(DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaAssistEnabled, false);
assert.equal(DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaBaseUrl, "http://127.0.0.1:11434");
assert.match(DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaModel, /gemma/i);
assert.equal(DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaUseCases.storyboard, true);
assert.equal(DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaUseCases.promptQa, true);
assert.equal(DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaUseCases.failureReport, true);
assert.equal(DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaUseCases.uploadMetadata, false);
assert.equal(DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaUseCases.thumbnailIdeas, false);
assert.equal(DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaUseCases.scriptPolish, false);
assert.equal(DEFAULT_YOUTUBE_JOB_OPTIONS.ollamaUseCases.researchDigest, false);

const normalized = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "첫 장면입니다. 둘째 장면입니다.",
  options: {
    ollamaAssistEnabled: true,
    ollamaBaseUrl: "http://192.168.0.20:11434/",
    ollamaModel: "gemma4:12b",
    ollamaTimeoutMs: 30000,
  },
});

assert.equal(normalized.options.ollamaAssistEnabled, true);
assert.equal(normalized.options.ollamaBaseUrl, "http://192.168.0.20:11434");
assert.equal(normalized.options.ollamaModel, "gemma4:12b");
assert.equal(normalized.options.ollamaTimeoutMs, 30000);

const qwen = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "첫 장면입니다. 둘째 장면입니다.",
  options: { ollamaAssistEnabled: true, ollamaModel: "qwen2.5:14b" },
});
assert.equal(qwen.options.ollamaModel, "qwen2.5:14b");

const partialUseCases = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "첫 장면입니다. 둘째 장면입니다.",
  options: {
    ollamaAssistEnabled: true,
    ollamaUseCases: { storyboard: false, uploadMetadata: true },
  },
});
assert.equal(partialUseCases.options.ollamaUseCases.storyboard, false);
assert.equal(partialUseCases.options.ollamaUseCases.promptQa, true);
assert.equal(partialUseCases.options.ollamaUseCases.uploadMetadata, true);
assert.equal(partialUseCases.options.ollamaUseCases.thumbnailIdeas, false);

const configStore = readFileSync(resolve("C:/Users/amd/hermes/electron/services/config-store.mjs"), "utf8");
assert.match(configStore, /ollamaAssistEnabled:\s*false/);
assert.match(configStore, /ollamaBaseUrl:\s*"http:\/\/127\.0\.0\.1:11434"/);
assert.match(configStore, /ollamaModel:/);
assert.match(configStore, /ollamaUseCases/);

console.log(JSON.stringify({ ok: true, checked: "ollama-job-options-contract" }));
