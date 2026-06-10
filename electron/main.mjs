import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { changeAuthAccount, clearAuthSession, getAuthStatus, openPersistentChrome, startAuth } from "./services/auth-service.mjs";
import { loadConfig, saveConfig } from "./services/config-store.mjs";
import { checkOllamaHealth, normalizeOllamaConfig } from "./services/ollama-provider.mjs";
import { listJobs, readJob, upsertJob } from "./services/job-store.mjs";
import { getRuntimePaths } from "./services/path-resolver.mjs";
import { claimBrowserProfile, findChromeExecutable, writeBrowserProfileLock } from "./services/browser-profile-service.mjs";
import { listStylePresets } from "./services/style-presets.mjs";
import { listVisibleVoicePresets } from "./services/voice-presets.mjs";
import { getRecentWorkflowEvents } from "./services/workflow-history-service.mjs";
import {
  buildDefaultUploadMetadata,
  computeFileHash,
  readUploadMetadata,
  readUploadState,
  validateThumbnailForYouTube,
  validateUploadMetadata,
  writeUploadMetadata,
  writeUploadState,
} from "./services/youtube-upload-metadata.mjs";
import { buildDesktopJobRequest, createYouTubeJob, retryThumbnailForJob, writeDesktopResult } from "./services/youtube-job-service.mjs";
import { uploadVideoToYouTube } from "../pipeline/youtube-upload.mjs";
import { mirrorWorkflowEventToDb } from "../workflow-db-events.mjs";
import { createFailureProgressEvent } from "./services/job-progress-events.mjs";
import { stopAllProviders } from "./services/external-provider-registry.mjs";
import { createFlowRequestPacer } from "./services/flow-request-pacer.mjs";
import { buildFlowAccountRouter } from "./services/flow-account-router.mjs";
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

function normalizeFlowAccountSlotId(slotId = "default") {
  return String(slotId || "default")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "default";
}

function resolveFlowAccountSlotProfile(slotId = "default") {
  const cleanSlotId = normalizeFlowAccountSlotId(slotId);
  const target = cleanSlotId === "default" ? "flow-profile" : `flow-profile-${cleanSlotId}`;
  return {
    cleanSlotId,
    target,
    profileDir: cleanSlotId === "default"
      ? paths.flowProfileDir
      : join(paths.userData, "browser-profiles", target),
  };
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
  const flowPacer = createFlowRequestPacer({ userData: paths.userData });
  const flowAccountRouter = buildFlowAccountRouter({
    userData: paths.userData,
    flowProfileRoot: join(paths.userData, "browser-profiles"),
    options: job.options,
  });
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
    flowPacer,
    flowAccountRouter,
    enableLiveMcp: Boolean(job.options?.enableLiveMcp),
    emit: emitWorkflow,
    onFlowProgress: ({ message, details }) => sendJobEvent({
      type: "job-progress",
      jobId: job.id,
      phase: "flow-media",
      status: "running",
      message,
      details: {
        ...(details || {}),
        flowAccountSlotId: details?.flowAccountSlotId || "",
        flowAccountSlotLabel: details?.flowAccountSlotLabel || "",
      },
    }),
  });
  return { stages, emitWorkflow, chromePath, flowPacer, flowAccountRouter };
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

async function loadUploadDraftAssets(jobDir) {
  const draftPath = join(jobDir, "draft.json");
  const metadataPath = join(jobDir, "metadata.json");
  const draft = existsSync(draftPath) ? await readJsonFile(draftPath) : {};
  const metadata = existsSync(metadataPath) ? await readJsonFile(metadataPath) : {};
  return { ...metadata, draft, jobDir };
}

async function getUploadDraftForJob(jobId) {
  if (!jobId) return { ok: false, status: "job-id-required", message: "Select a completed job before uploading." };
  const jobRecord = await readJob(paths.jobsDir, jobId);
  if (!jobRecord?.jobDir) return { ok: false, status: "job-dir-missing", message: `Job directory is missing for ${jobId}.` };
  const existing = await readUploadMetadata(jobRecord.jobDir);
  const uploadState = await readUploadState(jobRecord.jobDir);
  if (existing) return { ok: true, metadata: existing, uploadState };
  const assets = await loadUploadDraftAssets(jobRecord.jobDir).catch(() => ({ jobDir: jobRecord.jobDir }));
  const metadata = await writeUploadMetadata(jobRecord.jobDir, buildDefaultUploadMetadata(jobRecord, assets));
  return { ok: true, metadata, uploadState };
}

async function saveUploadDraftForJob(jobId, draft = {}) {
  if (!jobId) return { ok: false, status: "job-id-required", message: "Select a completed job before saving upload metadata." };
  const jobRecord = await readJob(paths.jobsDir, jobId);
  if (!jobRecord?.jobDir) return { ok: false, status: "job-dir-missing", message: `Job directory is missing for ${jobId}.` };
  const current = await getUploadDraftForJob(jobId);
  const validation = validateUploadMetadata({ ...(current.metadata || {}), ...draft, jobId });
  if (!validation.ok) return { ok: false, status: "validation-failed", errors: validation.errors };
  const metadata = await writeUploadMetadata(jobRecord.jobDir, validation.metadata);
  return { ok: true, metadata, uploadState: await readUploadState(jobRecord.jobDir) };
}

async function uploadSelectedJobToYouTube(jobId, draft = {}) {
  if (!jobId) return { ok: false, status: "job-id-required", message: "Select a completed job before uploading." };
  const jobRecord = await readJob(paths.jobsDir, jobId);
  if (!jobRecord?.jobDir) return { ok: false, status: "job-dir-missing", message: `Job directory is missing for ${jobId}.` };
  const saved = await saveUploadDraftForJob(jobId, draft);
  if (!saved.ok) return saved;
  const metadata = saved.metadata;
  if (!metadata.videoPath || !existsSync(metadata.videoPath)) {
    return { ok: false, status: "video-missing", code: "YOUTUBE_VIDEO_MISSING", message: `Final video does not exist: ${metadata.videoPath}` };
  }
  const thumbnailValidation = await validateThumbnailForYouTube(metadata.thumbnailOptimizedPath || metadata.thumbnailPath);
  if (!thumbnailValidation.ok) {
    sendJobEvent({
      type: "youtube-upload-failed",
      jobId,
      phase: "upload",
      status: "failed",
      message: thumbnailValidation.message,
      details: { failureCode: thumbnailValidation.code, thumbnailPath: metadata.thumbnailPath },
    });
    return { ok: false, status: "thumbnail-invalid", ...thumbnailValidation };
  }

  const videoHash = await computeFileHash(metadata.videoPath);
  const previousState = await readUploadState(jobRecord.jobDir);
  if (previousState?.status === "uploaded" && previousState.videoHash === videoHash && previousState.videoId) {
    return {
      ok: false,
      status: "duplicate-upload-blocked",
      code: "YOUTUBE_DUPLICATE_UPLOAD_BLOCKED",
      message: "This video was already uploaded for this job.",
      uploadState: previousState,
    };
  }

  await writeUploadState(jobRecord.jobDir, {
    jobId,
    status: "uploading",
    videoPath: metadata.videoPath,
    videoHash,
    startedAt: new Date().toISOString(),
  });
  sendJobEvent({
    type: "youtube-upload-started",
    jobId,
    phase: "upload",
    status: "running",
    percent: 96,
    message: "YouTube upload metadata validated.",
    details: { videoPath: metadata.videoPath },
  });

  const uploadResult = await uploadVideoToYouTube({
    videoPath: metadata.videoPath,
    thumbnailPath: metadata.thumbnailOptimizedPath || metadata.thumbnailPath,
    metadata,
    tokenPath: paths.youtubeTokenPath,
    clientSecretsPath: paths.youtubeClientSecretsPath,
    onProgress: (progress) => sendJobEvent({
      type: "job-progress",
      jobId,
      phase: "upload",
      status: progress.status || "running",
      percent: 96,
      message: progress.message || "Uploading video to YouTube.",
      details: progress.details || {},
    }),
  });

  if (!uploadResult.ok) {
    const state = await writeUploadState(jobRecord.jobDir, {
      jobId,
      status: "failed",
      videoPath: metadata.videoPath,
      videoHash,
      lastError: uploadResult.message || uploadResult.status,
      failureCode: uploadResult.code || "YOUTUBE_UPLOAD_FAILED",
      startedAt: previousState?.startedAt || new Date().toISOString(),
    });
    sendJobEvent({
      type: "youtube-upload-failed",
      jobId,
      phase: "upload",
      status: "failed",
      message: uploadResult.message || "YouTube upload failed.",
      details: { failureCode: uploadResult.code || "YOUTUBE_UPLOAD_FAILED", uploadState: state },
    });
    return { ...uploadResult, uploadState: state };
  }

  const state = await writeUploadState(jobRecord.jobDir, {
    jobId,
    status: "uploaded",
    videoPath: metadata.videoPath,
    videoHash,
    videoId: uploadResult.videoId,
    youtubeUrl: uploadResult.youtubeUrl,
    thumbnailBound: Boolean(uploadResult.thumbnailBound),
    completedAt: new Date().toISOString(),
  });
  await upsertJob(paths.jobsDir, {
    ...jobRecord,
    uploadState: state,
    uploadedVideoId: uploadResult.videoId,
    uploadedUrl: uploadResult.youtubeUrl,
  });
  sendJobEvent({
    type: "youtube-upload-completed",
    jobId,
    phase: "upload",
    status: "completed",
    percent: 100,
    message: "YouTube upload complete.",
    details: { videoId: uploadResult.videoId, youtubeUrl: uploadResult.youtubeUrl, thumbnailBound: uploadResult.thumbnailBound },
  });
  return { ...uploadResult, uploadState: state };
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

ipcMain.handle("ollama:health", async (_event, options = {}) => {
  const persisted = await loadConfig(paths.configPath).catch(() => ({}));
  const config = normalizeOllamaConfig({ ...persisted, ...options });
  return checkOllamaHealth({ config });
});

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

ipcMain.handle("youtube:authenticateFlowAccountSlot", async (_event, slotId = "default") => {
  const { cleanSlotId, target, profileDir } = resolveFlowAccountSlotProfile(slotId);
  const config = await loadConfig(paths.configPath);
  const chromePath = config.chromePath || findChromeExecutable();
  if (!chromePath) throw new Error("Chrome executable was not found. Set Chrome path in Settings.");

  const lockPath = await claimBrowserProfile(profileDir);
  const launch = openPersistentChrome({
    chromePath,
    profileDir,
    url: "https://labs.google/fx/ko/tools/flow",
  });
  await writeBrowserProfileLock(lockPath, launch.pid);

  const result = {
    ...launch,
    target,
    slotId: cleanSlotId,
    label: cleanSlotId === "default" ? "Google Flow" : `Google Flow ${cleanSlotId}`,
    lockPath,
    status: "auth-window-opened",
  };
  await saveConfig(paths.configPath, {
    ...config,
    auth: {
      ...(config.auth || {}),
      [target]: {
        ...result,
        updatedAt: new Date().toISOString(),
      },
    },
  });
  return result;
});

ipcMain.handle("youtube:clearFlowAccountSlot", async (_event, slotId = "default") => {
  const { cleanSlotId, target, profileDir } = resolveFlowAccountSlotProfile(slotId);
  const profilesRoot = join(paths.userData, "browser-profiles");
  if (!profileDir.toLowerCase().startsWith(profilesRoot.toLowerCase())) {
    throw new Error(`Refusing to clear Flow profile outside browser-profiles: ${profileDir}`);
  }
  await rm(profileDir, { recursive: true, force: true });
  const config = await loadConfig(paths.configPath);
  const nextAuth = { ...(config.auth || {}) };
  delete nextAuth[target];
  await saveConfig(paths.configPath, {
    ...config,
    auth: {
      ...nextAuth,
      [target]: {
        ok: true,
        target,
        slotId: cleanSlotId,
        status: "cleared",
        clearedPath: profileDir,
        updatedAt: new Date().toISOString(),
      },
    },
  });
  return { ok: true, target, slotId: cleanSlotId, status: "cleared", clearedPath: profileDir };
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
    if (inputWithId.ollamaAssistEnabled) {
      const ollamaHealth = await checkOllamaHealth({
        config: normalizeOllamaConfig(inputWithId),
      });
      if (!ollamaHealth.ok) {
        sendJobEvent({
          type: "workflow-warning",
          jobId: jobIdFromInput,
          phase: "ollama-preflight",
          message: `Ollama assist is enabled but unavailable: ${ollamaHealth.failureCode || ollamaHealth.status}. Local planner output will be preserved.`,
          details: ollamaHealth,
        });
      } else {
        sendJobEvent({
          type: "workflow-progress",
          jobId: jobIdFromInput,
          phase: "ollama-preflight",
          message: `Ollama assist connected: ${ollamaHealth.model}.`,
          details: ollamaHealth,
        });
      }
    }
    const result = await createYouTubeJob(inputWithId, {
      paths,
      emit: sendJobEvent,
      outputDir: OUTPUT_DIR,
      jobDir: activeJobDir,
      ffmpegBin: FFMPEG_BIN,
      chromePath: config.chromePath,
      config,
    });
    if (result.finalVideo?.jobDir) await writeDesktopResult(result.finalVideo.jobDir, result);
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
    const failureDetails = error?.details || error?.failureDetails || null;
    const renderReportPath = join(activeJobDir, "render-report-v2.json");
    const failureReportPath = join(activeJobDir, "desktop-failure.json");
    await writeFile(join(activeJobDir, "desktop-failure.json"), JSON.stringify({
      ok: false,
      message: error?.message || String(error),
      stack: error?.stack || "",
      input: sanitizeFailurePayload(inputWithId),
      failureDetails,
      renderReportPath,
      failureReportPath,
      updatedAt: new Date().toISOString(),
    }, null, 2), "utf8").catch(() => {});
    const failureProgressEvent = createFailureProgressEvent({
      jobId: jobIdFromInput,
      message: error?.message || String(error),
      details: { input: sanitizeFailurePayload(inputWithId), failureDetails, renderReportPath, failureReportPath },
    });
    await upsertJob(paths.jobsDir, {
      id: jobIdFromInput,
      title: inputWithId.sourceValue || jobIdFromInput,
      sourceValue: inputWithId.sourceValue || "",
      status: failureProgressEvent.status || "failed",
      jobDir: activeJobDir,
      finalPath: "",
      thumbnailPath: "",
      createdAt: inputWithId.createdAt || new Date().toISOString(),
    }).catch(() => {});
    sendJobEvent(failureProgressEvent);
    sendJobEvent({
      type: "desktop-job-failed",
      message: error?.message || String(error),
      input: sanitizeFailurePayload(inputWithId),
      failureDetails,
      renderReportPath,
      failureReportPath,
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
  const { stages, emitWorkflow, chromePath, flowAccountRouter } = createRecoveryWorkflowContext({ job, jobDir, config });
  const draft = existsSync(join(jobDir, "draft.json")) ? await readJsonFile(join(jobDir, "draft.json")) : undefined;
  const assets = await generateYouTubeWorkflowAssets(job, {
    ...stages,
    paths,
    job,
    jobDir,
    outputDir: OUTPUT_DIR,
    chromePath,
    ffmpegBin: FFMPEG_BIN,
    flowAccountRouter,
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
      ? "Thumbnail retry finished with local fallback; Google Flow still needs account, session, or policy recovery."
      : "Thumbnail retry completed.",
    details: {
      jobDir,
      thumbnailPath: thumbnailResult.thumbnail?.path,
      primaryProviderFailure: thumbnailResult.thumbnail?.primaryProviderFailure,
    },
  });
  return thumbnailResult;
});

ipcMain.handle("youtube:getUploadDraft", async (_event, jobId) => getUploadDraftForJob(jobId));

ipcMain.handle("youtube:saveUploadDraft", async (_event, jobId, draft) => saveUploadDraftForJob(jobId, draft));

ipcMain.handle("youtube:uploadJob", async (_event, jobId, draft) => uploadSelectedJobToYouTube(jobId, draft));

ipcMain.handle("youtube:approveUpload", async (_event, jobId) => {
  if (!jobId) {
    return { ok: false, status: "job-id-required", message: "Select a completed job before uploading." };
  }
  return uploadSelectedJobToYouTube(jobId, {});
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
