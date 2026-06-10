#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  "telegram-flow-news-bot.mjs",
  "bot_db_helper.py",
  "electron/renderer/index.html",
  "electron/renderer/app.js",
  "electron/renderer/styles.css",
  "pipeline/youtube-thumbnail-prompt.mjs",
  "pipeline/youtube-thumbnail.mjs",
  "electron/services/youtube-upload-metadata.mjs",
];

const allowed = [
  "Possible mojibake outgoing message",
  "mojibake",
  "Mojibake check",
];

const suspiciousPatterns = [
  /\?{4,}/,
  /\uFFFD/,
  /�/,
  /[媛榕諛鍮二蹂異竊][^\n]{0,24}[?]/,
  /[?][^\n]{0,24}[媛榕諛鍮二蹂異竊]/,
];

let failed = false;

for (const file of files) {
  const path = resolve(root, file);
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
