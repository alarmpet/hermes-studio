#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const request = "한국 코스피,코스닥 종목중에 2026년 올해 가장 많이 상승한 10개 종목 찾아보고 차트까지 만들어줘";

const result = spawnSync(process.execPath, [
  path.join(root, "telegram-flow-news-bot.mjs"),
  "--test-strategy",
  request,
], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
  env: { ...process.env, HERMES_STRATEGY_GATE_OFFLINE: "1" },
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
  console.error(`Invalid JSON from --test-strategy:\n${result.stdout}`);
  process.exit(1);
}

const evaluation = parsed.evaluation || {};
const prompt = String(parsed.constrainedPrompt || "");
const ok = parsed.plan?.task_type === "market_data_scan"
  && evaluation.allowed === false
  && Number(evaluation.maxToolCalls) <= 3
  && prompt.includes("HERMES STRATEGY GATE")
  && prompt.includes("probe-first");

if (!ok) {
  console.error(JSON.stringify(parsed, null, 2));
  process.exit(1);
}

console.log("[strategy] broad scan is constrained by strategy gate");
