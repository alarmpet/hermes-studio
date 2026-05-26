#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getRecentWorkflowEvents } from "../electron/services/workflow-history-service.mjs";

const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
const preload = readFileSync(new URL("../electron/preload.mjs", import.meta.url), "utf8");
const renderer = readFileSync(new URL("../electron/renderer/app.js", import.meta.url), "utf8");

assert.equal(typeof getRecentWorkflowEvents, "function");
assert.match(main, /workflow:recentEvents/, "main should expose workflow history IPC");
assert.match(preload, /workflowRecentEvents/, "preload should expose workflow history to renderer");
assert.match(renderer, /restoreConsoleHistory/, "renderer should restore console history when opening a job");

const events = getRecentWorkflowEvents({
  dbHelperPath: "C:/Users/amd/hermes/bot_db_helper.py",
  jobId: "missing-job-for-test",
  limit: 5,
});
assert.ok(Array.isArray(events), "history lookup should return an array even when no events exist");

console.log(JSON.stringify({ ok: true, checked: "console-history-restore" }));
