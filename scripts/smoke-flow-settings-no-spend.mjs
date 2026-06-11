#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { findChromeExecutable } from "../electron/services/browser-profile-service.mjs";
import { ensureFlowProject, waitForFlowGeneratorReady } from "../automation/google-flow-media.mjs";
import { configureFlowOutputMode, verifyFlowOutputMode } from "../automation/google-flow-output-mode.mjs";
import { createWebUiProviderContext, writeWebUiEvidence } from "../automation/web-ui-provider-harness.mjs";

const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
const hermesRoot = join(appData, "hermes");
const jobDir = join(hermesRoot, "outputs", "desktop", `flow-settings-no-spend-${Date.now()}`);
const profileDir = process.env.HERMES_FLOW_PROFILE_DIR || join(hermesRoot, "browser-profiles", "flow-profile");
const chromePath = process.env.HERMES_CHROME_PATH || findChromeExecutable();

if (!chromePath) {
  throw new Error("Chrome executable was not found. Set HERMES_CHROME_PATH or install Chrome.");
}

await mkdir(jobDir, { recursive: true });

const contextState = await createWebUiProviderContext({
  provider: "flow",
  profileDir,
  chromePath,
  jobOptions: { enableWebUiTracing: false },
});

const { context, page } = contextState;
let report = null;

try {
  await ensureFlowProject(page);
  await waitForFlowGeneratorReady(page, jobDir, 1);
  const modeSwitchResult = await configureFlowOutputMode(page, "image", "16:9", {
    flowImageModel: "nano-banana-pro",
  });
  const modeVerification = await verifyFlowOutputMode(page, "image", "16:9");
  const evidence = await writeWebUiEvidence({
    page,
    jobDir,
    provider: "flow",
    sceneOrder: 1,
    label: "settings_no_spend",
    extra: { modeSwitchResult, modeVerification },
  });

  const selectedModel = modeSwitchResult.selectedImageModelLabel || modeVerification.selectedImageModel || "";
  const selectedAspect = modeSwitchResult.selectedAspectLabel || modeVerification.selectedAspectRatio || "";
  const selectedCount = modeSwitchResult.selectedCountLabel || modeVerification.selectedCountLabel || "";

  const checks = {
    imageMode: modeVerification.selectedOutputMode === "image" || modeSwitchResult.selectedOutputMode === "image",
    nanoBananaPro: /Nano Banana Pro/i.test(selectedModel),
    aspect16x9: /16:9|crop_16_9|crop_landscape/i.test(selectedAspect),
    oneImage: /\b1x\b|^1$/i.test(selectedCount),
  };

  report = {
    ok: Object.values(checks).every(Boolean),
    checks,
    profileDir,
    jobDir,
    modeSwitchResult,
    modeVerification,
    evidence,
    submitted: false,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(join(jobDir, "flow_settings_no_spend_report.json"), JSON.stringify(report, null, 2), "utf8");
  if (!report.ok) {
    throw new Error(`FLOW_SETTINGS_NO_SPEND_CHECK_FAILED: ${JSON.stringify(checks)}`);
  }
  console.log(JSON.stringify({ ok: true, jobDir, checks }, null, 2));
} catch (error) {
  const failure = {
    ok: false,
    error: error?.message || String(error),
    stack: error?.stack || "",
    profileDir,
    jobDir,
    report,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(join(jobDir, "flow_settings_no_spend_failure.json"), JSON.stringify(failure, null, 2), "utf8").catch(() => {});
  await page.screenshot({ path: join(jobDir, "flow_settings_no_spend_failure.png"), fullPage: true }).catch(() => {});
  throw error;
} finally {
  await context.close().catch(() => {});
}
