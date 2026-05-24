#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const helper = path.join(root, "bot_db_helper.py");
const chatId = "__embedding_check__";
const marker = `embedding-check-${Date.now()}`;
const memoryText = `${marker} 텔레그램 차트 이미지는 stale artifact를 재전송하지 말고 최신 요청의 종목 기준으로 다시 생성한다`;
const queryText = `${marker} 예전 이미지 말고 최신 종목 차트를 다시 만들어 보내`;

function run(args) {
  const result = spawnSync("python", [helper, ...args], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`bot_db_helper.py ${args[0]} failed\n${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout || "null");
}

run(["init"]);
const saved = run([
  "add-memory",
  JSON.stringify({
    chat_id: chatId,
    scope: "chat",
    kind: "rule",
    text: memoryText,
    tags: "embedding-check chart artifact telegram",
    importance: 5,
    source_message_id: marker,
  }),
]);

const results = run(["search-memories", chatId, queryText, "5"]);
const found = Array.isArray(results) && results.some((item) => String(item.text || "").includes(marker));
if (!saved.ok || !found) {
  console.error(JSON.stringify({ saved, results }, null, 2));
  process.exit(1);
}

const hit = results.find((item) => String(item.text || "").includes(marker));
console.log(`[embedding] semantic memory smoke passed score=${hit.score} semantic=${hit.semantic_score}`);
