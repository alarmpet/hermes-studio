import { chromium } from 'playwright';

const outDir = 'C:/Users/amd/hermes/outputs';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const screenshotPath = `${outDir}/naver-upper-limit-${stamp}.png`;
const urls = [
  'https://finance.naver.com/sise/sise_upper.naver',
  'https://finance.naver.com/sise/sise_quant.naver',
  'https://m.stock.naver.com/domestic/market/KOSPI/rising'
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1365, height: 1800 }, locale: 'ko-KR' });
let finalUrl = urls[0];
let text = '';
for (const url of urls) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    text = await page.locator('body').innerText({ timeout: 10000 });
    finalUrl = url;
    if (/상한가|상승|종목|거래량|등락률/.test(text)) break;
  } catch {}
}
await page.screenshot({ path: screenshotPath, fullPage: true });

const rows = await page.evaluate(() => {
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const tableRows = Array.from(document.querySelectorAll('tr'));
  const parsed = [];
  for (const tr of tableRows) {
    const cells = Array.from(tr.querySelectorAll('th,td')).map((td) => clean(td.innerText)).filter(Boolean);
    const joined = cells.join(' | ');
    if (cells.length >= 4 && /\d/.test(joined) && !/N/.test(cells[0])) parsed.push(cells.slice(0, 10));
  }
  return parsed.slice(0, 20);
});

await browser.close();
console.log(JSON.stringify({ ok: true, finalUrl, screenshotPath, rows, textPreview: text.slice(0, 1000) }, null, 2));
