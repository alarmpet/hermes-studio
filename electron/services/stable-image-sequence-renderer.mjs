import { copyFileSync, existsSync, linkSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { resolveFfmpegBin } from "./ffmpeg-bin-resolver.mjs";

const OUTPUT_WIDTH = 1080;
const OUTPUT_HEIGHT = 1920;
const DEFAULT_CANVAS_WIDTH = 1440;
const DEFAULT_CANVAS_HEIGHT = 2560;

function tailText(text = "", limit = 2200) {
  const value = String(text || "");
  return value.length > limit ? value.slice(-limit) : value;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function easeInOut(t) {
  const value = clamp(Number(t || 0), 0, 1);
  return value < 0.5 ? 2 * value * value : 1 - ((-2 * value + 2) ** 2) / 2;
}

function finiteNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveMotionStepPolicy({ fps, motionStrength } = {}) {
  const parsedFps = finiteNumber(fps, 30);
  const normalizedFps = clamp(Math.round(parsedFps), 24, 60);
  const strength = String(motionStrength || "light").toLowerCase();
  const normalizedStrength = ["none", "light", "medium", "strong"].includes(strength) ? strength : "light";
  const framesPerMotionStep = normalizedStrength === "none"
    ? normalizedFps
    : normalizedStrength === "light"
      ? 2
      : 1;
  return {
    fps: normalizedFps,
    motionStrength: normalizedStrength,
    framesPerMotionStep,
  };
}

function motionScale(strength) {
  if (strength === "strong") return 1.9;
  if (strength === "medium") return 1.35;
  if (strength === "none") return 0;
  return 1;
}

function presetEndpoints({ motionPreset, motionStrength }) {
  const preset = String(motionPreset || "slow-zoom-in").toLowerCase();
  const scale = motionScale(motionStrength);
  const center = { x0: 0.5, x1: 0.5, y0: 0.5, y1: 0.5 };
  if (scale === 0 || preset === "none") return { ...center, z0: 1, z1: 1 };

  const pan = 0.09 * scale;
  const tilt = 0.07 * scale;
  const zoomSmall = 0.045 * scale;
  const zoomMedium = 0.07 * scale;
  switch (preset) {
    case "slow-pan-left":
      return { x0: 0.5 + pan, x1: 0.5 - pan, y0: 0.5, y1: 0.5, z0: 1 + zoomSmall, z1: 1 + zoomSmall };
    case "slow-pan-right":
      return { x0: 0.5 - pan, x1: 0.5 + pan, y0: 0.5, y1: 0.5, z0: 1 + zoomSmall, z1: 1 + zoomSmall };
    case "slow-pan-up":
      return { x0: 0.5, x1: 0.5, y0: 0.5 - tilt, y1: 0.5 + tilt, z0: 1 + zoomSmall, z1: 1 + zoomSmall };
    case "slow-pan-down":
      return { x0: 0.5, x1: 0.5, y0: 0.5 + tilt, y1: 0.5 - tilt, z0: 1 + zoomSmall, z1: 1 + zoomSmall };
    case "diagonal-drift-up-left":
      return { x0: 0.5 + pan * 0.75, x1: 0.5 - pan * 0.75, y0: 0.5 + tilt * 0.75, y1: 0.5 - tilt * 0.75, z0: 1 + zoomMedium, z1: 1 + zoomMedium };
    case "diagonal-drift-up-right":
      return { x0: 0.5 - pan * 0.75, x1: 0.5 + pan * 0.75, y0: 0.5 + tilt * 0.75, y1: 0.5 - tilt * 0.75, z0: 1 + zoomMedium, z1: 1 + zoomMedium };
    case "diagonal-drift-down-left":
      return { x0: 0.5 + pan * 0.75, x1: 0.5 - pan * 0.75, y0: 0.5 - tilt * 0.75, y1: 0.5 + tilt * 0.75, z0: 1 + zoomMedium, z1: 1 + zoomMedium };
    case "diagonal-drift-down-right":
      return { x0: 0.5 - pan * 0.75, x1: 0.5 + pan * 0.75, y0: 0.5 - tilt * 0.75, y1: 0.5 + tilt * 0.75, z0: 1 + zoomMedium, z1: 1 + zoomMedium };
    case "diagonal-drift":
      return { x0: 0.5 - pan * 0.75, x1: 0.5 + pan * 0.75, y0: 0.5 - tilt * 0.75, y1: 0.5 + tilt * 0.75, z0: 1 + zoomMedium, z1: 1 + zoomMedium };
    case "tilt-reveal":
      return { x0: 0.5, x1: 0.5, y0: 0.5 + tilt, y1: 0.5 - tilt, z0: 1 + zoomSmall, z1: 1 + zoomSmall };
    case "slow-pull-back":
      return { ...center, z0: 1 + zoomMedium, z1: 1 + zoomSmall * 0.45 };
    case "fast-push-in":
      return { ...center, z0: 1, z1: 1 + zoomMedium * 1.4 };
    case "fast-pan-left":
      return { x0: 0.5 + pan * 1.5, x1: 0.5 - pan * 1.5, y0: 0.5, y1: 0.5, z0: 1 + zoomMedium, z1: 1 + zoomMedium };
    case "fast-pan-right":
      return { x0: 0.5 - pan * 1.5, x1: 0.5 + pan * 1.5, y0: 0.5, y1: 0.5, z0: 1 + zoomMedium, z1: 1 + zoomMedium };
    case "whip-pan-soft":
      return { x0: 0.5 - pan * 1.8, x1: 0.5 + pan * 1.8, y0: 0.5, y1: 0.5, z0: 1 + zoomSmall, z1: 1 + zoomSmall };
    case "snap-drift":
      return { x0: 0.5 - pan * 1.3, x1: 0.5 + pan * 1.3, y0: 0.5 - tilt * 1.3, y1: 0.5 + tilt * 1.3, z0: 1 + zoomMedium, z1: 1 + zoomMedium };
    case "hook-punch-zoom":
      return { ...center, z0: 1, z1: 1 + zoomMedium * 1.8 };
    case "cinematic-push-in":
      return { ...center, z0: 1, z1: 1 + zoomMedium };
    case "slow-zoom-in":
    default:
      return { ...center, z0: 1, z1: 1 + zoomMedium };
  }
}

function monotonicRound(value, previous, direction) {
  const rounded = Math.round(value);
  if (!Number.isFinite(previous) || direction === 0) return rounded;
  return direction > 0 ? Math.max(previous, rounded) : Math.min(previous, rounded);
}

export function buildStableCameraPath({
  frameCount,
  width,
  height,
  outputWidth = OUTPUT_WIDTH,
  outputHeight = OUTPUT_HEIGHT,
  motionPreset = "slow-zoom-in",
  motionStrength = "light",
  framesPerMotionStep = 1,
} = {}) {
  const totalFrames = Math.max(1, Math.round(finiteNumber(frameCount, 1)));
  const step = Math.max(1, Math.round(finiteNumber(framesPerMotionStep, 1)));
  const uniqueFrameCount = Math.max(1, Math.ceil(totalFrames / step));
  const endpoints = presetEndpoints({ motionPreset, motionStrength });
  const rawPoints = [];

  for (let uniqueIndex = 0; uniqueIndex < uniqueFrameCount; uniqueIndex += 1) {
    const progress = uniqueFrameCount === 1 ? 0 : uniqueIndex / (uniqueFrameCount - 1);
    const eased = easeInOut(progress);
    const zoom = endpoints.z0 + (endpoints.z1 - endpoints.z0) * eased;
    const cropWidth = clamp(Math.round(outputWidth / zoom), 1, Math.min(width, outputWidth));
    const cropHeight = clamp(Math.round(outputHeight / zoom), 1, Math.min(height, outputHeight));
    const centerX = endpoints.x0 + (endpoints.x1 - endpoints.x0) * eased;
    const centerY = endpoints.y0 + (endpoints.y1 - endpoints.y0) * eased;
    rawPoints.push({
      uniqueIndex,
      progress: Number(progress.toFixed(6)),
      zoom: Number(zoom.toFixed(6)),
      cropWidth,
      cropHeight,
      rawLeft: clamp((width - cropWidth) * centerX, 0, width - cropWidth),
      rawTop: clamp((height - cropHeight) * centerY, 0, height - cropHeight),
    });
  }

  const xDirection = Math.sign(rawPoints.at(-1).rawLeft - rawPoints[0].rawLeft);
  const yDirection = Math.sign(rawPoints.at(-1).rawTop - rawPoints[0].rawTop);
  let previousLeft;
  let previousTop;
  return rawPoints.map((point) => {
    const left = monotonicRound(point.rawLeft, previousLeft, xDirection);
    const top = monotonicRound(point.rawTop, previousTop, yDirection);
    previousLeft = left;
    previousTop = top;
    return {
      frame: point.uniqueIndex * step,
      sourceFrame: point.uniqueIndex,
      progress: point.progress,
      zoom: point.zoom,
      left: clamp(left, 0, width - point.cropWidth),
      top: clamp(top, 0, height - point.cropHeight),
      cropWidth: point.cropWidth,
      cropHeight: point.cropHeight,
    };
  });
}

function materializeDuplicateFrame(source, target) {
  if (source === target) return "source";
  try {
    linkSync(source, target);
    return "hardlink";
  } catch {
    copyFileSync(source, target);
    return "copy";
  }
}

function runFfmpeg(ffmpegBin, args) {
  const result = spawnSync(ffmpegBin, args, {
    encoding: "utf8",
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Stable image sequence encode failed: code=${result.status}\nffmpeg=${ffmpegBin}\nargs=${args.join(" ")}\nSTDOUT_TAIL:\n${tailText(result.stdout)}\nSTDERR_TAIL:\n${tailText(result.stderr)}`);
  }
}

export async function renderStableImageSequenceClip({
  ffmpegBin,
  imagePath,
  outputPath,
  durationSeconds,
  order,
  motionPreset = "slow-zoom-in",
  motionStrength = "light",
  fps = 30,
  outputWidth = OUTPUT_WIDTH,
  outputHeight = OUTPUT_HEIGHT,
  jobDir,
  keepFrames = false,
} = {}) {
  const resolvedFfmpegBin = resolveFfmpegBin(ffmpegBin);
  if (!resolvedFfmpegBin) throw new Error("ffmpegBin is required for stable image sequence rendering.");
  if (!imagePath) throw new Error("imagePath is required for stable image sequence rendering.");
  if (!outputPath) throw new Error("outputPath is required for stable image sequence rendering.");
  if (!jobDir) throw new Error("jobDir is required for stable image sequence rendering.");

  const duration = Math.max(0.1, finiteNumber(durationSeconds, 8));
  const policy = resolveMotionStepPolicy({ fps, motionStrength });
  const frameCount = Math.max(1, Math.round(duration * policy.fps));
  const uniqueFrameCount = Math.max(1, Math.ceil(frameCount / policy.framesPerMotionStep));
  const cacheDir = join(jobDir, "motion-cache", `scene_${order}`);
  const uniqueDir = join(cacheDir, "unique");
  const sequenceDir = join(cacheDir, "sequence");
  const sequenceManifestPath = join(jobDir, `scene_${order}_motion_manifest.json`);
  const duplicateMethods = new Set();
  const warnings = [];
  let cacheCleaned = false;

  rmSync(cacheDir, { recursive: true, force: true });
  mkdirSync(uniqueDir, { recursive: true });
  mkdirSync(sequenceDir, { recursive: true });

  const normalizedBuffer = await sharp(imagePath)
    .resize(
      Math.round(outputWidth * (DEFAULT_CANVAS_WIDTH / OUTPUT_WIDTH)),
      Math.round(outputHeight * (DEFAULT_CANVAS_HEIGHT / OUTPUT_HEIGHT)),
      { fit: "cover", position: "attention" },
    )
    .jpeg({ quality: 94, chromaSubsampling: "4:4:4" })
    .toBuffer();
  const path = buildStableCameraPath({
    frameCount,
    width: Math.round(outputWidth * (DEFAULT_CANVAS_WIDTH / OUTPUT_WIDTH)),
    height: Math.round(outputHeight * (DEFAULT_CANVAS_HEIGHT / OUTPUT_HEIGHT)),
    outputWidth,
    outputHeight,
    motionPreset,
    motionStrength: policy.motionStrength,
    framesPerMotionStep: policy.framesPerMotionStep,
  });

  try {
    for (let uniqueIndex = 0; uniqueIndex < path.length; uniqueIndex += 1) {
      const camera = path[uniqueIndex];
      const uniquePath = join(uniqueDir, `unique_${String(uniqueIndex + 1).padStart(6, "0")}.jpg`);
      await sharp(normalizedBuffer)
        .extract({
          left: camera.left,
          top: camera.top,
          width: camera.cropWidth,
          height: camera.cropHeight,
        })
        .resize(outputWidth, outputHeight, { fit: "fill", kernel: "lanczos3" })
        .jpeg({ quality: 92, chromaSubsampling: "4:2:0" })
        .toFile(uniquePath);

      const firstFrame = uniqueIndex * policy.framesPerMotionStep;
      const lastFrame = Math.min(frameCount - 1, firstFrame + policy.framesPerMotionStep - 1);
      for (let frame = firstFrame; frame <= lastFrame; frame += 1) {
        const target = join(sequenceDir, `frame_${String(frame + 1).padStart(6, "0")}.jpg`);
        duplicateMethods.add(materializeDuplicateFrame(uniquePath, target));
      }
    }

    runFfmpeg(resolvedFfmpegBin, [
      "-y",
      "-framerate", String(policy.fps),
      "-i", join(sequenceDir, "frame_%06d.jpg"),
      "-t", String(duration),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "18",
      "-pix_fmt", "yuv420p",
      "-r", String(policy.fps),
      "-movflags", "+faststart",
      outputPath,
    ]);
  } finally {
    if (!keepFrames && existsSync(cacheDir)) {
      try {
        rmSync(cacheDir, { recursive: true, force: true });
        cacheCleaned = true;
      } catch (error) {
        warnings.push({
          code: "IMAGE_SEQUENCE_CACHE_CLEANUP_FAILED",
          sceneOrder: Number(order),
          message: String(error.message || error),
        });
      }
    }
  }

  const frameDurationSeconds = Number((frameCount / policy.fps).toFixed(4));
  const audioDurationSeconds = Number(duration.toFixed(4));
  const durationDriftSeconds = Number(Math.abs(frameDurationSeconds - duration).toFixed(4));
  const result = {
    ok: true,
    strategy: "stable-image-sequence",
    motionStrategy: "stable-sequence-ken-burns",
    fps: policy.fps,
    frameCount,
    uniqueFrameCount,
    framesPerMotionStep: policy.framesPerMotionStep,
    duplicateHoldFrames: policy.framesPerMotionStep,
    duplicateMethods: Array.from(duplicateMethods).filter((item) => item !== "source").sort(),
    motionPreset,
    motionStrength: policy.motionStrength,
    sourceImage: basename(imagePath),
    imageSourcePath: imagePath,
    encodedVideo: outputPath,
    outputWidth,
    outputHeight,
    sequenceManifestPath,
    cachePolicy: keepFrames ? "keep-frames" : "cleanup-after-encode",
    cacheCleaned,
    frameDurationSeconds,
    audioDurationSeconds,
    durationDriftSeconds,
    cameraPath: path,
    warnings,
  };
  writeFileSync(sequenceManifestPath, JSON.stringify(result, null, 2), "utf8");
  return result;
}
