#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runYouTubeJob } from "../youtube-job-runner.mjs";

const root = resolve(import.meta.dirname, "..");
const runner = readFileSync(resolve(root, "youtube-job-runner.mjs"), "utf8");
const telegramBot = readFileSync(resolve(root, "telegram-flow-news-bot.mjs"), "utf8");
const workflow = await import("../youtube-workflow.mjs");

assert.match(runner, /normalizeYouTubeJobRequest/, "Runner should normalize the shared job schema");
assert.match(runner, /runYouTubeJob/, "Runner should export runYouTubeJob");
assert.match(runner, /sendIntermediateMedia/, "Runner should honor final-only media delivery option");
assert.match(runner, /job-started/, "Runner should emit job-started events");
assert.match(runner, /job-completed/, "Runner should emit job-completed events");
assert.match(runner, /generateYouTubeWorkflowAssets/, "Runner should support workflow asset generation stage");
assert.match(runner, /renderFinalYouTubeVideo/, "Runner should support final render stage");

assert.match(telegramBot, /runYouTubeJob/, "Telegram YouTube workflow should route through the shared runner");
assert.match(telegramBot, /buildTelegramYouTubeJobRequest/, "Telegram workflow should normalize messages into job requests");
assert.match(telegramBot, /requestedBy:\s*"telegram"/, "Telegram job requests should mark their origin");
assert.match(telegramBot, /generateSceneMedia/, "Telegram workflow should inject Flow scene generation as a runner stage");
assert.match(telegramBot, /renderFinalVideo/, "Telegram workflow should inject final-only render delivery as a runner stage");

assert.equal(typeof workflow.generateYouTubeWorkflowAssets, "function", "Workflow should export generateYouTubeWorkflowAssets");
assert.equal(typeof workflow.renderFinalYouTubeVideo, "function", "Workflow should export renderFinalYouTubeVideo");

const events = [];
const result = await runYouTubeJob({ sourceType: "keyword", sourceValue: "테스트" }, {
  emit: (event) => events.push(event.type),
  generateYouTubeWorkflowAssets: async (job) => ({ jobId: job.id, scenes: [] }),
  renderFinalYouTubeVideo: async () => ({ finalPath: "C:/tmp/final.mp4" }),
});

assert.equal(result.job.sourceType, "keyword");
assert.deepEqual(events, ["job-started", "assets-ready", "job-completed"]);

console.log(JSON.stringify({ ok: true, checked: "youtube-job-runner" }));
