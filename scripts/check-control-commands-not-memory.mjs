#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const helper = path.join(root, "bot_db_helper.py");
const marker = `control-memory-${Date.now()}`;
const commandText = `/memory ${marker} 최신 차트 다시 생성`;

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, HERMES_CONTROL_MEMORY_CHECK: "1" },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return result.stdout;
}

function runPython(args) {
  const result = spawnSync("python", [helper, ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout);
  }
  return JSON.parse(result.stdout || "null");
}

runNode([
  path.join(root, "telegram-flow-news-bot.mjs"),
  "--simulate-message",
  commandText,
  "--simulate-no-send",
  "--simulate-timeout-ms",
  "30000",
]);

const memories = runPython(["search-memories", "8151113796", marker, "5"]);
const polluted = Array.isArray(memories)
  && memories.some((item) => String(item.text || "").includes(marker) && String(item.text || "").startsWith("/"));

if (polluted) {
  console.error(JSON.stringify(memories, null, 2));
  process.exit(1);
}

console.log("[memory] control commands are not saved as long-term memory");
