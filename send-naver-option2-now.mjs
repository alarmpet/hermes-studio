import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const root = "C:/Users/amd/hermes";
const cfg = JSON.parse(await readFile(`${root}/telegram-flow-news-config.json`, "utf8"));
const token = cfg.botToken;
const chatId = String((cfg.allowFrom || [])[0]);

async function run(script, ...args) {
  const { stdout } = await execFileAsync(process.execPath, [`${root}/${script}`, ...args], {
    cwd: root,
    timeout: 240000,
    encoding: "utf8",
  });
  return JSON.parse(stdout.slice(stdout.indexOf("{")));
}

async function telegram(method, payload, file) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  if (file) {
    const form = new FormData();
    for (const [key, value] of Object.entries(payload)) {
      if (value !== undefined && value !== null) form.append(key, String(value));
    }
    const bytes = await readFile(file.path);
    form.append(file.field, new Blob([bytes], { type: file.mimeType }), basename(file.path));
    const response = await fetch(url, { method: "POST", body: form });
    const json = await response.json();
    if (!json.ok) throw new Error(JSON.stringify(json));
    return json.result;
  }

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  });
  const json = await response.json();
  if (!json.ok) throw new Error(JSON.stringify(json));
  return json.result;
}

const upper = await run("naver-upper-limit.mjs");
const charts = await run("naver-stock-charts.mjs", "3");

const rows = (upper.rows || []).slice(0, 12).map((row, index) => {
  const name = row[3] || row[0];
  const price = row[4] || "";
  const change = row[6] || "";
  const volume = row[7] || "";
  return `${index + 1}. ${name} | 현재가 ${price} | 등락률 ${change} | 거래량 ${volume}`;
});

await telegram("sendMessage", {
  chat_id: chatId,
  text: [
    "네이버 상한가 종목 캡처/추출 완료",
    `출처: ${upper.finalUrl}`,
    "",
    rows.join("\n"),
  ].join("\n"),
  disable_web_page_preview: true,
});

await telegram("sendPhoto", {
  chat_id: chatId,
  caption: "네이버 상한가 페이지 캡처",
}, { field: "photo", path: upper.screenshotPath, mimeType: "image/png" });

for (const capture of charts.captures || []) {
  await telegram("sendPhoto", {
    chat_id: chatId,
    caption: `3년 일봉 기준 차트: ${capture.name} (${capture.code})`,
  }, { field: "photo", path: capture.path, mimeType: "image/png" });
}

console.log(JSON.stringify({ ok: true, sentCharts: charts.captures?.length || 0 }, null, 2));
