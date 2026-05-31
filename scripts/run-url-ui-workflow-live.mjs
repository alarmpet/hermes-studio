#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { _electron as electron } from "playwright";
import electronPath from "electron";

const root = resolve(import.meta.dirname, "..");
const sourceUrl = process.argv[2] || "";
if (!/^https?:\/\//i.test(sourceUrl)) {
  throw new Error("Usage: node scripts/run-url-ui-workflow-live.mjs <url>");
}

const outputRoot = resolve(process.env.HERMES_OUTPUT_DIR || "C:/Users/amd/AppData/Roaming/hermes/outputs");
const reportDir = join(outputRoot, "manual-runs");
const reportPath = join(reportDir, `url-live-ui-workflow-${Date.now()}.json`);
const flowMode = process.env.HERMES_FLOW_MODE || "image";
const targetPreset = process.env.HERMES_SCRIPT_PRESET || "standard";

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
  if (!appViewport || appViewport.width < 1600 || appViewport.height < 1000) {
    throw new Error(`Hermes Studio test viewport is too small: ${JSON.stringify(appViewport)}`);
  }
  await page.waitForSelector("#jobForm", { timeout: 60_000 });
  page.on("console", (message) => {
    events.push({
      type: "browser-console",
      level: message.type(),
      text: message.text(),
      at: new Date().toISOString(),
    });
  });

  await page.locator("input[name='sourceType'][value='url']").check();
  await page.locator("#sourceValue").fill(sourceUrl);
  await page.locator("#scriptLengthMode").selectOption("preset");
  await page.locator("#scriptLengthPreset").selectOption(targetPreset);
  await page.locator("#researchProvider").selectOption("gemini-gems-browser");
  await page.locator("#archiveProvider").selectOption("local-files");
  await page.locator("#subtitleStyleId").selectOption("clean-news");
  await page.locator("#subtitleFontSize").fill("10");
  await page.locator("#subtitleOutline").fill("2");
  await page.locator("#subtitleShadow").fill("1");
  await page.locator("#renderEffectPreset").selectOption("cinematic");
  await page.locator("#motionIntensity").selectOption("light");
  await page.locator("#transitionPreset").selectOption("scene-fade");
  await page.locator(`input[name='flowOutputMode'][value='${flowMode}']`).check();
  await page.locator("#chatgptThumbnail").evaluate((input) => {
    input.checked = false;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#mockMediaMode").evaluate((input) => {
    input.checked = false;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });

  events.push({
    type: "ui-submit",
    sourceUrl,
    targetPreset,
    flowMode,
    mockMediaMode: false,
    at: new Date().toISOString(),
    appWindowBounds,
    appViewport,
  });

  await page.locator("#generateBtn").click();
  await page.waitForFunction(() => {
    const state = document.querySelector("#jobState")?.textContent || "";
    return /Preview Complete|Failed|Config Error/i.test(state);
  }, null, { timeout: 45 * 60 * 1000 });

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
const metadata = readJsonIfExists(join(jobDir, "metadata.json"));
const desktopResult = readJsonIfExists(join(jobDir, "desktop-result.json"));
const renderReport = readJsonIfExists(join(jobDir, "render-report-v2.json"));
const draft = readJsonIfExists(join(jobDir, "draft.json"));
const sceneManifest = readJsonIfExists(join(jobDir, "scene-media-manifest.json"));
const finalPath = renderReport?.finalPath || desktopResult?.finalPath || desktopResult?.finalVideo?.finalPath || "";

const report = {
  ok: /Preview Complete/i.test(finalState) && Boolean(finalPath) && existsSync(finalPath),
  sourceUrl,
  finalState,
  latestOutput,
  jobDir,
  finalPath,
  finalDuration: renderReport?.finalDuration || desktopResult?.durationSeconds || desktopResult?.finalVideo?.durationSeconds || null,
  title: draft?.title || metadata?.draft?.title || "",
  sceneCount: draft?.scenes?.length || metadata?.draft?.scenes?.length || 0,
  sceneMediaCount: metadata?.sceneMedia?.length || sceneManifest?.scenes?.filter((scene) => scene.status === "completed").length || 0,
  requested: {
    sourceType: "url",
    flowMode,
    targetPreset,
    mockMediaMode: false,
    thumbnailMode: "auto",
  },
  appWindowBounds,
  appViewport,
  events,
  reportPath,
  updatedAt: new Date().toISOString(),
};

writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify(report, null, 2));
