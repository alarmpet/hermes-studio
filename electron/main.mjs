import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
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

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: "utf8",
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", ...(options.env || {}) },
    maxBuffer: 40 * 1024 * 1024,
    timeout: options.timeoutMs || 15 * 60 * 1000,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed\nARGS: ${args.join(" ")}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

async function createSyntheticSceneVideo({ jobDir, scene, index }) {
  const colors = ["0f766e", "334155", "7c2d12", "4338ca", "166534", "9f1239"];
  const color = colors[index % colors.length];
  const outputPath = join(jobDir, `scene_${scene.order}.mp4`);
  runCommand(ffmpegPath, [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0x${color}:s=720x1280:d=8:r=30`,
    "-vf", "drawbox=x=54:y=96:w=612:h=260:color=black@0.28:t=fill",
    "-an",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "veryfast",
    "-crf", "22",
    outputPath,
  ]);
  return outputPath;
}

function parseLastJson(stdout = "") {
  const match = String(stdout).trim().match(/\{[\s\S]*\}\s*$/);
  return match ? JSON.parse(match[0]) : {};
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
      const keyword = normalizedJob.sourceValue;
      const previewDraft = {
        title: `${keyword} Shorts`,
        duration_seconds: normalizedJob.options.scriptLengthPreset === "extended" ? 90 : 60,
        script: `${keyword} 흐름을 빠르게 정리하고, 시청자가 바로 이해할 수 있게 핵심 변화와 의미를 짚어드립니다.`,
        scenes: [
          {
            order: 1,
            narration: `${keyword}에서 가장 먼저 봐야 할 변화는 기술 경쟁의 속도입니다.`,
            image_prompt: "9:16 cinematic news opener, consistent Korean presenter, modern studio",
            duration_seconds: 8,
          },
          {
            order: 2,
            narration: "새로운 모델과 서비스가 빠르게 등장하면서 기업과 개인의 작업 방식이 달라지고 있습니다.",
            image_prompt: "9:16 cinematic AI newsroom, abstract data screens, consistent Korean presenter",
            duration_seconds: 8,
          },
          {
            order: 3,
            narration: "결국 중요한 건 유행을 따라가는 것이 아니라 실제로 시간을 줄여주는 도구를 고르는 일입니다.",
            image_prompt: "9:16 cinematic closing shot, creator reviewing AI workflow dashboard",
            duration_seconds: 8,
          },
          {
            order: 4,
            narration: "콘텐츠 제작에서는 기획, 이미지, 음성, 자막을 한 번에 연결하는 자동화가 더 중요해지고 있습니다.",
            image_prompt: "9:16 cinematic creator workstation with video timeline and AI panels",
            duration_seconds: 8,
          },
          {
            order: 5,
            narration: "다만 저작권, 개인정보, 합성 콘텐츠 표시 같은 운영 기준도 함께 확인해야 합니다.",
            image_prompt: "9:16 cinematic compliance checklist and upload dashboard",
            duration_seconds: 8,
          },
          {
            order: 6,
            narration: "핵심은 빠르게 만들되, 검수와 승인 단계를 남겨 안정적으로 발행하는 것입니다.",
            image_prompt: "9:16 cinematic final review screen before publishing",
            duration_seconds: 8,
          },
        ],
      };
      await writeFile(requestPath, JSON.stringify(normalizedJob, null, 2), "utf8");
      await writeFile(draftPath, JSON.stringify(previewDraft, null, 2), "utf8");
      const sceneMedia = [];
      for (let index = 0; index < previewDraft.scenes.length; index += 1) {
        const scene = previewDraft.scenes[index];
        sendJobEvent({ type: "desktop-scene-video-started", jobId: normalizedJob.id, scene });
        const path = await createSyntheticSceneVideo({ jobDir, scene, index });
        sceneMedia.push({ order: scene.order, path });
        sendJobEvent({ type: "desktop-scene-video-completed", jobId: normalizedJob.id, scene, path });
      }
      sendJobEvent({ type: "desktop-preview-assets-ready", jobId: normalizedJob.id, jobDir });
      return { jobDir, draft: previewDraft, requestPath, draftPath, sceneMedia };
    },
    renderFinalYouTubeVideo: async (normalizedJob, assets) => {
      const finalName = `desktop-test-${Date.now()}.mp4`;
      sendJobEvent({ type: "desktop-render-started", jobId: normalizedJob.id, jobDir: assets.jobDir });
      const result = runCommand(process.env.npm_node_execpath || "node", [
        join(ROOT, "scripts", "render-youtube-with-tts.mjs"),
        assets.jobDir,
      ], {
        env: { HERMES_YOUTUBE_FINAL_NAME: finalName },
        timeoutMs: 20 * 60 * 1000,
      });
      const parsed = parseLastJson(result.stdout);
      const finalPath = parsed.finalPath || join(assets.jobDir, finalName);
      if (!existsSync(finalPath)) throw new Error(`Final rendered video was not found: ${finalPath}`);
      const desktopResult = { ...parsed, jobId: normalizedJob.id, jobDir: assets.jobDir, finalPath };
      await writeFile(join(assets.jobDir, "desktop-result.json"), JSON.stringify(desktopResult, null, 2), "utf8");
      sendJobEvent({ type: "desktop-render-completed", jobId: normalizedJob.id, finalPath });
      return desktopResult;
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
