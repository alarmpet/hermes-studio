#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { relative } from "node:path";

const root = "C:/Users/amd/hermes";
const files = [
  "telegram-flow-news-bot.mjs",
  "bot_db_helper.py",
];

const allowed = [
  "Possible mojibake outgoing message",
  "mojibake",
];

const suspiciousPatterns = [
  /\?{4,}/,
  /[闌-龥][?]{2,}/,
  /[?]{2,}[闌-龥]/,
  /\uFFFD/,
  /占./,
];

let failed = false;

for (const file of files) {
  const path = `${root}/${file}`;
  const text = await readFile(path, "utf8");
  const lines = text.split(/\r?\n/);
  for (const [index, line] of lines.entries()) {
    if (allowed.some((item) => line.includes(item))) continue;
    if (!suspiciousPatterns.some((pattern) => pattern.test(line))) continue;
    failed = true;
    console.error(`${relative(root, path)}:${index + 1}: likely mojibake: ${line.slice(0, 220)}`);
  }
}

if (failed) {
  console.error("Mojibake check failed.");
  process.exit(1);
}

console.log("Mojibake check passed.");
