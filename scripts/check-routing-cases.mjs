#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const ROOT = "C:/Users/amd/hermes";
const cases = JSON.parse(await readFile(`${ROOT}/tests/routing_cases.json`, "utf8"));
let failures = 0;

for (const item of cases) {
  const result = spawnSync(process.execPath, [
    `${ROOT}/telegram-flow-news-bot.mjs`,
    "--test-classify",
    item.text,
  ], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, HERMES_CHECK_ROUTING_CASES: "1" },
  });
  if (result.status !== 0) {
    failures += 1;
    console.error(`[routing] ${item.name}: command failed\n${result.stderr || result.stdout}`);
    continue;
  }
  let actual = "";
  try {
    actual = JSON.parse(result.stdout).task;
  } catch (error) {
    failures += 1;
    console.error(`[routing] ${item.name}: invalid JSON output\n${result.stdout}`);
    continue;
  }
  if (actual !== item.expected) {
    failures += 1;
    console.error(`[routing] ${item.name}: expected=${item.expected} actual=${actual}`);
  } else {
    console.log(`[routing] ${item.name}: ok (${actual})`);
  }
}

if (failures) {
  console.error(`[routing] failed ${failures}/${cases.length}`);
  process.exit(1);
}

console.log(`[routing] all ${cases.length} cases passed`);
