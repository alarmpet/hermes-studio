#!/usr/bin/env node

import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = "C:/Users/amd/hermes";
const SKIP_DIRS = new Set(["node_modules", ".aistudio-browser-profile", "outputs", "charts", ".git", "__pycache__"]);
const SKIP_FILES = new Set([
  "telegram-flow-news-config.json",
  "openrouter.txt.txt",
  "telegram.txt",
  "brave.txt",
  "bot_data.db",
]);
const TEXT_EXTS = new Set([".mjs", ".js", ".json", ".md", ".py", ".txt", ".yml", ".yaml", ".ps1"]);
const PATTERNS = [
  { name: "telegram-bot-token", re: /\b\d{8,12}:[A-Za-z0-9_-]{30,}\b/g },
  { name: "openrouter-key", re: /\bsk-or-[A-Za-z0-9_-]{20,}\b/g },
];

async function walk(directory, files = []) {
  for (const name of await readdir(directory)) {
    if (SKIP_DIRS.has(name)) continue;
    const path = join(directory, name);
    const info = await stat(path);
    if (info.isDirectory()) {
      await walk(path, files);
    } else if (!SKIP_FILES.has(name) && TEXT_EXTS.has(extname(name).toLowerCase())) {
      files.push(path);
    }
  }
  return files;
}

let failures = 0;
for (const path of await walk(ROOT)) {
  const text = await readFile(path, "utf8").catch(() => "");
  for (const pattern of PATTERNS) {
    const matches = [...text.matchAll(pattern.re)];
    if (matches.length) {
      failures += matches.length;
      console.error(`[secret] ${pattern.name} in ${path}`);
    }
  }
}

if (failures) {
  console.error(`[secret] found ${failures} potential secret(s)`);
  process.exit(1);
}

console.log("[secret] no obvious secrets found in tracked text files");
