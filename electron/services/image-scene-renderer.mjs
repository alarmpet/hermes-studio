import { dirname } from "node:path";
import { resolveFfmpegBin } from "./ffmpeg-bin-resolver.mjs";
import { resolveSceneVideoDimensions } from "./scene-video-normalizer.mjs";
import { renderStableImageSequenceClip } from "./stable-image-sequence-renderer.mjs";

export async function renderImageSceneClip({
  ffmpegBin,
  imagePath,
  outputPath,
  durationSeconds = 8,
  motionPreset = "slow-zoom-in",
  motionStrength = "light",
  fps = 30,
  jobDir,
  aspectRatio = "9:16",
}) {
  const resolvedFfmpegBin = resolveFfmpegBin(ffmpegBin);
  if (!resolvedFfmpegBin) throw new Error("ffmpegBin is required for image scene rendering.");
  if (!imagePath) throw new Error("imagePath is required for image scene rendering.");
  if (!outputPath) throw new Error("outputPath is required for image scene rendering.");

  const duration = Math.max(3, Math.min(30, Number(durationSeconds || 8)));
  const dimensions = resolveSceneVideoDimensions(aspectRatio);
  const result = await renderStableImageSequenceClip({
    ffmpegBin: resolvedFfmpegBin,
    imagePath,
    outputPath,
    durationSeconds: duration,
    order: 0,
    motionPreset,
    motionStrength,
    fps,
    jobDir: jobDir || dirname(outputPath),
    outputWidth: dimensions.width,
    outputHeight: dimensions.height,
  });

  return {
    path: outputPath,
    durationSeconds: duration,
    motionPreset,
    motionStrategy: result.motionStrategy,
    fps: result.fps,
    frameCount: result.frameCount,
    uniqueFrameCount: result.uniqueFrameCount,
    framesPerMotionStep: result.framesPerMotionStep,
    sequenceManifestPath: result.sequenceManifestPath,
    ffmpegBin: resolvedFfmpegBin,
    aspectRatio: dimensions.aspectRatio,
    normalizedWidth: dimensions.width,
    normalizedHeight: dimensions.height,
  };
}
