import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { EventEmitter } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";
import { runYouTubeJob } from "../youtube-job-runner.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const OUTPUT_DIR = process.env.HERMES_OUTPUT_DIR || join(ROOT, "outputs");
const jobEvents = new EventEmitter();

let mainWindow = null;

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
  jobEvents.emit("event", event);
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("youtube:event", event);
}

function buildDesktopJobRequest(input = {}) {
  return normalizeYouTubeJobRequest({
    sourceType: input.sourceType,
    sourceValue: input.sourceValue,
    requestedBy: "desktop",
    options: {
      scriptLengthPreset: input.scriptLengthPreset,
      voiceId: input.voiceId,
      speechSpeed: Number(input.speechSpeed || 1.08),
      subtitleStyleId: input.subtitleStyleId,
      thumbnailMode: input.thumbnailMode || "auto",
      sendIntermediateMedia: false,
    },
    upload: {
      enabled: Boolean(input.uploadEnabled),
      requireApproval: true,
      privacyStatus: input.privacyStatus || "private",
      containsSyntheticMedia: true,
    },
  });
}

async function createDesktopPreviewJob(input = {}) {
  const job = buildDesktopJobRequest(input);
  const jobDir = join(OUTPUT_DIR, "desktop", job.id);
  await mkdir(jobDir, { recursive: true });

  return runYouTubeJob(job, {
    jobDir,
    outputDir: OUTPUT_DIR,
    emit: sendJobEvent,
    generateYouTubeWorkflowAssets: async (normalizedJob) => {
      const requestPath = join(jobDir, "job-request.json");
      const draftPath = join(jobDir, "draft.json");
      const previewDraft = {
        title: `${normalizedJob.sourceValue} Shorts`,
        duration_seconds: normalizedJob.options.scriptLengthPreset === "extended" ? 90 : 60,
        script: `${normalizedJob.sourceValue} 주제로 쇼츠 대본과 장면 프롬프트를 생성할 준비가 완료되었습니다.`,
        scenes: [
          {
            order: 1,
            narration: "핵심 이슈를 짧고 강하게 소개합니다.",
            image_prompt: "9:16 cinematic news opener, consistent Korean presenter, modern studio",
            duration_seconds: 8,
          },
        ],
      };
      await writeFile(requestPath, JSON.stringify(normalizedJob, null, 2), "utf8");
      await writeFile(draftPath, JSON.stringify(previewDraft, null, 2), "utf8");
      sendJobEvent({ type: "desktop-preview-assets-ready", jobId: normalizedJob.id, jobDir });
      return { jobDir, draft: previewDraft, requestPath, draftPath, previewOnly: true };
    },
    renderFinalYouTubeVideo: async (normalizedJob, assets) => {
      const result = {
        previewOnly: true,
        jobId: normalizedJob.id,
        jobDir: assets.jobDir,
        message: "Desktop UI preview job created. Full Flow rendering will be wired in the next production stage.",
      };
      await writeFile(join(assets.jobDir, "desktop-result.json"), JSON.stringify(result, null, 2), "utf8");
      return result;
    },
  });
}

ipcMain.handle("app:getConfig", async () => ({
  root: ROOT,
  outputDir: OUTPUT_DIR,
  ttsRoot: process.env.HERMES_TTS_ROOT || "C:/Users/amd/supertonic3-local-tts-20260517-r4",
}));

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
  const result = await createDesktopPreviewJob(input);
  sendJobEvent({ type: "desktop-job-finished", jobId: result.job.id, jobDir: result.assets.jobDir });
  return result;
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
