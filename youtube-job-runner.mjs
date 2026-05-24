import { normalizeYouTubeJobRequest } from "./youtube-job-schema.mjs";

function notImplementedStage(name) {
  return async () => {
    throw new Error(`${name} is not wired yet. Pass a ${name} implementation in the runner context.`);
  };
}

async function getWorkflowStage(stageName, context) {
  if (typeof context[stageName] === "function") return context[stageName];
  const workflow = await import("./youtube-workflow.mjs");
  return workflow[stageName] || notImplementedStage(stageName);
}

export async function runYouTubeJob(input, context = {}) {
  const job = normalizeYouTubeJobRequest(input);
  const emit = context.emit || (() => {});
  const sendIntermediateMedia = Boolean(job.options.sendIntermediateMedia);

  emit({ type: "job-started", job, sendIntermediateMedia });

  const generateYouTubeWorkflowAssets = await getWorkflowStage("generateYouTubeWorkflowAssets", context);
  const renderFinalYouTubeVideo = await getWorkflowStage("renderFinalYouTubeVideo", context);

  const assets = await generateYouTubeWorkflowAssets(job, { ...context, emit, sendIntermediateMedia });
  emit({ type: "assets-ready", jobId: job.id, assets, sendIntermediateMedia });

  const finalVideo = await renderFinalYouTubeVideo(job, assets, { ...context, emit, sendIntermediateMedia });
  emit({ type: "job-completed", jobId: job.id, finalVideo, sendIntermediateMedia });

  return { job, assets, finalVideo };
}
