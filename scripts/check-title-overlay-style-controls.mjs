#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const html = readFileSync(resolve(root, "electron/renderer/index.html"), "utf8");
const app = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");
const styles = readFileSync(resolve(root, "electron/renderer/styles.css"), "utf8");
const schema = readFileSync(resolve(root, "youtube-job-schema.mjs"), "utf8");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const renderer = readFileSync(resolve(root, "scripts/render-youtube-with-tts.mjs"), "utf8");

for (const id of [
  "titleOverlayFontFamily",
  "titleOverlayFontWeight",
  "titleOverlayFontSize",
  "titleOverlayTextColor",
  "titleOverlayHighlightColor",
  "titleOverlayBackgroundColor",
  "titleOverlayBackgroundOpacity",
  "titleOverlayPositionY",
  "titleOverlayBandHeight",
  "titleOverlayHorizontalPadding",
  "titleOverlayOutlineWidth",
]) {
  assert.match(html, new RegExp(`id="${id}"`), `${id} control should exist`);
}

assert.match(app, /readTitleOverlayStyleInput/, "renderer should read Top Title style controls");
assert.match(app, /titleOverlayStyle:/, "job payload should include titleOverlayStyle");
assert.match(app, /updateTitleOverlayPreview/, "Top Title preview should update live");
assert.match(styles, /--title-overlay-highlight/, "preview should expose highlight color CSS var");
assert.match(schema, /normalizeTitleOverlayStyle/, "schema should normalize titleOverlayStyle");
assert.match(workflow, /titleOverlayStyle/, "workflow should persist title overlay style");
assert.match(renderer, /overlay\.style/, "final renderer should apply title overlay style object");
assert.match(renderer, /fontFamily/, "renderer should apply selected font family");
assert.match(renderer, /backgroundOpacity/, "renderer should apply selected background opacity");

console.log(JSON.stringify({ ok: true, checked: "title-overlay-style-controls" }));
