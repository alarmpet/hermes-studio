#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";
import electronPath from "electron";

const root = resolve(import.meta.dirname, "..");
const outputRoot = resolve(process.env.HERMES_OUTPUT_DIR || "C:/Users/amd/AppData/Roaming/hermes/outputs");
const reportDir = join(outputRoot, "manual-runs");
const reportPath = join(reportDir, `title-overlay-ui-workflow-${Date.now()}.json`);
const expectedAutoTitle = "구글 글래스의 숨은 반전";
const script = [
  `${expectedAutoTitle}.`,
  "실패한 제품처럼 보였던 기술이 AI 시대에 다시 주목받고 있습니다.",
  "작은 안경형 기기가 일상 속 정보를 어떻게 보여줄 수 있는지 확인합니다.",
  "하지만 우리 삶에서는 사생활과 집중력이라는 질문도 함께 따라옵니다.",
  "결국 중요한 것은 기술 자체보다 사람이 안전하게 쓰는 맥락입니다.",
].join(" ");

function latestJobDirFromButtonText(text = "") {
  const match = String(text).match(/[A-Z]:\\[^\n\r]+youtube-\d+/i);
  return match?.[0] || "";
}

function readJsonIfExists(path) {
  if (!path || !existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

await mkdir(reportDir, { recursive: true });

const app = await electron.launch({
  executablePath: electronPath,
  args: [root],
  cwd: root,
  env: {
    ...process.env,
    HERMES_OUTPUT_DIR: outputRoot,
  },
  timeout: 120_000,
});

const events = [];
let finalState = "unknown";
let latestOutput = "";
let appWindowBounds = null;
let appViewport = null;

try {
  const page = await app.firstWindow({ timeout: 60_000 });
  appWindowBounds = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    window?.maximize();
    return window?.getBounds();
  });
  await page.setViewportSize({ width: 1600, height: 1000 });
  appViewport = page.viewportSize();
  assert.ok(appViewport?.width >= 1600 && appViewport?.height >= 1000, "Hermes Studio UI viewport should be maximized for workflow testing");

  await page.waitForSelector("#jobForm", { timeout: 60_000 });
  page.on("console", (message) => {
    events.push({ type: "browser-console", level: message.type(), text: message.text(), at: new Date().toISOString() });
  });

  await page.locator("input[name='sourceType'][value='script']").check();
  await page.locator("#sourceValue").fill(script);
  await page.locator("#scriptLengthMode").selectOption("custom");
  await page.locator("#customDurationSeconds").fill("20");
  await page.locator("#subtitleStyleId").selectOption("bold-shorts");
  await page.locator("#titleOverlayEnabled").check();
  await page.locator("#titleOverlayText").fill("");
  await page.locator("#titleOverlayStyleId").selectOption("bold-black-accent");
  await page.locator("input[name='flowOutputMode'][value='hybrid']").check();
  await page.locator("#hybridIntroVideoSceneCount").fill("1");
  await page.locator("#mockMediaMode").evaluate((input) => {
    input.checked = true;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#chatgptThumbnail").evaluate((input) => {
    input.checked = false;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  const previewText = await page.locator("#titleOverlayPreviewText").innerText();
  assert.match(previewText.trim(), /Auto|구글 글래스/, "top title preview should show automatic title hint before submit");

  events.push({ type: "ui-submit", sourceType: "script", expectedAutoTitle, mockMediaMode: true, at: new Date().toISOString(), appWindowBounds, appViewport });
  await page.locator("#generateBtn").click();
  await page.waitForFunction(() => {
    const state = document.querySelector("#jobState")?.textContent || "";
    return /Preview Complete|Failed|Config Error/i.test(state);
  }, null, { timeout: 8 * 60 * 1000 });

  finalState = (await page.locator("#jobState").innerText()).trim();
  latestOutput = (await page.locator("#latestOutput").innerText()).trim();
  events.push({
    type: "ui-finished",
    finalState,
    latestOutput,
    currentMessage: (await page.locator("#currentProgressMessage").innerText()).trim(),
    progress: (await page.locator("#jobProgressPercent").innerText()).trim(),
    at: new Date().toISOString(),
  });
} finally {
  await app.close().catch(() => {});
}

const jobDir = latestJobDirFromButtonText(latestOutput) || latestOutput;
const renderReport = readJsonIfExists(join(jobDir, "render-report-v2.json"));
const titleOverlay = readJsonIfExists(join(jobDir, "title-overlay.json"));
const finalPath = renderReport?.finalPath || "";

const report = {
  ok: /Preview Complete/i.test(finalState)
    && Boolean(finalPath)
    && existsSync(finalPath)
    && titleOverlay?.enabled === true
    && titleOverlay?.title === expectedAutoTitle
    && ["draft-title", "script-first-sentence"].includes(titleOverlay?.source),
  finalState,
  latestOutput,
  jobDir,
  finalPath,
  finalDuration: renderReport?.finalDuration || null,
  titleOverlay,
  appWindowBounds,
  appViewport,
  events,
  reportPath,
  updatedAt: new Date().toISOString(),
};

writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
assert.equal(report.ok, true, "title overlay UI workflow should complete and render the generated title overlay");
