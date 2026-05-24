import { readdir, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";

const root = "C:/Users/amd/hermes";
const cfg = JSON.parse(await readFile(`${root}/telegram-flow-news-config.json`, "utf8"));
const token = cfg.botToken;
const chatId = String((cfg.allowFrom || [])[0]);
const dirs = [`${root}/charts`, `${root}/outputs`];
const exts = new Set([".png", ".jpg", ".jpeg", ".webp"]);

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

const files = [];
for (const dir of dirs) {
  try {
    for (const name of await readdir(dir)) {
      if (!exts.has(extname(name).toLowerCase())) continue;
      const path = join(dir, name);
      const info = await stat(path);
      files.push({ path, name, mtimeMs: info.mtimeMs });
    }
  } catch {
    // Directory may not exist yet.
  }
}

files.sort((a, b) => b.mtimeMs - a.mtimeMs);
const picked = files.filter((file) => /chart|차트|KEC|KOREA|BOHAE/i.test(file.name)).slice(0, 3);
const targets = picked.length ? picked : files.slice(0, 3);

if (!targets.length) {
  await telegram("sendMessage", { chat_id: chatId, text: "전송할 최근 이미지 파일을 찾지 못했습니다." });
  console.log(JSON.stringify({ ok: false, sent: 0 }));
  process.exit(0);
}

for (const file of targets) {
  await telegram("sendPhoto", {
    chat_id: chatId,
    caption: `차트 이미지: ${file.name}`,
  }, { field: "photo", path: file.path, mimeType: "image/png" });
}

console.log(JSON.stringify({ ok: true, sent: targets.length, files: targets.map((file) => file.path) }, null, 2));
