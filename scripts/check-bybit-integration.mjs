#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const ROOT = "C:/Users/amd/hermes";

function run(args, options = {}) {
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, HERMES_CHECK_BYBIT_INTEGRATION: "1" },
    ...options,
  });
}

const skill = await readFile(`${ROOT}/integrations/bybit/SKILL.md`, "utf8");
if (!skill.includes("Bybit Trading Skill") || !skill.includes("version: 1.3.0")) {
  console.error("[bybit] local skill mirror is missing expected metadata");
  process.exit(1);
}

const mcpList = run([
  `${ROOT}/node_modules/@openai/codex/bin/codex.js`,
  "mcp",
  "list",
]);
if (mcpList.status !== 0 || !/bybit/.test(mcpList.stdout)) {
  console.error(`[bybit] Codex MCP server is not registered\n${mcpList.stderr || mcpList.stdout}`);
  process.exit(1);
}

const prompt = run([
  `${ROOT}/telegram-flow-news-bot.mjs`,
  "--test-prompt",
  "Bybit BTCUSDT 1h klines 조회하고 백테스트 입력으로 정리해",
]);
if (prompt.status !== 0) {
  console.error(`[bybit] prompt smoke failed\n${prompt.stderr || prompt.stdout}`);
  process.exit(1);
}

const expected = [
  "Bybit integration available",
  "MCP server: bybit",
  "bybit-official-trading-server@latest",
  "integrations/bybit/SKILL.md",
  "BYBIT_TESTNET=true",
];
const missing = expected.filter((item) => !prompt.stdout.includes(item));
if (missing.length) {
  console.error(`[bybit] prompt is missing integration context: ${missing.join(", ")}`);
  process.exit(1);
}

console.log("[bybit] skill + MCP integration smoke passed");
