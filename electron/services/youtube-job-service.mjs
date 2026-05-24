import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeYouTubeJobRequest } from "../../youtube-job-schema.mjs";
import { runYouTubeJob } from "../../youtube-job-runner.mjs";
import { generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "../../youtube-workflow.mjs";
import { createThumbnailForJob } from "../../pipeline/youtube-thumbnail.mjs";
import { generateGoogleFlowVideoFromPrompt } from "../../automation/google-flow-media.mjs";
import { findChromeExecutable } from "./browser-profile-service.mjs";
import { emitJobProgress } from "./job-progress-events.mjs";

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
  emitJobProgress(context.emit, {
    jobId: job.id,
    phase: "submitted",
    message: "작업을 접수했습니다. 입력값을 정리하는 중입니다.",
    details: { sourceType: job.sourceType, sourceValue: job.sourceValue },
  });

  const jobDir = context.jobDir || join(context.outputDir, "desktop", job.id);
  await mkdir(jobDir, { recursive: true });

  emitJobProgress(context.emit, {
    jobId: job.id,
    phase: "source-research",
    message: job.sourceType === "url" ? "URL 자료를 확인하는 중입니다." : "키워드 기반 자료를 확인하는 중입니다.",
  });

  const progressContext = { ...context, job };
  const generateSceneMedia = async (args) => {
    emitJobProgress(context.emit, {
      jobId: job.id,
      phase: "flow-media",
      message: `장면 ${args.scene.order} 영상을 생성하는 중입니다.`,
      details: { sceneOrder: args.scene.order, narration: args.scene.narration },
    });

    return job.options.mockMediaMode
      ? generateMockMedia(args, progressContext)
      : generateFlowMedia(args, progressContext);
  };

  const renderFinalVideoWithProgress = async (runnerJob, assets, runnerContext) => {
    emitJobProgress(context.emit, {
      jobId: runnerJob.id,
      phase: "render",
      message: "TTS 음성, 자막, 최종 영상을 렌더링하는 중입니다.",
      details: { jobDir: assets.jobDir },
    });
    return renderFinalYouTubeVideo(runnerJob, assets, runnerContext);
  };

  emitJobProgress(context.emit, {
    jobId: job.id,
    phase: "script-draft",
    message: "대본 초안과 장면 구성 정보를 생성하는 중입니다.",
  });

  const result = await runYouTubeJob(job, {
    ...context,
    job,
    jobDir,
    generateYouTubeWorkflowAssets,
    renderFinalYouTubeVideo: renderFinalVideoWithProgress,
    generateSceneMedia,
    renderScriptPath: context.paths?.renderScriptPath,
    finalName: `desktop-${job.options.mockMediaMode ? "mock" : "flow"}-${Date.now()}.mp4`,
  });
  emitJobProgress(context.emit, {
    jobId: job.id,
    phase: "thumbnail",
    message: "최종 영상 맥락을 반영한 썸네일을 준비하는 중입니다.",
  });

  const thumbnail = await createThumbnailForJob({
    draft: result.assets.draft,
    paths: context.paths,
    jobDir,
  });
  emitJobProgress(context.emit, {
    jobId: job.id,
    phase: "completed",
    status: "completed",
    message: "최종 영상 생성이 완료되었습니다.",
    details: { finalPath: result.finalVideo?.finalPath, thumbnailPath: thumbnail?.path },
  });
  return { ...result, thumbnail };
}

export async function generateFlowMedia({ scene, jobDir }, context = {}) {
  emitJobProgress(context.emit, {
    jobId: context.job?.id || "",
    phase: "flow-media",
    message: `장면 ${scene.order} Google Flow 브라우저 자동화를 실행하는 중입니다.`,
    details: { sceneOrder: scene.order, narration: scene.narration },
  });
  try {
    const media = await generateGoogleFlowVideoFromPrompt({
      prompt: scene.image_prompt,
      jobDir,
      sceneOrder: scene.order,
      chromePath: context.chromePath || findChromeExecutable(),
      profileDir: context.paths?.flowProfileDir,
      timeoutMs: context.flowTimeoutMs,
    });
    return { path: media.path, bytes: media.bytes, contentType: media.contentType };
  } catch (error) {
    emitJobProgress(context.emit, {
      jobId: context.job?.id || "",
      phase: "flow-media",
      status: "action-required",
      message: `장면 ${scene.order} Google Flow 영상 생성 단계에서 멈췄습니다.`,
      details: { sceneOrder: scene.order, narration: scene.narration, error: error?.message || String(error) },
      actionRequired: {
        title: "Google Flow 자동화 확인 필요",
        message: error?.message || "Google Flow에서 새 영상 URL을 찾지 못했습니다. 열린 Flow 화면과 저장된 스크린샷을 확인해 주세요.",
      },
    });
    throw error;
  }
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
