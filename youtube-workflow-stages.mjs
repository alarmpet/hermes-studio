import { spawnSync } from "node:child_process";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import { fallbackDraftFromJob, generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "./youtube-workflow.mjs";
import { buildGeminiResearchDraft } from "./automation/gemini-research-draft.mjs";
import { generateGoogleFlowVideoFromPrompt } from "./automation/google-flow-media.mjs";
import { createThumbnailForJob } from "./pipeline/youtube-thumbnail.mjs";

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

  const prompt = scene.image_prompt;
  context.emit?.({
    type: "workflow-progress",
    jobId: job?.id || context.job?.id || "",
    phase: "flow-submit",
    message: `장면 ${scene.order} Google Flow 생성 요청을 준비하는 중입니다.`,
    details: { sceneOrder: scene.order },
  });
  const media = await generateGoogleFlowVideoFromPrompt({
    prompt,
    jobDir,
    sceneOrder: scene.order,
    chromePath: context.chromePath,
    profileDir: context.paths?.flowProfileDir,
    timeoutMs: context.flowTimeoutMs,
    onProgress: context.onFlowProgress,
  });
  const renderPath = join(jobDir, `scene_${scene.order}.${mediaExtension(media.contentType, media.path)}`);
  if (media.path !== renderPath) await copyFile(media.path, renderPath);
  return { path: renderPath, originalPath: media.path, bytes: media.bytes, contentType: media.contentType };
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
  return renderFinalYouTubeVideo(job, assets, context);
}

export async function generateThumbnail(result, context = {}) {
  return createThumbnailForJob({
    draft: result.assets?.draft,
    paths: context.paths,
    jobDir: result.assets?.jobDir,
  });
}
