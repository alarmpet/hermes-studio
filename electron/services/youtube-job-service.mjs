import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeYouTubeJobRequest } from "../../youtube-job-schema.mjs";
import { runYouTubeJob } from "../../youtube-job-runner.mjs";
import { generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "../../youtube-workflow.mjs";

export function buildDesktopJobRequest(input = {}) {
  return normalizeYouTubeJobRequest({
    sourceType: input.sourceType,
    sourceValue: input.sourceValue,
    requestedBy: "desktop",
    options: {
      scriptLengthPreset: input.scriptLengthPreset || "standard",
      scriptLengthMode: input.scriptLengthMode || "preset",
      customDurationSeconds: input.customDurationSeconds || 90,
      sceneStrategy: input.sceneStrategy || "sentence-proportional",
      voiceId: input.voiceId || "male_30_announcer",
      speechSpeed: Number(input.speechSpeed || 1.08),
      subtitleStyleId: input.subtitleStyleId || "bold-shorts",
      subtitleStyle: input.subtitleStyle || {},
      thumbnailMode: input.thumbnailMode || "auto",
      sendIntermediateMedia: false,
      mockMediaMode: Boolean(input.mockMediaMode),
    },
    upload: {
      enabled: Boolean(input.uploadEnabled),
      requireApproval: true,
      privacyStatus: input.privacyStatus || "private",
      containsSyntheticMedia: true,
    },
  });
}

export async function createYouTubeJob(input, context = {}) {
  const job = buildDesktopJobRequest(input);
  const jobDir = context.jobDir || join(context.outputDir, "desktop", job.id);
  await mkdir(jobDir, { recursive: true });

  const generateSceneMedia = job.options.mockMediaMode
    ? (args) => generateMockMedia(args, context)
    : (args) => generateFlowMedia(args, context);

  return runYouTubeJob(job, {
    ...context,
    jobDir,
    generateYouTubeWorkflowAssets,
    renderFinalYouTubeVideo,
    generateSceneMedia,
    renderScriptPath: context.paths?.renderScriptPath,
    finalName: `desktop-${job.options.mockMediaMode ? "mock" : "flow"}-${Date.now()}.mp4`,
  });
}

export async function generateFlowMedia({ scene }) {
  throw new Error(`Google Flow media generation is required for scene ${scene.order}, but the desktop Flow automation stage is not wired yet.`);
}

export async function generateMockMedia({ scene, jobDir }, context = {}) {
  const ffmpegBin = context.ffmpegBin;
  if (!ffmpegBin) throw new Error("ffmpegBin is required for Mock Media Mode.");
  const outputPath = join(jobDir, `scene_${scene.order}.mp4`);
  const colors = ["0f766e", "334155", "7c2d12", "4338ca", "166534", "9f1239"];
  const color = colors[(Number(scene.order || 1) - 1) % colors.length];
  const duration = Math.max(4, Number(scene.duration_seconds || 8));
  runCommand(ffmpegBin, [
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
  ], context);
  return { path: outputPath };
}

function runCommand(command, args, context = {}) {
  const result = spawnSync(command, args, {
    cwd: context.cwd || context.paths?.appRoot,
    encoding: "utf8",
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", ...(context.env || {}) },
    maxBuffer: 40 * 1024 * 1024,
    timeout: context.timeoutMs || 15 * 60 * 1000,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed\nARGS: ${args.join(" ")}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

export async function writeDesktopResult(jobDir, result) {
  const resultPath = join(jobDir, "desktop-result.json");
  await writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
  return resultPath;
}
