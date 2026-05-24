#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const stages = await import("../youtube-workflow-stages.mjs");
const dbEvents = await import("../workflow-db-events.mjs");
const runnerSource = readFileSync(resolve(root, "youtube-job-runner.mjs"), "utf8");
const electronService = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");
const telegramBot = readFileSync(resolve(root, "telegram-flow-news-bot.mjs"), "utf8");
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));

for (const name of [
  "buildResearchDraft",
  "generateSceneMedia",
  "renderFinalVideo",
  "generateThumbnail",
  "generateMockMedia",
]) {
  assert.equal(typeof stages[name], "function", `${name} must be exported by shared stages`);
}

assert.equal(typeof stages.createDefaultYouTubeStages, "function", "shared stage factory must be exported");
assert.equal(typeof dbEvents.mirrorWorkflowEventToDb, "function", "workflow DB event helper must be exported");
assert.match(runnerSource, /runYouTubeJob/, "shared runner must remain the production entrypoint");
assert.match(electronService, /createDefaultYouTubeStages/, "Electron must use shared stage factory");
assert.match(telegramBot, /createDefaultYouTubeStages/, "Telegram must use shared stage factory");
assert.doesNotMatch(electronService, /buildDesktopYouTubeDraft\(/, "Electron must not call its old primary OpenRouter draft service directly");
assert.ok(packageJson.build.files.includes("youtube-workflow-stages.mjs"), "Electron package must include shared workflow stages");
assert.ok(packageJson.build.files.includes("workflow-db-events.mjs"), "Electron package must include workflow DB event helper");

console.log(JSON.stringify({ ok: true, checked: "unified-youtube-workflow" }));
