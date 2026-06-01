#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const styles = readFileSync(resolve(root, "electron/renderer/styles.css"), "utf8");
const schema = readFileSync(resolve(root, "youtube-job-schema.mjs"), "utf8");
const service = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");
const prompt = readFileSync(resolve(root, "pipeline/youtube-thumbnail-prompt.mjs"), "utf8");
const thumbnail = readFileSync(resolve(root, "pipeline/youtube-thumbnail.mjs"), "utf8");

for (const id of [
  "thumbnailTextEnabled",
  "thumbnailHeadlineText",
  "thumbnailSubheadlineText",
  "thumbnailFontFamily",
  "thumbnailFontWeight",
  "thumbnailTitleFontSize",
  "thumbnailSubFontSize",
  "thumbnailTextColor",
  "thumbnailHighlightColor",
  "thumbnailBackgroundColor",
  "thumbnailBackgroundOpacity",
  "thumbnailPositionY",
  "thumbnailBandHeight",
  "thumbnailPreviewText",
]) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} control should exist`);
}

assert.match(renderer, /readThumbnailOverlayInput/, "renderer should read thumbnail overlay controls into job input");
assert.match(renderer, /updateThumbnailPreview/, "renderer should update thumbnail preview live");
assert.match(renderer, /thumbnailOverlay:/, "renderer should send thumbnailOverlay in job payload");
assert.doesNotMatch(renderer, /지금 확인해야 할 핵심/, "renderer must not inject a generic thumbnail subheadline the user did not enter");
assert.doesNotMatch(html, /지금 확인해야 할 핵심/, "static thumbnail preview must not show a generic subheadline as if it were user input");
assert.match(styles, /\.thumbnail-preview/, "thumbnail preview should have dedicated styles");
assert.match(schema, /thumbnailOverlay/, "job schema should normalize thumbnailOverlay");
assert.match(schema, /titleFontSize/, "thumbnailOverlay should include title font size");
assert.match(schema, /highlightColor/, "thumbnailOverlay should include keyword highlight color");
assert.match(service, /thumbnailOverlay:\s*input\.thumbnailOverlay/, "job service should forward thumbnailOverlay");
assert.match(prompt, /normalizeThumbnailOverlayStyle/, "prompt module should normalize thumbnail overlay style");
assert.doesNotMatch(prompt, /지금 확인해야 할 핵심/, "thumbnail overlay plan must not add a generic subheadline when user input is blank");
assert.match(thumbnail, /overlayPlan\.style/, "thumbnail compositor should apply overlayPlan style");
assert.match(thumbnail, /backgroundOpacity/, "thumbnail compositor should apply background opacity");
assert.match(thumbnail, /positionYPercent/, "thumbnail compositor should apply vertical position");

console.log(JSON.stringify({ ok: true, checked: "thumbnail-overlay-controls" }));
