#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const analyzer = readFileSync(resolve(root, "scripts/analyze-youtube-output.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(stages, /FLOW_IMAGE_MEDIA_REQUIRED/, "Flow live image failures should stop with media-required failure");
assert.match(analyzer, /FLOW_IMAGE_LOCAL_FALLBACK/, "Analyzer should know local fallback is not original provider media");
assert.match(analyzer, /localFallbackAllowed/, "Analyzer should distinguish explicitly allowed local fallback");
assert.match(analyzer, /severity:\s*localFallbackAllowed \? "warning" : "error"/, "Unapproved local fallback should be an error");
assert.match(analyzer, /providerOrigin/, "Analyzer should inspect provider origin when present in scene manifest");
assert.match(analyzer, /sceneMediaManifest/, "Analyzer should inspect scene-media-manifest provider records");
assert.match(analyzer, /WEB_UI_PROVIDER_MEDIA_REQUIRED/, "Analyzer should fail web-ui scene entries without provider media");
assert.match(packageJson, /check-web-ui-provider-media-required\.mjs/, "package checks should include web UI media-required test");

console.log(JSON.stringify({ ok: true, checked: "web-ui-provider-media-required" }));
