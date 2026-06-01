#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const upload = readFileSync(resolve(root, "pipeline/youtube-upload.mjs"), "utf8");

assert.match(upload, /clientSecretsPath/, "upload service should accept clientSecretsPath for OAuth refresh");
assert.match(upload, /saveYouTubeToken/, "upload service should persist refreshed OAuth tokens");
assert.match(upload, /\.on\("tokens"/, "upload service should listen for OAuth token refresh events");
assert.match(upload, /videos\.insert/, "upload service should call YouTube videos.insert");
assert.match(upload, /thumbnails\(\)\.set|thumbnails\.set/, "upload service should bind custom thumbnail after video upload");
assert.match(upload, /containsSyntheticMedia/, "upload service should preserve synthetic media flag");
assert.match(upload, /selfDeclaredMadeForKids/, "upload service should pass made-for-kids status");
assert.match(upload, /createReadStream/, "upload service should stream video and thumbnail files");
assert.doesNotMatch(upload, /status:\s*"upload-not-executed"/, "upload service should not return upload-not-executed stub");

console.log(JSON.stringify({ ok: true, checked: "youtube-upload-service-contract" }));
