#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildDesktopJobRequest } from "../electron/services/youtube-job-service.mjs";

const first = buildDesktopJobRequest({
  id: "youtube-test-stable-id",
  sourceType: "url",
  sourceValue: "https://example.com/article",
});
assert.equal(first.id, "youtube-test-stable-id", "desktop service must preserve caller-provided job ids");

const second = buildDesktopJobRequest({
  sourceType: "keyword",
  sourceValue: "테스트 키워드",
});
assert.match(second.id, /^youtube-\d+/, "desktop service should generate a job id when none is provided");

console.log(JSON.stringify({ ok: true, checked: "desktop-job-id-consistency" }));
