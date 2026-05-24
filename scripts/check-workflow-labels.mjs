#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const result = spawnSync(process.execPath, [
  path.join(root, "telegram-flow-news-bot.mjs"),
  "--test-workflow-labels",
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
  console.error(`Invalid JSON from --test-workflow-labels:\n${result.stdout}`);
  process.exit(1);
}

const labels = parsed.labels || [];
const required = [
  "Codex command [",
  "MCP tool [",
  "Strategy gate constrained",
];
const joined = labels.join("\n");
const missing = required.filter((item) => !joined.includes(item));
if (!Array.isArray(parsed.labels) || missing.length) {
  console.error(JSON.stringify({ missing, parsed }, null, 2));
  process.exit(1);
}

console.log("[workflow] workflow label smoke passed");
