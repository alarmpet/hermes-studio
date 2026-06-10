import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { copyFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { findChromeExecutable } from "./electron/services/browser-profile-service.mjs";
import { fallbackDraftFromJob, generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "./youtube-workflow.mjs";
import { buildGeminiResearchDraft } from "./automation/gemini-research-draft.mjs";
import { generateGoogleFlowVideoFromPrompt } from "./automation/google-flow-media.mjs";
import { buildFlowSafeFallbackPrompt } from "./electron/services/flow-prompt-safety.mjs";
import { buildDirectScriptDraft } from "./electron/services/direct-script-draft-service.mjs";
import { renderImageSceneClip } from "./electron/services/image-scene-renderer.mjs";
import { normalizeSceneVideoClip } from "./electron/services/scene-video-normalizer.mjs";
import { resolveFfmpegBin } from "./electron/services/ffmpeg-bin-resolver.mjs";
import { chooseSceneMotionPreset } from "./electron/services/render-effect-presets.mjs";
import { createThumbnailForJob } from "./pipeline/youtube-thumbnail.mjs";
import { assertDraftQuality, validateDraftQuality } from "./scripts/youtube-draft-quality.mjs";
import { assertDraftDurationContract } from "./scripts/youtube-draft-duration.mjs";
import { analyzeYouTubeOutput } from "./scripts/analyze-youtube-output.mjs";
import { classifyNotebookLmFailure, requestNotebookLmResearch } from "./electron/services/notebooklm-provider.mjs";
import { normalizeResearchBrief, persistResearchBrief } from "./electron/services/longform-research-brief.mjs";
import { normalizeOllamaConfig } from "./electron/services/ollama-provider.mjs";
import { runOllamaStoryboardAssist } from "./electron/services/ollama-storyboard-assist.mjs";

export function createDefaultYouTubeStages(context = {}) {
  return {
    generateYouTubeWorkflowAssets,
    renderFinalYouTubeVideo: (job, assets, runnerContext) => renderFinalVideo(job, assets, { ...context, ...runnerContext }),
    buildDraft: (job, runnerContext) => buildResearchDraft(job, { ...context, ...runnerContext }),
    generateSceneMedia: (args, runnerContext) => generateSceneMedia(args, { ...context, ...runnerContext }),
    generateThumbnail: (result, runnerContext) => generateThumbnail(result, {
      ...context,
      ...runnerContext,
      // stages 클로저의 chromePath가 runnerContext에 없을 때 덮어씌워지지 않도록 보장
      chromePath: runnerContext?.chromePath || context.chromePath,
    }),
  };
}

export async function buildResearchDraft(job, context = {}) {
  if (job?.sourceType === "script") {
    let draft = buildDirectScriptDraft(job);
    if (job.options?.ollamaAssistEnabled && job.options?.ollamaUseCases?.storyboard) {
      const assist = await runOllamaStoryboardAssist({
        draft,
        config: normalizeOllamaConfig(job.options),
        requestJson: context.ollamaRequestJson,
      });
      draft = assist.draft;
      const appliedSceneOrders = Array.isArray(draft.scenes)
        ? draft.scenes
            .filter((scene) => scene?.storyboard_hint)
            .map((scene) => Number(scene.order))
            .filter((order) => Number.isFinite(order))
        : [];
      const diagnostics = {
        enabled: true,
        baseUrl: job.options?.ollamaBaseUrl || "http://127.0.0.1:11434",
        model: job.options?.ollamaModel || "gemma4:12b",
        appliedSceneOrders,
        ...(assist.diagnostics || {}),
      };
      if (context.jobDir) {
        await writeFile(
          join(context.jobDir, "ollama-storyboard-diagnostics.json"),
          JSON.stringify(diagnostics, null, 2),
          "utf8",
        ).catch(() => {});
      }
      context.emit?.({
        type: diagnostics.ok ? "workflow-progress" : "workflow-warning",
        jobId: job.id,
        phase: "ollama-storyboard",
        message: diagnostics.ok
          ? `Storyboard assist connected: ${diagnostics.hintCount || 0} hints applied to scenes ${appliedSceneOrders.join(", ") || "none"}.`
          : `Storyboard assist unavailable; local planner output preserved. ${diagnostics.failureCode || "OLLAMA_UNKNOWN_FAILURE"}`,
        details: diagnostics,
      });
    }
    context.emit?.({
      type: "workflow-progress",
      jobId: job.id,
      phase: "draft",
      message: `Direct script draft ready: ${draft.scenes?.length || 0} scenes.`,
      details: { title: draft.title, sceneCount: draft.scenes?.length || 0, scriptStructure: "direct-script" },
    });
    return draft;
  }

  if (job?.options?.mockMediaMode || context.job?.options?.mockMediaMode || context.mockMediaMode) {
    const draft = fallbackDraftFromJob(job);
    context.emit?.({
      type: "workflow-progress",
      jobId: job.id,
      phase: "research",
      message: "Mock Media Mode: 외부 Gemini/OpenRouter 없이 로컬 테스트 초안을 생성합니다.",
    });
    context.emit?.({
      type: "workflow-progress",
      jobId: job.id,
      phase: "draft",
      message: `대본 생성 완료: 장면 ${draft.scenes?.length || 0}개`,
      details: { title: draft.title, sceneCount: draft.scenes?.length || 0 },
    });
    return draft;
  }

  context.emit?.({
    type: "workflow-progress",
    jobId: job.id,
    phase: "research",
    message: job.sourceType === "url"
      ? "Gemini Gems에서 URL 자료 확인과 HPSL 대본 작성을 먼저 시도합니다."
      : "Gemini Gems에서 키워드 자료 확인과 HPSL 대본 작성을 먼저 시도합니다.",
  });
  if (context.jobDir) {
    const sourceEvidence = job.sourceType === "url"
      ? {
          provider: "gemini-gems-browser",
          notes: ["URL source must be transformed into HPSL narration without copying article text."],
          citations: [job.sourceValue],
        }
      : {
          provider: "gemini-gems-browser",
          notes: [`Keyword jobs must keep the exact keyword subject in the title or first narration: ${job.sourceValue}`],
          citations: [],
        };
    await persistResearchBrief({
      jobDir: context.jobDir,
      brief: sourceEvidence,
    }).catch(() => {});
  }
  const researchContext = { ...context };
  let draftJob = job;
  if (job?.options?.researchProvider === "notebooklm-mcp") {
    context.emit?.({
      type: "workflow-progress",
      jobId: job.id,
      phase: "research",
      message: "NotebookLM MCP에서 출처 기반 리서치 노트를 먼저 요청합니다.",
      details: { researchProvider: "notebooklm-mcp" },
    });
    try {
      const notebooklmResearch = await requestNotebookLmResearch(job, {
        ...context,
        enableLiveMcp: Boolean(job.options?.enableLiveMcp || context.enableLiveMcp),
      });
      if (context.jobDir) {
        await persistResearchBrief({
          jobDir: context.jobDir,
          brief: normalizeResearchBrief(notebooklmResearch),
        }).catch(() => {});
      }
      researchContext.notebooklmResearch = notebooklmResearch;
      draftJob = {
        ...job,
        options: {
          ...(job.options || {}),
          notebooklmResearch,
        },
      };
      context.emit?.({
        type: "workflow-progress",
        jobId: job.id,
        phase: "research",
        message: "NotebookLM MCP 리서치 노트를 Gemini HPSL 작성에 참고자료로 전달합니다.",
        details: {
          researchProvider: "notebooklm-mcp",
          notes: notebooklmResearch.notes?.length || 0,
          citations: notebooklmResearch.citations?.length || 0,
        },
      });
    } catch (error) {
      context.emit?.({
        type: "workflow-warning",
        jobId: job.id,
        phase: "research",
        message: `NotebookLM MCP research failed; falling back to Gemini Gems. ${error.message}`,
        details: {
          researchProvider: "notebooklm-mcp",
          fallbackProvider: "gemini-gems-browser",
          failureClass: classifyNotebookLmFailure(error),
        },
      });
    }
  }
  const draft = await buildGeminiResearchDraft(draftJob, researchContext);
  const qaPreview = validateDraftQuality({ draft, job, stage: "research" });
  if (!qaPreview.ok) {
    throw new Error(`Draft QA failed: ${qaPreview.reason}`);
  }
  const qa = assertDraftQuality({ draft, job, stage: "research" });
  const durationQa = assertDraftDurationContract({ draft, job, stage: "normalized-draft:research", jobDir: context.jobDir || "" });
  if (qa.qualityWarnings?.length) {
    context.emit?.({
      type: "workflow-warning",
      jobId: job.id,
      phase: "draft",
      message: "Draft QA warning: 대본은 생성됐지만 일부 장면은 분할 검토가 필요합니다.",
      details: { qualityWarnings: qa.qualityWarnings },
    });
  }
  context.emit?.({
    type: "workflow-progress",
    jobId: job.id,
    phase: "draft-duration-qa",
    message: "Draft duration QA passed before Flow generation.",
    details: { durationQa },
  });
  context.emit?.({
    type: "workflow-progress",
    jobId: job.id,
    phase: "draft",
    message: `대본 생성 완료: 장면 ${draft.scenes?.length || 0}개`,
    details: { title: draft.title, sceneCount: draft.scenes?.length || 0 },
  });
  return draft;
}

export async function generateSceneMedia({ job, scene, jobDir }, context = {}) {
  const resolvedFfmpegBin = resolveFfmpegBin(context.ffmpegBin);
  const mediaContext = resolvedFfmpegBin ? { ...context, ffmpegBin: resolvedFfmpegBin } : context;
  if (job?.options?.mockMediaMode || context.job?.options?.mockMediaMode || context.mockMediaMode) {
    return generateMockMedia({ scene, jobDir }, mediaContext);
  }

  const outputMode = scene.outputMode || scene.flowOutputMode || job?.options?.flowOutputMode || "video";
  const jobFlowOutputMode = job?.options?.flowOutputMode || "video";
  const hybridIntroVideoSceneCount = job?.options?.hybridIntroVideoSceneCount;
  const prompt = scene.image_prompt;
  const fallback = buildFlowSafeFallbackPrompt({
    title: context.draft?.title || context.assets?.draft?.title || "",
    narration: scene.narration,
    visualCategory: scene.visual_category,
    sceneOrder: scene.order,
    aspectRatio: job?.options?.aspectRatio || "9:16",
  });
  context.emit?.({
    type: "workflow-progress",
    jobId: job?.id || context.job?.id || "",
    phase: "flow-prompt-safety",
    message: scene.flow_prompt_safety?.changed
      ? `장면 ${scene.order} Flow 프롬프트를 정책 안전형으로 정리했습니다.`
      : `장면 ${scene.order} Flow 프롬프트 안전 검사를 통과했습니다.`,
    details: {
      flow_prompt_safety: scene.flow_prompt_safety || fallback,
      recovered: false,
      sceneOrder: scene.order,
      flowOutputMode: jobFlowOutputMode,
      sceneOutputMode: outputMode,
      hybridIntroVideoSceneCount,
    },
  });
  context.emit?.({
    type: "workflow-progress",
    jobId: job?.id || context.job?.id || "",
    phase: "flow-submit",
    message: `장면 ${scene.order} Google Flow 생성 요청을 준비하는 중입니다.`,
    details: {
      sceneOrder: scene.order,
      flowOutputMode: jobFlowOutputMode,
      sceneOutputMode: outputMode,
      hybridIntroVideoSceneCount,
      phase: "hybrid-scene-render",
    },
  });
  let media;
  try {
    media = await generateGoogleFlowVideoFromPrompt({
      prompt,
      jobDir,
      sceneOrder: scene.order,
      chromePath: context.chromePath,
      profileDir: context.paths?.flowProfileDir,
      outputMode,
      aspectRatio: job?.options?.aspectRatio || "9:16",
      timeoutMs: context.flowTimeoutMs,
      safeFallbackPrompt: fallback.prompt,
      ingredientImagePaths: job?.options?.characterSheet?.referenceImagePaths || [],
      flowPacer: context.flowPacer,
      jobId: job?.id || context.job?.id || "",
      onProgress: ({ message, details } = {}) => {
        const isFlowModeMismatch = details?.eventType === "flow-mode-mismatch";
        const isFlowHardFailure = details?.eventType === "flow-abnormal-activity"
          || details?.failureCode === "FLOW_ABNORMAL_ACTIVITY"
          || details?.failureCode === "FLOW_RATE_LIMITED"
          || details?.actionRequired === true;
        const enrichedDetails = {
          ...details,
          flowOutputMode: jobFlowOutputMode,
          sceneOutputMode: outputMode,
          hybridIntroVideoSceneCount,
          sceneOrder: scene.order,
        };
        context.emit?.({
          type: details?.eventType === "flow-policy-warning" || isFlowModeMismatch || isFlowHardFailure ? "workflow-warning" : "workflow-progress",
          status: isFlowModeMismatch || isFlowHardFailure ? "failed" : undefined,
          jobId: job?.id || context.job?.id || "",
          phase: details?.eventType || "flow-progress",
          message: isFlowModeMismatch ? `Google Flow output mode mismatch: ${message}` : message,
          details: enrichedDetails,
        });
        context.onFlowProgress?.({ message, details: enrichedDetails });
      },
    });
  } catch (error) {
    return handleFlowImageSceneFailure({ error, outputMode, scene, job, jobDir, context: mediaContext, jobFlowOutputMode, hybridIntroVideoSceneCount });
  }
  if (outputMode === "image") {
    const renderPath = join(jobDir, `scene_${scene.order}.mp4`);
    const motion = chooseSceneMotionPreset({
      renderEffectPreset: job?.options?.renderEffectPreset || "cinematic",
      motionIntensity: job?.options?.motionIntensity || "light",
      order: scene.order,
      section: scene.section,
      visualCategory: scene.visual_category,
      jobId: job?.id || "",
    });
    context.emit?.({
      type: "workflow-progress",
      jobId: job?.id || context.job?.id || "",
      phase: "render",
      message: `장면 ${scene.order} Flow 이미지를 움직이는 영상 클립으로 변환하는 중입니다.`,
      details: {
        sceneOrder: scene.order,
        flowOutputMode: jobFlowOutputMode,
        sceneOutputMode: "image",
        hybridIntroVideoSceneCount,
        renderEffectPreset: job?.options?.renderEffectPreset || "cinematic",
        motionIntensity: job?.options?.motionIntensity || "light",
        motionPreset: motion.name,
        motionAxis: motion.axis,
        motionDirection: motion.direction,
        motionEnergy: motion.energy,
        motionZoomType: motion.zoomType,
        phase: "flow-image-motion-render",
      },
    });
    try {
      const rendered = await renderImageSceneClip({
        ffmpegBin: mediaContext.ffmpegBin,
        imagePath: media.path,
        outputPath: renderPath,
        durationSeconds: scene.duration_seconds || 8,
        motionPreset: motion.name,
        motionStrength: job?.options?.motionIntensity || "light",
        jobDir,
      });
      return {
        path: renderPath,
        originalPath: media.path,
        bytes: media.bytes,
        contentType: "video/mp4",
        sourceContentType: media.contentType,
        flowOutputMode: "image",
        sceneOutputMode: "image",
        motionPreset: rendered.motionPreset,
        motionAxis: motion.axis,
        motionDirection: motion.direction,
        motionEnergy: motion.energy,
        motionZoomType: motion.zoomType,
      };
    } catch (error) {
      context.emit?.({
        type: "workflow-progress",
        status: "failed",
        jobId: job?.id || context.job?.id || "",
        phase: "render",
        message: `Flow image scene render failed: ${error.message}`,
        details: {
          sceneOrder: scene.order,
          flowOutputMode: jobFlowOutputMode,
          sceneOutputMode: "image",
          hybridIntroVideoSceneCount,
          renderEffectPreset: job?.options?.renderEffectPreset || "cinematic",
          motionPreset: motion.name,
          motionAxis: motion.axis,
          motionDirection: motion.direction,
          motionEnergy: motion.energy,
          motionZoomType: motion.zoomType,
          imagePath: media.path,
        },
      });
      throw error;
    }
  }
  const rawVideoPath = join(jobDir, `scene_${scene.order}_flow_raw.${mediaExtension(media.contentType, media.path)}`);
  const renderPath = join(jobDir, `scene_${scene.order}.mp4`);
  context.emit?.({
    type: "workflow-progress",
    jobId: job?.id || context.job?.id || "",
    phase: "render",
    message: `Scene ${scene.order} Flow video media is being prepared for final render.`,
    details: {
      sceneOrder: scene.order,
      flowOutputMode: jobFlowOutputMode,
      sceneOutputMode: "video",
      hybridIntroVideoSceneCount,
      phase: "flow-video-normalize",
    },
  });
  if (media.path !== rawVideoPath) await copyFile(media.path, rawVideoPath);
  const jobAspectRatio = job?.options?.aspectRatio || "9:16";
  const normalized = normalizeSceneVideoClip({
    ffmpegBin: mediaContext.ffmpegBin,
    inputPath: rawVideoPath,
    outputPath: renderPath,
    durationSeconds: scene.duration_seconds || 8,
    aspectRatio: jobAspectRatio,
  });
  return {
    path: renderPath,
    originalPath: media.path,
    rawPath: rawVideoPath,
    bytes: media.bytes,
    contentType: "video/mp4",
    sourceContentType: media.contentType,
    flowOutputMode: outputMode,
    sceneOutputMode: outputMode,
    normalizedDurationSeconds: normalized.durationSeconds,
    aspectRatio: jobAspectRatio,
    normalizedWidth: normalized.width,
    normalizedHeight: normalized.height,
  };
}

async function handleFlowImageSceneFailure({
  error,
  outputMode,
  scene,
  job,
  jobDir,
  context,
  jobFlowOutputMode,
  hybridIntroVideoSceneCount,
}) {
  const message = error?.message || String(error || "");
  if (error?.failureCode === "FLOW_RATE_LIMITED" || /FLOW_RATE_LIMITED/i.test(message)) {
    const failure = new Error(message);
    Object.assign(failure, {
      failureCode: "FLOW_RATE_LIMITED",
      actionRequired: true,
      retryAfterMs: error?.retryAfterMs,
      nextAllowedAt: error?.nextAllowedAt,
      details: {
        ...(error?.details || {}),
        failureCode: "FLOW_RATE_LIMITED",
        actionRequired: true,
        sceneOrder: scene.order,
        flowOutputMode: jobFlowOutputMode,
        sceneOutputMode: outputMode,
      },
    });
    throw failure;
  }
  const recoverableImageFailure = outputMode === "image" && (
    /no-new-image-url|Flow did not expose a new image URL|flow-submit-did-not-start|Google Flow did not start generation/i.test(message)
  );
  if (!recoverableImageFailure) throw error;

  const allowLiveImagePlaceholderFallback = Boolean(
    context.allowLiveImagePlaceholderFallback
    || job?.options?.mockMediaMode
    || context.job?.options?.mockMediaMode
    || context.mockMediaMode
  );
  if (!allowLiveImagePlaceholderFallback) {
    const failure = new Error(`FLOW_IMAGE_SUBMIT_DID_NOT_START: Scene ${scene.order} Flow image generation stayed idle after submit. Screenshot or retry diagnostics are available in the job folder.`);
    Object.assign(failure, {
      failureCode: "FLOW_IMAGE_SUBMIT_DID_NOT_START",
      actionRequired: true,
      details: {
      sceneOrder: scene.order,
      flowOutputMode: jobFlowOutputMode,
      sceneOutputMode: outputMode,
      originalError: message,
      },
    });
    throw failure;
  }

  context.emit?.({
    type: "workflow-warning",
    status: "recovered",
    jobId: job?.id || context.job?.id || "",
    phase: "flow-image-local-fallback",
    message: `Scene ${scene.order} Flow image generation did not expose media; using local image-motion fallback.`,
    details: {
      sceneOrder: scene.order,
      flowOutputMode: jobFlowOutputMode,
      sceneOutputMode: outputMode,
      hybridIntroVideoSceneCount,
      failureCode: "FLOW_IMAGE_NO_MEDIA_LOCAL_FALLBACK",
      originalError: message,
    },
  });
  const fallbackStatePath = join(jobDir, `scene_${scene.order}_flow_image_local_fallback.json`);
  await writeFile(fallbackStatePath, JSON.stringify({
    ok: true,
    reason: "FLOW_IMAGE_NO_MEDIA_LOCAL_FALLBACK",
    failureCode: "FLOW_IMAGE_LOCAL_PLACEHOLDER",
    placeholder: true,
    productionSafe: false,
    sceneOrder: scene.order,
    outputMode,
    flowOutputMode: jobFlowOutputMode,
    hybridIntroVideoSceneCount,
    originalError: message,
    fallback: "generateMockMedia",
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  return generateMockMedia({ scene, jobDir }, context);
}

function mediaExtension(contentType = "", path = "") {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("quicktime")) return "mov";
  const match = String(path).match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1] || "mp4";
}

function tailText(value = "", max = 4000) {
  const text = String(value || "");
  return text.length > max ? text.slice(-max) : text;
}

function formatExitStatus(status) {
  if (typeof status !== "number") return "null";
  const unsigned = status >>> 0;
  return `${status} / 0x${unsigned.toString(16).toUpperCase()}`;
}

function throwSpawnFailure(label, result, ffmpegBin, args) {
  if (result.status === 0 && !result.error) return;
  throw new Error(`${label} failed
ffmpeg=${ffmpegBin}
status=${formatExitStatus(result.status)}
signal=${result.signal ?? "null"}
spawnError=${result.error?.message || ""}
errorCode=${result.error?.code || ""}
args=${args.join(" ")}
STDOUT_TAIL:
${tailText(result.stdout)}
STDERR_TAIL:
${tailText(result.stderr)}`);
}

function isUsableDirectory(path = "") {
  if (!path || !existsSync(path)) return false;
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function resolveSpawnCwd(context = {}, ffmpegBin = "") {
  const candidates = [
    context.paths?.runtimeRoot,
    context.paths?.resourcesRoot,
    context.paths?.unpackedRoot,
    context.paths?.outputDir,
    context.paths?.userData,
    dirname(ffmpegBin),
    process.cwd(),
  ].filter(Boolean);
  return candidates.find(isUsableDirectory) || process.cwd();
}

export async function generateMockMedia({ scene, jobDir }, context = {}) {
  const ffmpegBin = resolveFfmpegBin(context.ffmpegBin);
  if (!ffmpegBin) {
    throw new Error("ffmpegBin is required for Mock Media Mode and no executable ffmpeg candidate was found.");
  }
  const outputMode = isImageSceneMode(scene) ? "image" : "video";
  const outputPath = join(jobDir, `scene_${scene.order}.mp4`);
  const colors = ["0f766e", "334155", "7c2d12", "4338ca", "166534", "9f1239"];
  const color = colors[(Number(scene.order || 1) - 1) % colors.length];
  const duration = Math.max(4, Number(scene.duration_seconds || 8));
  
  const jobAspectRatio = context.job?.options?.aspectRatio || "9:16";
  const is169 = jobAspectRatio === "16:9";
  const spawnCwd = resolveSpawnCwd(context, ffmpegBin);

  if (outputMode === "image") {
    const stillPath = join(jobDir, `scene_${scene.order}_flow.png`);
    const size = is169 ? "1920x1080" : "1080x1920";
    const box = is169 ? "drawbox=x=144:y=81:w=1632:h=918:color=black@0.28:t=fill" : "drawbox=x=81:y=144:w=918:h=390:color=black@0.28:t=fill";
    
    const stillArgs = [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=0x${color}:s=${size}:d=1:r=1`,
      "-vf", box,
      "-frames:v", "1",
      stillPath,
    ];
    const stillResult = spawnSync(ffmpegBin, stillArgs, {
      cwd: spawnCwd,
      encoding: "utf8",
      maxBuffer: 40 * 1024 * 1024,
      windowsHide: true,
    });
    throwSpawnFailure("Mock image generation", stillResult, ffmpegBin, stillArgs);

    const motion = chooseSceneMotionPreset({
      renderEffectPreset: context.job?.options?.renderEffectPreset || "cinematic",
      motionIntensity: context.job?.options?.motionIntensity || "light",
      order: scene.order,
      section: scene.section,
      visualCategory: scene.visual_category,
      jobId: context.job?.id || "",
    });
    const rendered = await renderImageSceneClip({
      ffmpegBin,
      imagePath: stillPath,
      outputPath,
      durationSeconds: duration,
      motionPreset: motion.name,
      motionStrength: context.job?.options?.motionIntensity || "light",
      jobDir,
    });
    return {
      path: outputPath,
      originalPath: stillPath,
      bytes: 0,
      contentType: "video/mp4",
      sourceContentType: "image/png",
      flowOutputMode: "image",
      sceneOutputMode: "image",
      motionPreset: rendered.motionPreset,
      motionAxis: motion.axis,
      motionDirection: motion.direction,
      motionEnergy: motion.energy,
      motionZoomType: motion.zoomType,
      motionStrategy: rendered.motionStrategy,
      aspectRatio: jobAspectRatio,
    };
  }

  const size = is169 ? "1280x720" : "720x1280";
  const box = is169 ? "drawbox=x=96:y=54:w=1088:h=612:color=black@0.28:t=fill" : "drawbox=x=54:y=96:w=612:h=260:color=black@0.28:t=fill";

  const videoArgs = [
    "-y",
    "-f", "lavfi",
    "-i", `color=c=0x${color}:s=${size}:d=${duration}:r=30`,
    "-vf", box,
    "-an",
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "veryfast",
    "-crf", "22",
    outputPath,
  ];
  const result = spawnSync(ffmpegBin, videoArgs, {
    cwd: spawnCwd,
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
    windowsHide: true,
  });
  throwSpawnFailure("Mock video generation", result, ffmpegBin, videoArgs);
  return {
    path: outputPath,
    contentType: "video/mp4",
    flowOutputMode: "video",
    sceneOutputMode: "video",
    aspectRatio: jobAspectRatio,
  };
}

function isImageSceneMode(scene = {}) {
  return String(scene.outputMode || scene.flowOutputMode || "").toLowerCase() === "image";
}

export async function renderFinalVideo(job, assets, context = {}) {
  context.emit?.({
    type: "workflow-progress",
    jobId: job.id,
    phase: "render",
    message: "TTS 음성, 자막, 최종 영상을 렌더링하는 중입니다.",
    details: { jobDir: assets?.jobDir },
  });
  const result = await renderFinalYouTubeVideo(job, assets, context);
  const finalOutputQa = analyzeYouTubeOutput(result.jobDir || assets?.jobDir);
  context.emit?.({
    type: finalOutputQa.ok ? "workflow-progress" : "workflow-warning",
    jobId: job.id,
    phase: "render",
    message: finalOutputQa.ok
      ? "Final output QA passed."
      : "Final output QA found issues.",
    details: {
      finalOutputQa,
      failureCodes: finalOutputQa.failureCodes,
      visualCategoryDistribution: finalOutputQa.details?.visualCategoryDistribution || {},
      durationDrift: finalOutputQa.details?.durationDrift || null,
    },
  });
  if (!finalOutputQa.ok) {
    throw new Error(`Final output QA failed: ${finalOutputQa.failureCodes.join(", ")}`);
  }
  return result;
}

export async function generateThumbnail(result, context = {}) {
  const chromePath = context.chromePath || findChromeExecutable();
  return createThumbnailForJob({
    draft: result.assets?.draft,
    paths: context.paths,
    flowProfileDir: context.paths?.flowProfileDir,
    jobDir: result.assets?.jobDir,
    chromePath,
    flowTimeoutMs: context.flowTimeoutMs,
    aspectRatio: result.job?.options?.aspectRatio || context.job?.options?.aspectRatio || "9:16",
    thumbnailOverlay: result.job?.options?.thumbnailOverlay || context.job?.options?.thumbnailOverlay || {},
    stylePresetId: result.job?.options?.stylePresetId || context.job?.options?.stylePresetId || "",
    stylePreset: result.job?.options?.stylePreset || context.job?.options?.stylePreset || {},
    emit: context.emit,
  });
}
