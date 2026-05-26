#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const dbEvents = readFileSync(resolve(root, "workflow-db-events.mjs"), "utf8");

assert.match(workflow, /scriptStructure/, "workflow should emit scriptStructure metadata");
assert.match(workflow, /hpslOffsets|hpslSectionSeconds/, "workflow should include HPSL section timing metadata");
assert.match(workflow, /sceneSectionMap/, "workflow should include scene-to-HPSL section mapping");
assert.match(dbEvents, /details:\s*event\.details/, "workflow DB mirror should preserve structured event details");

console.log(JSON.stringify({ ok: true, checked: "hpsl-workflow-observability" }));
