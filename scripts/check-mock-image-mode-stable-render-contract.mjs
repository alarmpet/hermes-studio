#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const stages = readFileSync(new URL("../youtube-workflow-stages.mjs", import.meta.url), "utf8");
const packageJson = readFileSync(new URL("../package.json", import.meta.url), "utf8");

assert.match(stages, /function isImageSceneMode/, "mock media should classify image scenes explicitly");
assert.match(stages, /scene_\$\{scene\.order\}_flow\.png/, "mock image scenes should create the same still-image source contract as Flow image scenes");
assert.match(stages, /await renderImageSceneClip/, "mock image scenes should render through the stable image sequence renderer");
assert.match(stages, /sourceContentType:\s*"image\/png"/, "mock image scene metadata should expose the still source content type");
assert.match(stages, /originalPath:\s*stillPath/, "mock image scene metadata should preserve the still image source path");
assert.match(packageJson, /check-mock-image-mode-stable-render-contract\.mjs/, "package checks should include mock image mode stable render contract");

console.log(JSON.stringify({ ok: true, checked: "mock-image-mode-stable-render-contract" }));
