#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const schema = readFileSync(resolve(root, "youtube-job-schema.mjs"), "utf8");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const renderer = readFileSync(resolve(root, "scripts/render-youtube-with-tts.mjs"), "utf8");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const app = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");

assert.match(schema, /hasExplicitTitleOverlayEnabled/, "schema should distinguish explicit longform title overlay opt-in");
assert.match(schema, /titleOverlayStyleId/, "schema should validate title overlay style");
assert.match(workflow, /titleOverlay:\s*\{/, "workflow should write title overlay render options");
assert.match(renderer, /createTitleOverlayImage/, "renderer should generate a title overlay PNG");
assert.match(renderer, /title-overlay\.png/, "renderer should persist the title overlay PNG");
assert.match(renderer, /filter_complex/, "renderer should use one final filter_complex encode for title and subtitles");
assert.match(renderer, /overlay=0:0\[v_title\]/, "renderer should create a titled video stream before subtitle burn-in");
assert.match(renderer, /\[v_title\]\$\{subtitleFilter\}\[v\]/, "renderer should apply subtitleFilter after the title overlay stream");
assert.doesNotMatch(renderer, /merged-scenes-titled\.mp4/, "renderer should not create a second re-encoded titled intermediate");
assert.match(renderer, /stop-opacity/, "SVG gradients should use stop-opacity instead of rgba stop-color");
assert.match(renderer, /fill-opacity/, "SVG backgrounds should use fill-opacity");
assert.match(renderer, /title-overlay\.json/, "renderer should persist title overlay metadata");
assert.match(html, /id="titleOverlayEnabled"/, "Studio UI should expose title overlay toggle");
assert.match(html, /id="titleOverlayPreview"/, "Studio UI should preview top title style");
assert.match(app, /titleOverlayText/, "renderer should submit manual title overlay text");

console.log(JSON.stringify({ ok: true, checked: "title-overlay-render-contract" }));
