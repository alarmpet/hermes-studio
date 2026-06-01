#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const workflowDb = readFileSync(resolve(root, "workflow-db-events.mjs"), "utf8");
const telegramBot = readFileSync(resolve(root, "telegram-flow-news-bot.mjs"), "utf8");
const jobService = readFileSync(resolve(root, "electron/services/youtube-job-service.mjs"), "utf8");
const thumbnail = readFileSync(resolve(root, "pipeline/youtube-thumbnail.mjs"), "utf8");
const main = readFileSync(resolve(root, "electron/main.mjs"), "utf8");

assert.match(workflowDb, /FLOW_THUMBNAIL_GENERATION_FAILED/, "workflow DB mirror should classify Flow thumbnail generation failures");
assert.match(workflowDb, /primaryProviderFailure/, "workflow DB mirror should inspect primary provider failures");
assert.match(telegramBot, /flow_thumbnail_generation_failed/, "telegram diagnose should classify Flow thumbnail failures");
assert.match(telegramBot, /Google Flow thumbnail/i, "telegram diagnose should explain Google Flow thumbnail recovery");
assert.match(jobService, /google-flow-thumbnail/, "thumbnail retry diagnostics should use the Flow thumbnail provider label");
assert.match(jobService, /Retrying Google Flow thumbnail generation only/, "thumbnail retry message should no longer say ChatGPT");
assert.match(jobService, /flowTimeoutMs:\s*config\.flowTimeoutMs/, "thumbnail retry should pass Flow timeout");
assert.match(jobService, /thumbnailOverlay:\s*job\?\.options\?\.thumbnailOverlay/, "thumbnail retry should preserve user thumbnail overlay style");
assert.match(thumbnail, /flow-thumbnail-result\.json/, "thumbnail pipeline should persist the Flow thumbnail failure result");
assert.match(thumbnail, /writeFile\(join\(jobDir,\s*"flow-thumbnail-result\.json"\)/, "Flow thumbnail failure must be written to the job folder");
assert.match(main, /writeDesktopResult\(result\.finalVideo\.jobDir,\s*result\)/, "desktop result should include thumbnail and provider failure details, not only finalVideo");

console.log(JSON.stringify({ ok: true, checked: "flow-thumbnail-diagnostics" }));
