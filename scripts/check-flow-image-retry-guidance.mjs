#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const resume = readFileSync(resolve(root, "scripts/resume-youtube-job-from-assets.mjs"), "utf8");

assert.match(resume, /FLOW_IMAGE_LOCAL_PLACEHOLDER|flow_image_local_fallback/, "Resume script should detect placeholder image scenes");
assert.match(resume, /retryFlowImageScenes|retry image scenes/i, "Resume script should guide image-scene retry instead of blindly rendering placeholders");
assert.match(resume, /sceneOrders/, "Resume guidance should list affected scene orders");

console.log(JSON.stringify({ ok: true, checked: "flow-image-retry-guidance" }));
