#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const source = await readFile(path.join(root, "telegram-flow-news-bot.mjs"), "utf8");

if (/process\.env\.OPENROUTER_ENABLED\b/.test(source)) {
  console.error("[openrouter-override] generic OPENROUTER_ENABLED must not control Hermes fallback");
  process.exit(1);
}

if (!/process\.env\.HERMES_ENABLE_OPENROUTER\b/.test(source)) {
  console.error("[openrouter-override] HERMES_ENABLE_OPENROUTER override is missing");
  process.exit(1);
}

console.log("[openrouter-override] Hermes-specific override only");
