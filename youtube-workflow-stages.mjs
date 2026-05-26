import { spawnSync } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fallbackDraftFromJob, generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "./youtube-workflow.mjs";
import { buildGeminiResearchDraft } from "./automation/gemini-research-draft.mjs";
import { generateGoogleFlowVideoFromPrompt } from "./automation/google-flow-media.mjs";
import { buildFlowSafeFallbackPrompt } from "./electron/services/flow-prompt-safety.mjs";
import { buildDirectScriptDraft } from "./electron/services/direct-script-draft-service.mjs";
import { renderImageSceneClip } from "./electron/services/image-scene-renderer.mjs";
import { normalizeSceneVideoClip } from "./electron/services/scene-video-normalizer.mjs";
import { chooseSceneMotionPreset } from "./electron/services/render-effect-presets.mjs";
import { createThumbnailForJob } from "./pipeline/youtube-thumbnail.mjs";
import { assertDraftQuality, validateDraftQuality } from "./scripts/youtube-draft-quality.mjs";
import { analyzeYouTubeOutput } from "./scripts/analyze-youtube-output.mjs";

export function createDefaultYouTubeStages(context = {}) {
  return {
    generateYouTubeWorkflowAssets,
    renderFinalYouTubeVideo: (job, assets, runnerContext) => renderFinalVideo(job, assets, { ...context, ...runnerContext }),
    buildDraft: (job, runnerContext) => buildResearchDraft(job, { ...context, ...runnerContext }),
    generateSceneMedia: (args, runnerContext) => generateSceneMedia(args, { ...context, ...runnerContext }),
    generateThumbnail: (result, runnerContext) => generateThumbnail(result, { ...context, ...runnerContext }),
  };
}

export async function buildResearchDraft(job, context = {}) {
  if (job?.sourceType === "script") {
    const draft = buildDirectScriptDraft(job);
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
      ? "Gemini에서 URL 자료를 확인하는 중입니다."
      : "Gemini에서 키워드 자료를 확인하는 중입니다.",
  });
  const draft = await buildGeminiResearchDraft(job, context);
  const qaPreview = validateDraftQuality({ draft, job, stage: "research" });
  if (!qaPreview.ok) {
    throw new Error(`Draft QA failed: ${qaPreview.reason}`);
  }
  const qa = assertDraftQuality({ draft, job, stage: "research" });
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
    phase: "draft",
    message: `대본 생성 완료: 장면 ${draft.scenes?.length || 0}개`,
    details: { title: draft.title, sceneCount: draft.scenes?.length || 0 },
  });
  return draft;
}

export async function generateSceneMedia({ job, scene, jobDir }, context = {}) {
  if (job?.options?.mockMediaMode || context.job?.options?.mockMediaMode || context.mockMediaMode) {
    return generateMockMedia({ scene, jobDir }, context);
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
  const media = await generateGoogleFlowVideoFromPrompt({
    prompt,
    jobDir,
    sceneOrder: scene.order,
    chromePath: context.chromePath,
    profileDir: context.paths?.flowProfileDir,
    outputMode,
    timeoutMs: context.flowTimeoutMs,
    safeFallbackPrompt: fallback.prompt,
    ingredientImagePaths: job?.options?.characterSheet?.referenceImagePaths || [],
    onProgress: ({ message, details } = {}) => {
      const isFlowModeMismatch = details?.eventType === "flow-mode-mismatch";
      const enrichedDetails = {
        ...details,
        flowOutputMode: jobFlowOutputMode,
        sceneOutputMode: outputMode,
        hybridIntroVideoSceneCount,
        sceneOrder: scene.order,
      };
      context.emit?.({
        type: details?.eventType === "flow-policy-warning" || isFlowModeMismatch ? "workflow-warning" : "workflow-progress",
        status: isFlowModeMismatch ? "failed" : undefined,
        jobId: job?.id || context.job?.id || "",
        phase: details?.eventType || "flow-progress",
        message: isFlowModeMismatch ? `Google Flow output mode mismatch: ${message}` : message,
        details: enrichedDetails,
      });
      context.onFlowProgress?.({ message, details: enrichedDetails });
    },
  });
  if (outputMode === "image") {
    const renderPath = join(jobDir, `scene_${scene.order}.mp4`);
    const motion = chooseSceneMotionPreset({
      renderEffectPreset: job?.options?.renderEffectPreset || "cinematic",
      order: scene.order,
      section: scene.section,
      visualCategory: scene.visual_category,
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
        motionPreset: motion.name,
        phase: "flow-image-motion-render",
      },
    });
    try {
      const rendered = renderImageSceneClip({
        ffmpegBin: context.ffmpegBin,
        imagePath: media.path,
        outputPath: renderPath,
        durationSeconds: scene.duration_seconds || 8,
        motionPreset: motion.name,
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
  const normalized = normalizeSceneVideoClip({
    ffmpegBin: context.ffmpegBin,
    inputPath: rawVideoPath,
    outputPath: renderPath,
    durationSeconds: scene.duration_seconds || 8,
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
  };
}

function mediaExtension(contentType = "", path = "") {
  if (contentType.includes("webm")) return "webm";
  if (contentType.includes("mp4")) return "mp4";
  if (contentType.includes("quicktime")) return "mov";
  const match = String(path).match(/\.([a-z0-9]{2,5})$/i);
  return match?.[1] || "mp4";
}

export async function generateMockMedia({ scene, jobDir }, context = {}) {
  const ffmpegBin = context.ffmpegBin;
  if (!ffmpegBin) throw new Error("ffmpegBin is required for Mock Media Mode.");
  const outputPath = join(jobDir, `scene_${scene.order}.mp4`);
  const colors = ["0f766e", "334155", "7c2d12", "4338ca", "166534", "9f1239"];
  const color = colors[(Number(scene.order || 1) - 1) % colors.length];
  const duration = Math.max(4, Number(scene.duration_seconds || 8));
  const result = spawnSync(ffmpegBin, [
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
  ], {
    cwd: context.paths?.appRoot || process.cwd(),
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Mock video generation failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return { path: outputPath };
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
  return createThumbnailForJob({
    draft: result.assets?.draft,
    paths: context.paths,
    jobDir: result.assets?.jobDir,
  });
}
