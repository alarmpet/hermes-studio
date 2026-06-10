import { spawnSync } from "node:child_process";
import { resolveFfmpegBin } from "./ffmpeg-bin-resolver.mjs";

function tailText(text = "", limit = 2200) {
  const value = String(text || "");
  return value.length > limit ? value.slice(-limit) : value;
}

export function resolveSceneVideoDimensions(aspectRatio = "9:16") {
  if (String(aspectRatio) === "16:9") {
    return { width: 1920, height: 1080, aspectRatio: "16:9" };
  }
  return { width: 1080, height: 1920, aspectRatio: "9:16" };
}

export function probeVideoDimensions(inputPath = "", ffmpegBin = "") {
  const resolvedFfmpegBin = resolveFfmpegBin(ffmpegBin);
  if (!resolvedFfmpegBin || !inputPath) return null;
  const result = spawnSync(resolvedFfmpegBin, ["-hide_banner", "-i", inputPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 4,
    windowsHide: true,
  });
  const text = `${result.stdout || ""}\n${result.stderr || ""}`;
  const match = text.match(/Video:[^\n,]*(?:,[^\n,]*)*,\s*(\d{2,5})x(\d{2,5})[\s,]/i)
    || text.match(/,\s*(\d{2,5})x(\d{2,5})[\s,]/i);
  if (!match) return null;
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

export function normalizeSceneVideoClip({
  ffmpegBin,
  inputPath,
  outputPath,
  durationSeconds = 8,
  aspectRatio = "9:16",
}) {
  const resolvedFfmpegBin = resolveFfmpegBin(ffmpegBin);
  if (!resolvedFfmpegBin) throw new Error("ffmpegBin is required for scene video normalization.");
  if (!inputPath) throw new Error("inputPath is required for scene video normalization.");
  if (!outputPath) throw new Error("outputPath is required for scene video normalization.");

  const { width, height } = resolveSceneVideoDimensions(aspectRatio);

  const duration = Math.max(3, Math.min(30, Number(durationSeconds || 8)));
  const fadeOutStart = Math.max(0, duration - 0.25).toFixed(2);
  const videoFilter = [
    `scale=${width}:${height}:force_original_aspect_ratio=increase`,
    `crop=${width}:${height}`,
    "fps=30",
    "setsar=1",
    "setpts=PTS-STARTPTS",
    "format=yuv420p",
    "fade=t=in:st=0:d=0.15",
    `fade=t=out:st=${fadeOutStart}:d=0.25`,
  ].join(",");

  const args = [
    "-y",
    "-i", inputPath,
    "-an",
    "-t", String(duration),
    "-vf", videoFilter,
    "-r", "30",
    "-threads", "0",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    outputPath,
  ];
  const result = spawnSync(resolvedFfmpegBin, args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });

  if (result.status !== 0) {
    throw new Error(`Scene video normalization failed: code=${result.status}\nffmpeg=${resolvedFfmpegBin}\nargs=${args.join(" ")}\nSTDOUT_TAIL:\n${tailText(result.stdout)}\nSTDERR_TAIL:\n${tailText(result.stderr)}`);
  }
  return { path: outputPath, durationSeconds: duration, ffmpegBin: resolvedFfmpegBin, width, height };
}
