#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workflowDbEvents = readFileSync(resolve(root, "workflow-db-events.mjs"), "utf8");

assert.match(workflowDbEvents, /youtube-upload-failed/, "workflow DB mirror should recognize YouTube upload failures");
for (const code of [
  "YOUTUBE_OAUTH_EXPIRED",
  "YOUTUBE_TOKEN_MISSING",
  "YOUTUBE_QUOTA_EXCEEDED",
  "YOUTUBE_NETWORK_INTERRUPTED",
  "YOUTUBE_THUMBNAIL_INVALID",
  "YOUTUBE_THUMBNAIL_TOO_LARGE",
  "YOUTUBE_DUPLICATE_UPLOAD_BLOCKED",
]) {
  assert.match(workflowDbEvents, new RegExp(code), `workflow DB mirror should preserve ${code}`);
}
assert.match(workflowDbEvents, /prefixFailureCode/, "workflow DB mirror should prefix task_failures error messages");

console.log(JSON.stringify({ ok: true, checked: "youtube-upload-db-events-contract" }));
