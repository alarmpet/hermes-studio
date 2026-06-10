#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { findChromeExecutable } from "../electron/services/browser-profile-service.mjs";
import { createDefaultYouTubeStages } from "../youtube-workflow-stages.mjs";
import { generateYouTubeWorkflowAssets, renderFinalYouTubeVideo } from "../youtube-workflow.mjs";

const root = resolve(import.meta.dirname, "..");
const jobDir = resolve(process.argv[2] || "");
if (!jobDir || !existsSync(jobDir)) {
  throw new Error(`Usage: node scripts/resume-youtube-job-from-assets.mjs <jobDir>. Missing jobDir: ${jobDir}`);
}

const jobPath = join(jobDir, "job-request.json");
const draftPath = join(jobDir, "draft.json");
if (!existsSync(jobPath)) throw new Error(`Missing job-request.json: ${jobPath}`);
if (!existsSync(draftPath)) throw new Error(`Missing draft.json: ${draftPath}`);

const job = JSON.parse(readFileSync(jobPath, "utf8"));
const draft = JSON.parse(readFileSync(draftPath, "utf8"));
const placeholderSceneOrders = (draft.scenes || [])
  .map((scene, index) => Number(scene.order || index + 1))
  .filter((order) => existsSync(join(jobDir, `scene_${order}_flow_image_local_fallback.json`)));
if (placeholderSceneOrders.length) {
  throw new Error(`FLOW_IMAGE_LOCAL_PLACEHOLDER: retry image scenes before final render. retryFlowImageScenes=true sceneOrders=${placeholderSceneOrders.join(",")}`);
}
const outputDir = resolve(jobDir, "..", "..");
const userData = resolve(process.env.APPDATA || "C:/Users/amd/AppData/Roaming", "hermes");
const paths = {
  appRoot: root,
  userData,
  runtimeRoot: userData,
  resourcesRoot: root,
  unpackedRoot: root,
  outputDir,
  flowProfileDir: join(userData, "browser-profiles", "flow-profile"),
  geminiProfileDir: join(userData, "browser-profiles", "gemini-profile"),
  notebooklmProfileDir: join(userData, "browser-profiles", "notebooklm-profile"),
  renderScriptPath: join(root, "scripts", "render-youtube-with-tts.mjs"),
};

const events = [];
const emit = (event) => {
  const item = { ...event, at: new Date().toISOString() };
  events.push(item);
  if (event.type === "workflow-progress" || event.type === "workflow-warning" || event.type === "flow-scene-started" || event.type === "flow-scene-completed") {
    console.log(JSON.stringify({
      type: event.type,
      phase: event.phase || "",
      status: event.status || "",
      sceneOrder: event.scene?.order || event.details?.sceneOrder || "",
      message: event.message || "",
    }));
  }
};

const baseContext = {
  job,
  draft,
  jobDir,
  paths,
  ffmpegBin: ffmpegPath,
  chromePath: findChromeExecutable(),
  renderScriptPath: paths.renderScriptPath,
  finalName: `desktop-resume-flow-${Date.now()}.mp4`,
  emit,
  timeoutMs: 30 * 60 * 1000,
};
const stages = createDefaultYouTubeStages(baseContext);
const assets = await generateYouTubeWorkflowAssets(job, {
  ...baseContext,
  ...stages,
  draft,
  emit,
});
const finalVideo = await renderFinalYouTubeVideo(job, assets, {
  ...baseContext,
  ...stages,
  emit,
});

const report = {
  ok: true,
  jobId: job.id,
  jobDir,
  finalVideo,
  sceneMediaManifestPath: assets.sceneMediaManifestPath,
  sceneMediaCount: assets.sceneMedia?.length || 0,
  finalName: baseContext.finalName,
  events: events.slice(-200),
  updatedAt: new Date().toISOString(),
};
const reportPath = join(jobDir, "resume-final-render-report.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");
console.log(JSON.stringify({ ok: true, reportPath, finalPath: finalVideo.finalPath, jobDir }, null, 2));
