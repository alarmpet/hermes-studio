#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Simple smoke test: short continuation detection and resume prompt generation.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function runContinuation(args = []) {
  return spawnSync(
    process.execPath,
    [
      path.join(root, "telegram-flow-news-bot.mjs"),
      "--test-continuation",
      ...args,
    ],
    {
      cwd: root,
      encoding: "utf8",
      windowsHide: true,
    },
  );
}

const result = runContinuation([
  "--assistant-text",
  "Yes, continuing now. I will run the same action on next step.",
  "--user-text",
  "yes",
]);

const restartResult = runContinuation([
  "--assistant-text",
  "This action can continue with the same top10 re-run.",
  "--user-text",
  "start",
]);

for (const item of [result, restartResult]) {
  if (item.error) throw item.error;
  if (item.status !== 0) {
    console.error(item.stderr || item.stdout);
    process.exit(1);
  }
}

function parseResult(item) {
  try {
    return JSON.parse(item.stdout);
  } catch {
    console.error(`Invalid JSON from --test-continuation:\n${item.stdout}`);
    process.exit(1);
  }
}

const parsed = parseResult(result);
const restartParsed = parseResult(restartResult);

if (!parsed.ok || !restartParsed.ok) {
  console.error(JSON.stringify({ parsed, restartParsed }, null, 2));
  process.exit(1);
}

console.log("[context] short continuation requests resolve against previous Hermes action");
