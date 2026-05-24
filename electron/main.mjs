import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawnSync } from "node:child_process";
import { EventEmitter } from "node:events";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";
import { runYouTubeJob } from "../youtube-job-runner.mjs";
import { getAuthStatus, startAuth } from "./services/auth-service.mjs";
import { loadConfig, saveConfig } from "./services/config-store.mjs";
import { getRuntimePaths } from "./services/path-resolver.mjs";
import { planScenesFromScript } from "./services/script-planner.mjs";
import { listVisibleVoicePresets } from "./services/voice-presets.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const paths = getRuntimePaths();
const PROJECT_ROOT = process.env.HERMES_PROJECT_ROOT || "C:/Users/amd/hermes";
const OUTPUT_DIR = process.env.HERMES_OUTPUT_DIR || paths.outputDir;
const RENDER_SCRIPT = paths.renderScriptPath;
const FFMPEG_BIN = app.isPackaged ? ffmpegPath.replace("app.asar", "app.asar.unpacked") : ffmpegPath;
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
      scriptLengthMode: input.scriptLengthMode || "preset",
      customDurationSeconds: input.customDurationSeconds,
      sceneStrategy: input.sceneStrategy || "sentence-proportional",
      voiceId: input.voiceId,
      speechSpeed: Number(input.speechSpeed || 1.08),
      subtitleStyleId: input.subtitleStyleId,
      subtitleStyle: input.subtitleStyle || {},
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
    cwd: options.cwd || PROJECT_ROOT,
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
  const duration = Math.max(4, Number(scene.duration_seconds || 8));
  runCommand(FFMPEG_BIN, [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0x${color}:s=720x1280:d=${duration}:r=30`,
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
      const targetSeconds = normalizedJob.options.scriptLengthMode === "custom"
        ? Number(normalizedJob.options.customDurationSeconds || 90)
        : normalizedJob.options.scriptLengthPreset === "extended" ? 90 : 60;
      const script = [
        `${keyword}의 핵심 흐름을 빠르게 정리해보겠습니다.`,
        "첫 번째로, 지금 가장 중요한 변화는 기술 자체보다 실제 업무에 적용되는 속도입니다.",
        "두 번째로, 기업과 개인은 비용을 줄이면서도 더 많은 콘텐츠와 분석을 만들 수 있게 됐습니다.",
        "하지만 자동화가 강해질수록 저작권, 개인정보, 합성 콘텐츠 표시는 반드시 확인해야 합니다.",
        "결국 좋은 도구를 고르는 기준은 유행이 아니라 시간을 얼마나 줄이고 결과를 얼마나 안정적으로 만드는지입니다.",
        "Hermes는 이 흐름을 대본, 영상, 음성, 자막, 검수 단계까지 하나로 연결하는 방향으로 발전하고 있습니다.",
      ].join(" ");
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
      previewDraft.duration_seconds = targetSeconds;
      previewDraft.script = script;
      previewDraft.scenes = planScenesFromScript({
        script,
        title: previewDraft.title,
        targetSeconds,
        customDurationSeconds: normalizedJob.options.scriptLengthMode === "custom" ? normalizedJob.options.customDurationSeconds : undefined,
        characterProfile: "same recurring Korean female presenter in her early 30s, shoulder-length black hair, teal blazer over a white top",
      });
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
        RENDER_SCRIPT,
        assets.jobDir,
      ], {
        env: { HERMES_YOUTUBE_FINAL_NAME: finalName, FFMPEG_BIN },
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
  root: paths.appRoot,
  runtimeRoot: paths.runtimeRoot,
  outputDir: OUTPUT_DIR,
  ttsRoot: process.env.HERMES_TTS_ROOT || (await loadConfig(paths.configPath)).ttsRoot || paths.defaultTtsRoot,
}));

ipcMain.handle("config:get", async () => loadConfig(paths.configPath));

ipcMain.handle("config:save", async (_event, config) => saveConfig(paths.configPath, config));

ipcMain.handle("presets:voices", async () => listVisibleVoicePresets());

ipcMain.handle("auth:status", async () => {
  const config = await loadConfig(paths.configPath);
  return getAuthStatus(config);
});

ipcMain.handle("auth:start", async (_event, target) => {
  const config = await loadConfig(paths.configPath);
  const result = await startAuth(target, { config, paths });
  const nextConfig = {
    ...config,
    auth: {
      ...(config.auth || {}),
      [target]: {
        status: result.status,
        profileDir: result.profileDir,
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
