import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { EventEmitter } from "node:events";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { getAuthStatus, startAuth } from "./services/auth-service.mjs";
import { loadConfig, saveConfig } from "./services/config-store.mjs";
import { listJobs, readJob, upsertJob } from "./services/job-store.mjs";
import { getRuntimePaths } from "./services/path-resolver.mjs";
import { listVisibleVoicePresets } from "./services/voice-presets.mjs";
import { createYouTubeJob, writeDesktopResult } from "./services/youtube-job-service.mjs";
import { uploadVideoToYouTube } from "../pipeline/youtube-upload.mjs";
import { mirrorWorkflowEventToDb } from "../workflow-db-events.mjs";
import { createFailureProgressEvent } from "./services/job-progress-events.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const paths = getRuntimePaths();
const OUTPUT_DIR = process.env.HERMES_OUTPUT_DIR || paths.outputDir;
const FFMPEG_BIN = app.isPackaged ? ffmpegPath.replace("app.asar", "app.asar.unpacked") : ffmpegPath;
const jobEvents = new EventEmitter();

let mainWindow = null;
let latestCompletedJob = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 880,
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

ipcMain.handle("jobs:list", async () => listJobs(paths.jobsDir));

ipcMain.handle("jobs:read", async (_event, jobId) => readJob(paths.jobsDir, jobId));

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
  try {
    const config = await loadConfig(paths.configPath);
    const result = await createYouTubeJob(input, {
      paths,
      emit: sendJobEvent,
      outputDir: OUTPUT_DIR,
      ffmpegBin: FFMPEG_BIN,
      chromePath: config.chromePath,
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
      createdAt: result.job.createdAt,
    });
    sendJobEvent({ type: "desktop-job-finished", jobId: result.job.id, jobDir: result.assets.jobDir });
    return result;
  } catch (error) {
    sendJobEvent(createFailureProgressEvent({
      message: error?.message || String(error),
      details: { input },
    }));
    sendJobEvent({
      type: "desktop-job-failed",
      message: error?.message || String(error),
      input,
      updatedAt: new Date().toISOString(),
    });
    throw error;
  }
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
