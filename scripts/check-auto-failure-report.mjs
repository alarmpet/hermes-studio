#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const result = spawnSync(process.execPath, [
  path.join(root, "telegram-flow-news-bot.mjs"),
  "--test-auto-failure-report",
  "--task",
  "flow-video",
  "--request",
  "new project button not found scenario for flow automation",
  "--error",
  "new project button not found",
], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
});

if (result.error) throw result.error;
if (result.status !== 0) {
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(result.stdout);
} catch {
  console.error(`Invalid JSON from --test-auto-failure-report:\n${result.stdout}`);
  process.exit(1);
}

const report = String(parsed.report || "");
const required = [
  "Failure type:",
  "Root cause:",
  "Recommended action:",
  "/diagnose",
];
const missing = required.filter((item) => !report.includes(item));
if (missing.length || !report.includes("new project button not found")) {
  console.error(JSON.stringify({ missing, report }, null, 2));
  process.exit(1);
}

console.log("[diagnose] auto failure report smoke passed");
