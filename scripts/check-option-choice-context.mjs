#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const result = spawnSync(process.execPath, [
  path.join(root, "telegram-flow-news-bot.mjs"),
  "--test-option-choice",
  "--choice",
  "1",
  "--assistant-text",
  "1. 기본 옵션\n2. Hermes 전략\n3. 전체 플랜",
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
  console.error(`Invalid JSON from --test-option-choice:\n${result.stdout}`);
  process.exit(1);
}

const prompt = String(parsed.promptText || "");
const ok = parsed.ok
  && parsed.choice?.number === 1
  && prompt.includes("Selected option: 1")
  && prompt.includes("Do not ask the same option question again");

if (!ok) {
  console.error(JSON.stringify(parsed, null, 2));
  process.exit(1);
}

console.log("[context] numbered option choices resolve against previous assistant question");