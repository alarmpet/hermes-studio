#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const service = readFileSync(resolve(root, "electron/services/webwright-diagnostics-service.mjs"), "utf8");
const config = readFileSync(resolve(root, "electron/services/config-store.mjs"), "utf8");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");
const jobService = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");
const workflowDbEvents = readFileSync(resolve(root, "workflow-db-events.mjs"), "utf8");

assert.match(service, /export async function maybeRunWebwrightDiagnostics/, "service must export maybeRunWebwrightDiagnostics");
assert.match(service, /webwrightDiagnosticsEnabled/, "service must be feature-flagged");
assert.match(service, /diagnostics-webwright/, "service must write under diagnostics-webwright folder");
assert.match(service, /spawn\(/, "service must shell out asynchronously only when enabled and installed");
assert.doesNotMatch(service, /spawnSync/, "service must not block the Electron main process with spawnSync");
assert.match(service, /WEBWRIGHT_NOT_INSTALLED/, "service must handle missing Webwright");
assert.match(config, /webwrightDiagnosticsEnabled:\s*false/, "config default must keep Webwright disabled");
assert.match(main, /createYouTubeJob[\s\S]*config,/, "main process must pass full config into createYouTubeJob context");
assert.match(jobService, /maybeRunWebwrightDiagnostics/, "job service must call diagnostics on browser failures");
assert.match(workflowDbEvents, /CHATGPT_/, "workflow DB mirror must persist ChatGPT primary provider failures");
assert.match(workflowDbEvents, /primaryProviderFailure/, "workflow DB mirror must detect thumbnail primary provider failures");

console.log(JSON.stringify({ ok: true, checked: "webwright-diagnostics-contract" }));
