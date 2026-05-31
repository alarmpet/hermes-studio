import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { changeAuthAccount, clearAuthSession, getAuthStatus, startAuth } from "./services/auth-service.mjs";
import { loadConfig, saveConfig } from "./services/config-store.mjs";
import { listJobs, readJob, upsertJob } from "./services/job-store.mjs";
import { getRuntimePaths } from "./services/path-resolver.mjs";
import { findChromeExecutable } from "./services/browser-profile-service.mjs";
import { listStylePresets } from "./services/style-presets.mjs";
import { listVisibleVoicePresets } from "./services/voice-presets.mjs";
import { getRecentWorkflowEvents } from "./services/workflow-history-service.mjs";
import { buildDesktopJobRequest, createYouTubeJob, retryThumbnailForJob, writeDesktopResult } from "./services/youtube-job-service.mjs";
import { uploadVideoToYouTube } from "../pipeline/youtube-upload.mjs";
import { mirrorWorkflowEventToDb } from "../workflow-db-events.mjs";
import { createFailureProgressEvent } from "./services/job-progress-events.mjs";
import { stopAllProviders } from "./services/external-provider-registry.mjs";
import { generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "../youtube-workflow.mjs";
import { createDefaultYouTubeStages } from "../youtube-workflow-stages.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const paths = getRuntimePaths();
const OUTPUT_DIR = process.env.HERMES_OUTPUT_DIR || paths.outputDir;
const FFMPEG_BIN = app.isPackaged ? ffmpegPath.replace("app.asar", "app.asar.unpacked") : ffmpegPath;
const jobEvents = new EventEmitter();

let mainWindow = null;
let latestCompletedJob = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1600,
    height: 1000,
    minWidth: 1080,
    minHeight: 720,
    title: "Hermes YouTube Studio",
    backgroundColor: "#f7f3eb",
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.maximize();
  mainWindow.loadFile(join(__dirname, "renderer", "index.html"));
}

function sendJobEvent(event) {
  mirrorWorkflowEventToDb(event, {
    dbHelper: join(paths.appRoot, "bot_db_helper.py"),
    chatId: "desktop",
    messageId: "0",
    taskName: "youtube-workflow",
  });
  jobEvents.emit("event", event);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("youtube:event", event);
}

function redactSensitive(key = "", value) {
  if (/api[_-]?key|token|cookie|password|secret|credential|authorization/i.test(String(key))) {
    return value ? "[REDACTED]" : value;
  }
  if (typeof value === "string" && /sk-[a-zA-Z0-9]|Bearer\s+[a-zA-Z0-9._-]+/i.test(value)) {
    return "[REDACTED]";
  }
  return value;
}

function sanitizeFailurePayload(value) {
  if (Array.isArray(value)) return value.map(sanitizeFailurePayload);
  if (!value || typeof value !== "object") return redactSensitive("", value);
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    redactSensitive(key, sanitizeFailurePayload(item)),
  ]));
}

async function readJsonFile(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJobRequestFromJobDir(jobId) {
  const summary = await readJob(paths.jobsDir, jobId);
  const jobDir = summary.jobDir;
  if (!jobDir) throw new Error(`Job has no output directory: ${jobId}`);
  const requestPath = join(jobDir, "job-request.json");
  if (!existsSync(requestPath)) throw new Error(`job-request.json was not found for ${jobId}: ${requestPath}`);
  return {
    summary,
    jobDir,
    job: await readJsonFile(requestPath),
  };
}

function createRecoveryWorkflowContext({ job, jobDir, config }) {
  const chromePath = config.chromePath;
  const emitWorkflow = (event = {}) => {
    if (event.type === "workflow-progress" || event.type === "workflow-warning") {
      sendJobEvent({
        type: "job-progress",
        jobId: job.id,
        phase: event.phase || "submitted",
        status: event.type === "workflow-warning" ? "running" : event.status || "running",
        message: event.message,
        details: event.details || {},
      });
      return;
    }
    sendJobEvent(event);
  };
  const stages = createDefaultYouTubeStages({
    paths,
    job,
    jobDir,
    chromePath,
    ffmpegBin: FFMPEG_BIN,
    enableLiveMcp: Boolean(job.options?.enableLiveMcp),
    emit: emitWorkflow,
    onFlowProgress: ({ message, details }) => sendJobEvent({
      type: "job-progress",
      jobId: job.id,
      phase: "flow-media",
      status: "running",
      message,
      details: { ...(details || {}) },
    }),
  });
  return { stages, emitWorkflow, chromePath };
}

async function loadExistingAssets(jobDir) {
  const metadataPath = join(jobDir, "metadata.json");
  if (existsSync(metadataPath)) {
    const metadata = await readJsonFile(metadataPath);
    return { ...metadata, jobDir };
  }
  const manifestPath = join(jobDir, "scene-media-manifest.json");
  const manifest = existsSync(manifestPath) ? await readJsonFile(manifestPath) : { scenes: [] };
  return {
    jobDir,
    draft: await readJsonFile(join(jobDir, "draft.json")),
    renderOptions: await readJsonFile(join(jobDir, "render-options.json")),
    sceneMedia: (manifest.scenes || []).filter((scene) => scene.status === "completed"),
    sceneMediaManifestPath: manifestPath,
  };
}

async function persistRecoveredJob({ job, jobDir, finalVideo, status = "completed" }) {
  if (finalVideo?.jobDir) await writeDesktopResult(finalVideo.jobDir, finalVideo);
  await upsertJob(paths.jobsDir, {
    id: job.id,
    title: job.sourceValue,
    sourceValue: job.sourceValue,
    status,
    jobDir,
    finalPath: finalVideo?.finalPath,
    createdAt: job.createdAt,
  });
}

ipcMain.handle("app:getConfig", async () => ({
  root: paths.appRoot,
  runtimeRoot: paths.runtimeRoot,
  outputDir: OUTPUT_DIR,
  isPackaged: app.isPackaged,
  ttsRoot: process.env.HERMES_TTS_ROOT || (await loadConfig(paths.configPath)).ttsRoot || paths.defaultTtsRoot,
}));

ipcMain.handle("config:get", async () => loadConfig(paths.configPath));

ipcMain.handle("config:save", async (_event, config) => saveConfig(paths.configPath, config));

ipcMain.handle("presets:voices", async () => listVisibleVoicePresets());

ipcMain.handle("presets:styles", async () => listStylePresets({
  dbHelperPath: join(paths.appRoot, "bot_db_helper.py"),
}));

ipcMain.handle("jobs:list", async () => listJobs(paths.jobsDir));

ipcMain.handle("jobs:read", async (_event, jobId) => readJob(paths.jobsDir, jobId));

ipcMain.handle("workflow:recentEvents", async (_event, jobId) => getRecentWorkflowEvents({
  dbHelperPath: join(paths.appRoot, "bot_db_helper.py"),
  jobId,
}));

ipcMain.handle("auth:status", async () => {
  const config = await loadConfig(paths.configPath);
  return getAuthStatus(config);
});

ipcMain.handle("auth:start", async (_event, target) => {
  const config = await loadConfig(paths.configPath);
  const result = await startAuth(target, { config, paths, openExternal: (url) => shell.openExternal(url) });
  const nextConfig = {
    ...config,
    auth: {
      ...(config.auth || {}),
      [target]: {
        ...result,
        updatedAt: new Date().toISOString(),
      },
    },
  };
  await saveConfig(paths.configPath, nextConfig);
  return result;
});

ipcMain.handle("auth:changeAccount", async (_event, target) => {
  const config = await loadConfig(paths.configPath);
  const result = await changeAuthAccount(target, { config, paths, openExternal: (url) => shell.openExternal(url) });
  const nextConfig = {
    ...config,
    auth: {
      ...(config.auth || {}),
      [target]: {
        ...result,
        updatedAt: new Date().toISOString(),
      },
    },
  };
  await saveConfig(paths.configPath, nextConfig);
  return result;
});

ipcMain.handle("auth:clearSession", async (_event, target) => {
  const config = await loadConfig(paths.configPath);
  const result = await clearAuthSession(target, { paths });
  const nextConfig = {
    ...config,
    auth: {
      ...(config.auth || {}),
      [target]: {
        ...result,
        updatedAt: new Date().toISOString(),
      },
    },
  };
  await saveConfig(paths.configPath, nextConfig);
  return result;
});

ipcMain.handle("app:selectDirectory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  return result.canceled ? "" : result.filePaths[0];
});

ipcMain.handle("app:openPath", async (_event, targetPath) => {
  if (!targetPath) return { ok: false, error: "targetPath is required" };
  const error = await shell.openPath(targetPath);
  return { ok: !error, error };
});

ipcMain.handle("youtube:createJob", async (_event, input) => {
  sendJobEvent({ type: "desktop-job-submitted", input });
  const jobIdFromInput = buildDesktopJobRequest(input).id;
  const inputWithId = { ...input, id: jobIdFromInput };
  const activeJobDir = join(OUTPUT_DIR, "desktop", jobIdFromInput);
  try {
    const config = await loadConfig(paths.configPath);
    const result = await createYouTubeJob(inputWithId, {
      paths,
      emit: sendJobEvent,
      outputDir: OUTPUT_DIR,
      jobDir: activeJobDir,
      ffmpegBin: FFMPEG_BIN,
      chromePath: config.chromePath,
      config,
    });
    if (result.finalVideo?.jobDir) await writeDesktopResult(result.finalVideo.jobDir, result.finalVideo);
    latestCompletedJob = result;
    await upsertJob(paths.jobsDir, {
      id: result.job.id,
      title: result.assets?.draft?.title || result.job.sourceValue,
      sourceValue: result.job.sourceValue,
      status: "completed",
      jobDir: result.assets.jobDir,
      finalPath: result.finalVideo?.finalPath,
      thumbnailPath: result.thumbnail?.path,
      renderEffectPreset: result.job.options?.renderEffectPreset || "cinematic",
      motionIntensity: result.job.options?.motionIntensity || "light",
      transitionPreset: result.job.options?.transitionPreset || "scene-fade",
      transitionSeconds: Number(result.job.options?.transitionSeconds || 0.3),
      researchProvider: result.job.options?.researchProvider || "gemini-gems-browser",
      archiveProvider: result.job.options?.archiveProvider || "local-files",
      createdAt: result.job.createdAt,
    });
    sendJobEvent({ type: "desktop-job-finished", jobId: result.job.id, jobDir: result.assets.jobDir });
    return result;
  } catch (error) {
    await writeFile(join(activeJobDir, "desktop-failure.json"), JSON.stringify({
      ok: false,
      message: error?.message || String(error),
      stack: error?.stack || "",
      input: sanitizeFailurePayload(inputWithId),
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8").catch(() => {});
    sendJobEvent(createFailureProgressEvent({
      message: error?.message || String(error),
      details: { input: sanitizeFailurePayload(inputWithId) },
    }));
    sendJobEvent({
      type: "desktop-job-failed",
      message: error?.message || String(error),
      input: sanitizeFailurePayload(inputWithId),
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
});

ipcMain.handle("youtube:retryFailedScenes", async (_event, jobId) => {
  const { job, jobDir } = await readJobRequestFromJobDir(jobId);
  sendJobEvent({
    type: "job-progress",
    jobId: job.id,
    phase: "flow-media",
    status: "running",
    message: "Retrying failed Flow scenes and reusing completed media.",
    details: { jobDir },
  });
  const config = await loadConfig(paths.configPath);
  const { stages, emitWorkflow, chromePath } = createRecoveryWorkflowContext({ job, jobDir, config });
  const draft = existsSync(join(jobDir, "draft.json")) ? await readJsonFile(join(jobDir, "draft.json")) : undefined;
  const assets = await generateYouTubeWorkflowAssets(job, {
    ...stages,
    paths,
    job,
    jobDir,
    outputDir: OUTPUT_DIR,
    chromePath,
    ffmpegBin: FFMPEG_BIN,
    draft,
    emit: emitWorkflow,
  });
  const finalVideo = await renderFinalYouTubeVideo(job, assets, {
    paths,
    job,
    jobDir,
    ffmpegBin: FFMPEG_BIN,
    renderScriptPath: paths.renderScriptPath,
    finalName: `desktop-recovered-${Date.now()}.mp4`,
    emit: emitWorkflow,
  });
  latestCompletedJob = { job, assets, finalVideo };
  await persistRecoveredJob({ job, jobDir, finalVideo });
  sendJobEvent({
    type: "job-progress",
    jobId: job.id,
    phase: "completed",
    status: "completed",
    message: "Failed scene retry and final render completed.",
    details: { finalPath: finalVideo.finalPath, jobDir },
  });
  return { job, assets, finalVideo };
});

ipcMain.handle("youtube:renderExistingAssets", async (_event, jobId) => {
  const { job, jobDir } = await readJobRequestFromJobDir(jobId);
  sendJobEvent({
    type: "job-progress",
    jobId: job.id,
    phase: "render",
    status: "running",
    message: "Rendering final video with existing scene assets.",
    details: { jobDir },
  });
  const assets = await loadExistingAssets(jobDir);
  const finalVideo = await renderFinalYouTubeVideo(job, assets, {
    paths,
    job,
    jobDir,
    ffmpegBin: FFMPEG_BIN,
    renderScriptPath: paths.renderScriptPath,
    finalName: `desktop-existing-assets-${Date.now()}.mp4`,
    emit: sendJobEvent,
  });
  latestCompletedJob = { job, assets, finalVideo };
  await persistRecoveredJob({ job, jobDir, finalVideo });
  sendJobEvent({
    type: "job-progress",
    jobId: job.id,
    phase: "completed",
    status: "completed",
    message: "Existing assets final render completed.",
    details: { finalPath: finalVideo.finalPath, jobDir },
  });
  return { job, assets, finalVideo };
});

ipcMain.handle("youtube:retryThumbnail", async (_event, jobId) => {
  const { summary, job, jobDir } = await readJobRequestFromJobDir(jobId);
  const config = await loadConfig(paths.configPath);
  const thumbnailResult = await retryThumbnailForJob({
    job,
    jobDir,
    paths,
    chromePath: config.chromePath || findChromeExecutable(),
    config,
    emit: sendJobEvent,
  });
  latestCompletedJob = {
    ...(latestCompletedJob || {}),
    job,
    assets: latestCompletedJob?.assets || { jobDir },
    finalVideo: latestCompletedJob?.finalVideo || { finalPath: summary.finalPath || summary.finalVideo || "", jobDir },
    thumbnail: thumbnailResult.thumbnail,
  };
  await upsertJob(paths.jobsDir, {
    ...summary,
    id: job.id,
    status: "completed",
    jobDir,
    finalPath: summary.finalPath || summary.finalVideo || "",
    thumbnailPath: thumbnailResult.thumbnail?.path || summary.thumbnailPath || "",
    createdAt: job.createdAt,
  });
  sendJobEvent({
    type: "job-progress",
    jobId: job.id,
    phase: "completed",
    status: thumbnailResult.thumbnail?.primaryProviderFailure?.actionRequired ? "action-required" : "completed",
    message: thumbnailResult.thumbnail?.primaryProviderFailure
      ? "Thumbnail retry finished with local fallback; ChatGPT still needs user verification."
      : "Thumbnail retry completed.",
    details: {
      jobDir,
      thumbnailPath: thumbnailResult.thumbnail?.path,
      primaryProviderFailure: thumbnailResult.thumbnail?.primaryProviderFailure,
    },
  });
  return thumbnailResult;
});

ipcMain.handle("youtube:approveUpload", async () => {
  if (!latestCompletedJob?.finalVideo?.finalPath) {
    return { ok: false, status: "no-completed-video", message: "No completed video is available for upload approval." };
  }
  return uploadVideoToYouTube({
    videoPath: latestCompletedJob.finalVideo.finalPath,
    thumbnailPath: latestCompletedJob.thumbnail?.path,
    tokenPath: paths.youtubeTokenPath,
    metadata: {
      title: latestCompletedJob.assets?.draft?.title || latestCompletedJob.job.sourceValue,
      description: latestCompletedJob.assets?.draft?.script || "",
      privacyStatus: latestCompletedJob.job.upload?.privacyStatus || "private",
      containsSyntheticMedia: true,
    },
  });
});

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  stopAllProviders().catch((error) => {
    console.error("Failed to stop MCP providers before quit:", error);
  });
});

app.on("window-all-closed", () => {
  stopAllProviders().catch((error) => {
    console.error("Failed to stop MCP providers after all windows closed:", error);
  });
  if (process.platform !== "darwin") app.quit();
});
