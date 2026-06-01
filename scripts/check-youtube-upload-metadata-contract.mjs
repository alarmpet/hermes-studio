#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "..");
const servicePath = resolve(root, "electron/services/youtube-upload-metadata.mjs");
const service = readFileSync(servicePath, "utf8");

assert.match(service, /buildDefaultUploadMetadata/, "upload metadata service should build defaults from a completed job");
assert.match(service, /sanitizeUploadMetadata/, "upload metadata service should sanitize user-editable metadata");
assert.match(service, /validateUploadMetadata/, "upload metadata service should validate upload metadata before API calls");
assert.match(service, /readUploadMetadata/, "upload metadata service should read per-job upload metadata");
assert.match(service, /writeUploadMetadata/, "upload metadata service should persist per-job upload metadata");
assert.match(service, /readUploadState/, "upload metadata service should read per-job upload state");
assert.match(service, /writeUploadState/, "upload metadata service should persist per-job upload state");
assert.match(service, /createReadStream/, "duplicate-upload hash should use stream-based hashing");
assert.match(service, /createHash\("sha256"\)/, "duplicate-upload hash should use sha256");
assert.match(service, /validateThumbnailForYouTube/, "thumbnail validation should happen before upload");
assert.match(service, /2\s*\*\s*1024\s*\*\s*1024/, "thumbnail validation should enforce YouTube 2MB custom thumbnail limit");
assert.match(service, /jpg|jpeg|png/i, "thumbnail validation should allow YouTube-supported image extensions");

const module = await import(pathToFileURL(servicePath).href);
const sanitized = module.sanitizeUploadMetadata({
  title: "  <b>Test Title</b>  ",
  description: "<p>Hello</p>\nWorld",
  tags: ["#AI", "AI", " news ", "", "#news"],
  privacyStatus: "public",
  containsSyntheticMedia: false,
});

assert.equal(sanitized.title, "Test Title");
assert.equal(sanitized.description, "Hello World");
assert.deepEqual(sanitized.tags, ["AI", "news"]);
assert.equal(sanitized.privacyStatus, "public");
assert.equal(sanitized.containsSyntheticMedia, false);
assert.equal(module.validateUploadMetadata({ ...sanitized, jobId: "youtube-test", videoPath: "C:/video.mp4" }).ok, true);
assert.equal(module.validateUploadMetadata({ ...sanitized, title: "" }).ok, false);
assert.equal(module.validateUploadMetadata({ ...sanitized, privacyStatus: "friends" }).ok, false);

console.log(JSON.stringify({ ok: true, checked: "youtube-upload-metadata-contract" }));
