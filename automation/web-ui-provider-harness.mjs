import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";
import { maximizeChromiumWindow } from "./chromium-window-bounds.mjs";
import { releaseAppManagedAuthWindow } from "./web-ui-auth-window.mjs";

function shouldEnableWebUiTracing(jobOptions = {}) {
  return Boolean(jobOptions.enableWebUiTracing || process.env.HERMES_ENABLE_WEB_UI_TRACE === "1");
}

export async function createWebUiProviderContext({
  provider,
  profileDir,
  chromePath,
  jobOptions = {},
  headless = false,
  viewport = { width: 1920, height: 1080 },
  windowSize = "1936,1100",
} = {}) {
  if (!provider) throw new Error("WEB_UI_PROVIDER_REQUIRED");
  if (!profileDir) throw new Error("WEB_UI_PROFILE_DIR_REQUIRED");
  await releaseAppManagedAuthWindow(profileDir);
  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    executablePath: chromePath || undefined,
    viewport,
    locale: "ko-KR",
    acceptDownloads: true,
    args: [
      `--window-size=${windowSize}`,
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  const page = context.pages()[0] || await context.newPage();
  await maximizeChromiumWindow(page, { label: `${provider} Chrome` }).catch(() => {});
  return { context, page, traceEnabled: shouldEnableWebUiTracing(jobOptions) };
}

export async function startWebUiTrace({ context, jobDir, sceneOrder, provider, enabled = false } = {}) {
  if (!enabled || !context || !jobDir || !sceneOrder || !provider) return "";
  await mkdir(jobDir, { recursive: true });
  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: false,
    title: `${provider}-scene-${sceneOrder}`,
  });
  return join(jobDir, `scene_${sceneOrder}_${provider}_trace.zip`);
}

export async function stopWebUiTrace({
  context,
  tracePath,
  saveTrace = false,
  saveSuccessfulWebUiTrace = false,
} = {}) {
  if (!context || !tracePath) return "";
  const shouldSave = Boolean(saveTrace || saveSuccessfulWebUiTrace);
  if (shouldSave) {
    await context.tracing.stop({ path: tracePath }).catch(async () => {
      await context.tracing.stop().catch(() => {});
    });
    return tracePath;
  }
  await context.tracing.stop().catch(() => {});
  return "";
}

export async function writeWebUiEvidence({
  page,
  jobDir,
  provider,
  sceneOrder,
  label = "screen",
  extra = {},
} = {}) {
  if (!page || !jobDir || !provider || !sceneOrder) {
    throw new Error("WEB_UI_EVIDENCE_INPUT_REQUIRED");
  }
  await mkdir(jobDir, { recursive: true });
  const screenshotPath = join(jobDir, `scene_${sceneOrder}_${provider}_${label}.png`);
  const snapshotPath = join(jobDir, `scene_${sceneOrder}_${provider}_${label}_snapshot.json`);
  const text = await page.locator("body").textContent({ timeout: 3000 }).catch(() => "");
  const url = page.url();
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
  await writeFile(snapshotPath, JSON.stringify({
    provider,
    sceneOrder,
    label,
    url,
    text,
    extra,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  return { screenshotPath, snapshotPath };
}
