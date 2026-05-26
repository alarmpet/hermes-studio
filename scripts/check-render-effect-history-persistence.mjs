#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
const workflowDbEvents = readFileSync(new URL("../workflow-db-events.mjs", import.meta.url), "utf8");
const dbHelper = readFileSync(new URL("../bot_db_helper.py", import.meta.url), "utf8");

assert.match(main, /renderEffectPreset|transitionPreset|transitionSeconds/, "desktop job history should preserve effect options");
assert.match(workflowDbEvents, /renderEffectPreset|transitionPreset|transitionSeconds/, "workflow DB events should mirror effect options in JSON details");
assert.match(dbHelper, /workflow_json/, "SQLite jobs should keep full workflow JSON for compatibility");
assert.doesNotMatch(dbHelper, /ALTER TABLE jobs ADD COLUMN render_effect_preset/, "do not add indexed SQLite columns until a query UI needs them");

console.log("Render effect history persistence contract OK");
