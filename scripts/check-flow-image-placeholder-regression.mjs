#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const analyzer = readFileSync(resolve(root, "scripts/analyze-youtube-output.mjs"), "utf8");

assert.match(
  stages,
  /FLOW_IMAGE_MEDIA_REQUIRED/,
  "Flow image failures should have a specific media-required code, not silently produce local fallback media",
);
assert.match(
  stages,
  /actionRequired:\s*true|throw new Error/,
  "Live Flow image submit failures must not silently produce production placeholder scenes",
);
assert.doesNotMatch(
  stages,
  /\|\|\s*flowImageProviderExhausted/,
  "Retryable provider failures must not automatically opt live jobs into local fallback final media",
);
assert.match(
  analyzer,
  /FLOW_IMAGE_LOCAL_PLACEHOLDER/,
  "Output analyzer should warn about local fallback image scenes in live jobs",
);
assert.match(
  analyzer,
  /failureCodes\.push\(placeholderSceneOrders\.length \? "FLOW_IMAGE_LOCAL_PLACEHOLDER" : "FLOW_IMAGE_LOCAL_FALLBACK"\)/,
  "Unapproved local Flow fallback should hard-fail final QA in live jobs",
);
assert.match(
  analyzer,
  /severity:\s*localFallbackAllowed \? "warning" : "error"/,
  "Local Flow fallback should be an error unless explicitly allowed",
);
assert.match(
  analyzer,
  /scene_\$\{.*\}_flow_image_local_fallback\.json|_flow_image_local_fallback\.json/,
  "Output analyzer should inspect persisted image fallback state files",
);

console.log(JSON.stringify({ ok: true, checked: "flow-image-placeholder-regression" }));
