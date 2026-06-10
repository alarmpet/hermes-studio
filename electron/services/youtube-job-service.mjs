import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { normalizeYouTubeJobRequest } from "../../youtube-job-schema.mjs";
import { runYouTubeJob } from "../../youtube-job-runner.mjs";
import { createDefaultYouTubeStages } from "../../youtube-workflow-stages.mjs";
import { findChromeExecutable } from "./browser-profile-service.mjs";
import { emitJobProgress } from "./job-progress-events.mjs";
import { ingestCharacterSheet } from "./character-sheet-ingest.mjs";
import { maybeRunWebwrightDiagnostics } from "./webwright-diagnostics-service.mjs";
import { createThumbnailForJob } from "../../pipeline/youtube-thumbnail.mjs";
import { createFlowRequestPacer } from "./flow-request-pacer.mjs";

export function buildDesktopJobRequest(input = {}) {
  return normalizeYouTubeJobRequest({
    id: input.id,
    sourceType: input.sourceType,
    sourceValue: input.sourceValue,
    requestedBy: "desktop",
    options: {
      videoFormat: input.videoFormat || "shorts",
      longformTargetSeconds: input.longformTargetSeconds || input.customDurationSeconds || 720,
      introVideoSeconds: input.introVideoSeconds || 60,
      introVideoClipCount: input.introVideoClipCount || input.hybridIntroVideoSceneCount || 10,
      bodyVisualMode: input.bodyVisualMode || "image",
      bodyImageSeconds: input.bodyImageSeconds || 18,
      enableLiveMcp: Boolean(input.enableLiveMcp),
      scriptLengthPreset: input.scriptLengthPreset || "standard",
      scriptLengthMode: input.scriptLengthMode || "preset",
      customDurationSeconds: input.customDurationSeconds || 60,
      estimatedScriptSeconds: input.estimatedScriptSeconds || 0,
      durationSource: input.durationSource || "user-selected",
      scriptStructure: input.scriptStructure || "hpsl",
      sceneStrategy: input.sceneStrategy || "sentence-proportional",
      voiceId: input.voiceId || "male_30_high",
      speechSpeed: Number(input.speechSpeed || 1.08),
      subtitleStyleId: input.subtitleStyleId || "bold-shorts",
      subtitleStyle: input.subtitleStyle || {},
      titleOverlayEnabled: input.titleOverlayEnabled !== false,
      titleOverlayMode: input.titleOverlayMode || (input.titleOverlayText ? "manual" : "auto"),
        titleOverlayText: input.titleOverlayText || "",
        titleOverlayStyleId: input.titleOverlayStyleId || "bold-black-accent",
        titleOverlayMaxLines: input.titleOverlayMaxLines || 2,
        titleOverlaySafeTop: input.titleOverlaySafeTop ?? 84,
        titleOverlayStyle: input.titleOverlayStyle || {},
        aspectRatio: input.aspectRatio || "9:16",
      autoLandscapeLongform: Boolean(input.autoLandscapeLongform),
      thumbnailMode: input.thumbnailMode || "auto",
      thumbnailOverlay: input.thumbnailOverlay || {},
      flowOutputMode: input.flowOutputMode || "video",
      hybridIntroVideoSceneCount: input.hybridIntroVideoSceneCount,
      renderEffectPreset: input.renderEffectPreset || "cinematic",
      transitionPreset: input.transitionPreset || "scene-fade",
      transitionSeconds: input.transitionSeconds ?? 0.3,
      motionIntensity: input.motionIntensity || "light",
      stylePresetId: input.stylePresetId || "stickmanplus",
      researchProvider: input.researchProvider || "gemini-gems-browser",
      archiveProvider: input.archiveProvider || "local-files",
      characterSheet: input.characterSheet || {},
      ollamaAssistEnabled: Boolean(input.ollamaAssistEnabled),
      ollamaBaseUrl: input.ollamaBaseUrl || "http://127.0.0.1:11434",
      ollamaModel: input.ollamaModel || "gemma4:12b",
      ollamaTimeoutMs: input.ollamaTimeoutMs,
      ollamaUseCases: input.ollamaUseCases || {},
      openaiProviderMode: input.openaiProviderMode || "disabled",
      openaiApiKeyConfigured: Boolean(input.openaiApiKeyConfigured),
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
  const nodeBin = findNodeExecutable();
  const flowPacer = context.flowPacer || (context.paths?.userData ? createFlowRequestPacer({ userData: context.paths.userData }) : null);
  await mkdir(jobDir, { recursive: true });
  job.options.characterSheet = await ingestCharacterSheet({
    jobDir,
    characterSheet: job.options.characterSheet,
  });

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
    details: {
      sourceType: job.sourceType,
      sourceValue: job.sourceValue,
      researchProvider: job.options.researchProvider,
      archiveProvider: job.options.archiveProvider,
      videoFormat: job.options.videoFormat,
    },
  });

  const stages = createDefaultYouTubeStages({
    ...context,
    job,
    jobDir,
    paths: context.paths,
    chromePath,
    ffmpegBin: context.ffmpegBin,
    flowPacer,
    enableLiveMcp: Boolean(job.options.enableLiveMcp),
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
    nodeBin,
    flowPacer,
    renderScriptPath: context.paths?.renderScriptPath,
    finalName: `desktop-${job.options.mockMediaMode ? "mock" : "flow"}-${Date.now()}.mp4`,
  });

  progress({
    phase: "thumbnail",
    message: "최종 영상 맥락을 반영해 썸네일을 준비하는 중입니다.",
  });

  const thumbnail = await stages.generateThumbnail(result, { ...context, job, jobDir, chromePath });
  if (thumbnail?.primaryProviderFailure) {
    const thumbnailActionRequired = createThumbnailActionRequired(thumbnail.primaryProviderFailure);
    const diagnostics = await maybeRunWebwrightDiagnostics({
      config: context.config || {},
      jobDir,
      provider: "google-flow-thumbnail",
      failure: thumbnail.primaryProviderFailure,
      sourceUrl: job.sourceType === "url" ? job.sourceValue : "",
    });
    progress({
      phase: "diagnostics",
      status: thumbnail.primaryProviderFailure.actionRequired ? "action-required" : "running",
      message: diagnostics.skipped
        ? "브라우저 진단은 비활성화되어 건너뜁니다."
        : `브라우저 진단 리포트가 생성되었습니다: ${diagnostics.reportPath}`,
      details: {
        ...diagnostics,
        primaryProviderFailure: thumbnail.primaryProviderFailure,
        thumbnailPath: thumbnail.path,
      },
      actionRequired: thumbnailActionRequired,
    });
  }
  const thumbnailActionRequired = thumbnail?.primaryProviderFailure
    ? createThumbnailActionRequired(thumbnail.primaryProviderFailure)
    : null;
  progress({
    phase: "completed",
    status: thumbnailActionRequired ? "action-required" : "completed",
    message: thumbnailActionRequired
      ? "Final video completed, but Google Flow thumbnail generation needs user action."
      : "최종 영상 생성이 완료되었습니다.",
    details: {
      finalPath: result.finalVideo?.finalPath,
      thumbnailPath: thumbnail?.path,
      primaryProviderFailure: thumbnail?.primaryProviderFailure,
    },
    actionRequired: thumbnailActionRequired,
  });
  return { ...result, thumbnail };
}

export async function retryThumbnailForJob({ job, jobDir, paths, chromePath, config = {}, emit }) {
  const draftPath = join(jobDir, "draft.json");
  if (!existsSync(draftPath)) throw new Error(`draft.json was not found for thumbnail retry: ${draftPath}`);
  const draft = JSON.parse(await readFile(draftPath, "utf8"));
  const progress = (event) => emitJobProgress(emit, { jobId: job.id, ...event });
  progress({
    phase: "thumbnail",
    status: "running",
    message: "Retrying Google Flow thumbnail generation only.",
    details: { jobDir, provider: "google-flow-image" },
  });
  const thumbnail = await createThumbnailForJob({
    draft,
    paths,
    jobDir,
    chromePath,
    flowTimeoutMs: config.flowTimeoutMs,
    aspectRatio: job?.options?.aspectRatio || "9:16",
    thumbnailOverlay: job?.options?.thumbnailOverlay || {},
    stylePresetId: job?.options?.stylePresetId || "",
    stylePreset: job?.options?.stylePreset || {},
    emit,
  });
  if (thumbnail?.primaryProviderFailure) {
    const thumbnailActionRequired = createThumbnailActionRequired(thumbnail.primaryProviderFailure);
    const diagnostics = await maybeRunWebwrightDiagnostics({
      config,
      jobDir,
      provider: "google-flow-thumbnail",
      failure: thumbnail.primaryProviderFailure,
      sourceUrl: job.sourceType === "url" ? job.sourceValue : "",
    });
    progress({
      phase: "diagnostics",
      status: thumbnail.primaryProviderFailure.actionRequired ? "action-required" : "running",
      message: diagnostics.skipped
        ? "Google Flow thumbnail retry needs user action; browser diagnostics were skipped."
        : `Google Flow thumbnail retry needs user action; diagnostics report: ${diagnostics.reportPath}`,
      details: {
        jobDir,
        thumbnailPath: thumbnail.path,
        primaryProviderFailure: thumbnail.primaryProviderFailure,
        diagnostics,
      },
      actionRequired: thumbnailActionRequired,
    });
  }
  const thumbnailActionRequired = thumbnail?.primaryProviderFailure
    ? createThumbnailActionRequired(thumbnail.primaryProviderFailure)
    : null;
  progress({
    phase: "thumbnail",
    status: thumbnail?.primaryProviderFailure?.actionRequired ? "action-required" : "completed",
    message: thumbnail?.primaryProviderFailure
      ? "Google Flow thumbnail retry fell back to a local thumbnail. Complete Google Flow authentication or account recovery and retry thumbnail only."
      : "Google Flow thumbnail retry completed.",
    details: {
      jobDir,
      thumbnailPath: thumbnail?.path,
      primaryProviderFailure: thumbnail?.primaryProviderFailure,
    },
    actionRequired: thumbnailActionRequired,
  });
  return { ok: true, job, jobDir, thumbnail };
}

function createThumbnailActionRequired(failure = {}) {
  if (!failure?.actionRequired) return null;
  const code = failure.code || failure.failureCode || "";
  if (String(code).startsWith("FLOW_THUMBNAIL_") || String(code).startsWith("FLOW_")) {
    return {
      title: "Google Flow thumbnail action required",
      message: "Open Authenticate Google Flow, verify the account/session or policy warning, then click Retry Thumbnail Only.",
    };
  }
  if (code === "CHATGPT_HUMAN_VERIFICATION_REQUIRED") {
    return {
      title: "ChatGPT human verification required",
      message: "Open Authenticate ChatGPT, complete the Cloudflare human verification manually, then click Retry Thumbnail Only.",
    };
  }
  if (code === "CHATGPT_AUTH_REQUIRED") {
    return {
      title: "ChatGPT login required",
      message: "Open Authenticate ChatGPT, sign in manually, then click Retry Thumbnail Only.",
    };
  }
  return {
    title: "Thumbnail action required",
    message: "Open the related authentication button, resolve the browser prompt manually, then click Retry Thumbnail Only.",
  };
}

export function findNodeExecutable(env = process.env) {
  const candidates = [
    env.HERMES_NODE_BIN,
    env.npm_node_execpath,
    "C:/Program Files/nodejs/node.exe",
    "C:/Program Files (x86)/nodejs/node.exe",
    ...(env.PATH || "").split(delimiter).map((entry) => join(entry, "node.exe")),
  ]
    .filter(Boolean)
    .filter((candidate) => !/electron(\.exe)?$/i.test(candidate));
  return candidates.find((candidate) => existsSync(candidate)) || "";
}

export async function writeDesktopResult(jobDir, result) {
  const resultPath = join(jobDir, "desktop-result.json");
  await writeFile(resultPath, JSON.stringify(result, null, 2), "utf8");
  return resultPath;
}
