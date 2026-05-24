#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const result = spawnSync(process.execPath, [
  path.join(root, "telegram-flow-news-bot.mjs"),
  "--simulate-no-send",
  "--test-send-long-message",
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

const simulatedSends = (result.stdout.match(/"simulateTelegram"\s*:\s*true/g) || []).length;
const tooLongPayload = result.stdout.split(/\r?\n/).some((line) => line.includes('"text"') && line.length > 4300);
if (simulatedSends < 3 || tooLongPayload) {
  console.error(result.stdout);
  process.exit(1);
}

console.log(`[telegram] long messages are split (${simulatedSends} chunks)`);
