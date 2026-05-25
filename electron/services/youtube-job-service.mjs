import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeYouTubeJobRequest } from "../../youtube-job-schema.mjs";
import { runYouTubeJob } from "../../youtube-job-runner.mjs";
import { createDefaultYouTubeStages } from "../../youtube-workflow-stages.mjs";
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
  const jobDir = context.jobDir || join(context.outputDir, "desktop", job.id);
  const chromePath = context.chromePath || findChromeExecutable();
  await mkdir(jobDir, { recursive: true });

  const progress = (event) => emitJobProgress(context.emit, { jobId: job.id, ...event });
  const emitWorkflow = (event = {}) => {
    if (event.type === "workflow-progress" || event.type === "workflow-warning") {
      progress({
        phase: event.phase || "submitted",
        status: event.type === "workflow-warning" ? "running" : event.status || "running",
        message: event.message,
        details: event.details || {},
      });
      return;
    }
    context.emit?.(event);
  };

  progress({
    phase: "submitted",
    message: "작업을 접수했습니다. 입력값을 정리하는 중입니다.",
    details: { sourceType: job.sourceType, sourceValue: job.sourceValue },
  });

  const stages = createDefaultYouTubeStages({
    ...context,
    job,
    jobDir,
    paths: context.paths,
    chromePath,
    ffmpegBin: context.ffmpegBin,
    emit: emitWorkflow,
    onFlowProgress: ({ message, details }) => progress({
      phase: "flow-media",
      message,
      details: { ...(details || {}) },
    }),
  });

  const result = await runYouTubeJob(job, {
    ...context,
    ...stages,
    emit: emitWorkflow,
    job,
    jobDir,
    chromePath,
    renderScriptPath: context.paths?.renderScriptPath,
    finalName: `desktop-${job.options.mockMediaMode ? "mock" : "flow"}-${Date.now()}.mp4`,
  });

  progress({
    phase: "thumbnail",
    message: "최종 영상 맥락을 반영해 썸네일을 준비하는 중입니다.",
  });

  const thumbnail = await stages.generateThumbnail(result, { ...context, job, jobDir });
  progress({
    phase: "completed",
    status: "completed",
    message: "최종 영상 생성이 완료되었습니다.",
    details: { finalPath: result.finalVideo?.finalPath, thumbnailPath: thumbnail?.path },
  });
  return { ...result, thumbnail };
}

export async function writeDesktopResult(jobDir, result) {
  const resultPath = join(jobDir, "desktop-result.json");
  await writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
  return resultPath;
}
