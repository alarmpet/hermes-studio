#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const marker = `memory-context-${Date.now()}`;
const text = `${marker} 앞으로 차트 이미지는 예전 파일을 재전송하지 말고 최신 요청 종목 기준으로 다시 생성해서 보내`;

const result = spawnSync(process.execPath, [
  path.join(root, "telegram-flow-news-bot.mjs"),
  "--test-memory",
  text,
], {
  cwd: root,
  encoding: "utf8",
  windowsHide: true,
  env: { ...process.env, HERMES_CHECK_MEMORY_CONTEXT: "1" },
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
  console.error(`Invalid JSON from --test-memory:\n${result.stdout}`);
  process.exit(1);
}

const saved = parsed.saved?.ok === true;
const found = Array.isArray(parsed.found) && parsed.found.some((item) => String(item.text || "").includes(marker));
const injected = String(parsed.context || "").includes(marker)
  && String(parsed.context || "").includes("Relevant long-term Hermes memories");

if (!saved || !found || !injected) {
  console.error(JSON.stringify({ saved, found, injected, parsed }, null, 2));
  process.exit(1);
}

console.log("[memory] context injection smoke passed");
