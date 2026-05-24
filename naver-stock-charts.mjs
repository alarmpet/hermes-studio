import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";

const outDir = "C:/Users/amd/hermes/outputs";
const count = Math.max(1, Math.min(10, Number(process.argv[2] || 3)));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const upperUrl = "https://finance.naver.com/sise/sise_upper.naver";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 1500 }, locale: "ko-KR" });

await page.goto(upperUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);

const stocks = await page.evaluate((limit) => {
  const clean = (value) => (value || "").replace(/\s+/g, " ").trim();
  const results = [];
  for (const link of document.querySelectorAll('a[href*="/item/main.naver?code="]')) {
    const href = link.href;
    const name = clean(link.innerText);
    const code = new URL(href).searchParams.get("code");
    if (!name || !code || results.some((item) => item.code === code)) continue;
    results.push({ name, code, url: href });
    if (results.length >= limit) break;
  }
  return results;
}, count);

const captures = [];
for (const [index, stock] of stocks.entries()) {
  const chartUrl = `https://ssl.pstatic.net/imgfinance/chart/item/area/year3/${stock.code}.png?sidcode=${Date.now()}`;
  const response = await fetch(chartUrl);
  if (!response.ok) throw new Error(`Chart download failed for ${stock.name}: ${response.status}`);
  const path = `${outDir}/naver-chart-year3-daily-${index + 1}-${stock.code}-${stamp}.png`;
  await writeFile(path, Buffer.from(await response.arrayBuffer()));
  captures.push({ ...stock, path, chartUrl, chartType: "3year_daily" });
}

await browser.close();
console.log(JSON.stringify({ ok: true, source: upperUrl, captures }, null, 2));
