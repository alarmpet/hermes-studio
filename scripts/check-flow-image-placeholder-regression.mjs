#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const analyzer = readFileSync(resolve(root, "scripts/analyze-youtube-output.mjs"), "utf8");

assert.match(
  stages,
  /FLOW_IMAGE_SUBMIT_DID_NOT_START/,
  "Flow image submit failures should have a specific failure code, not only generic no-media fallback",
);
assert.match(
  stages,
  /actionRequired:\s*true|throw new Error/,
  "Live Flow image submit failures must not silently produce production placeholder scenes",
);
assert.match(
  analyzer,
  /FLOW_IMAGE_LOCAL_PLACEHOLDER/,
  "Output analyzer should flag local placeholder image scenes in live jobs",
);
assert.match(
  analyzer,
  /scene_\$\{.*\}_flow_image_local_fallback\.json|_flow_image_local_fallback\.json/,
  "Output analyzer should inspect persisted image fallback state files",
);

console.log(JSON.stringify({ ok: true, checked: "flow-image-placeholder-regression" }));
