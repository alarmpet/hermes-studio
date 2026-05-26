import { spawnSync } from "node:child_process";
import { resolveFfmpegBin } from "./ffmpeg-bin-resolver.mjs";

function tailText(text = "", limit = 2200) {
  const value = String(text || "");
  return value.length > limit ? value.slice(-limit) : value;
}

function buildZoomPanExpression({ motionPreset, frameCount }) {
  const progress = `min(on/${frameCount},1)`;
  const presets = {
    "slow-zoom-in": `zoompan=z='min(1.0+0.12*${progress},1.12)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30`,
    "slow-pan-left": `zoompan=z='1.10':x='iw*0.06-(iw*0.10)*${progress}':y='ih*0.02':d=1:s=1080x1920:fps=30`,
    "slow-pan-right": `zoompan=z='1.10':x='iw*0.00+(iw*0.10)*${progress}':y='ih*0.02':d=1:s=1080x1920:fps=30`,
    "cinematic-push-in": `zoompan=z='min(1.02+0.18*${progress},1.20)':x='iw/2-(iw/zoom/2)':y='ih*0.08-(ih*0.04)*${progress}':d=1:s=1080x1920:fps=30`,
    "slow-pull-back": `zoompan=z='max(1.18-0.12*${progress},1.06)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30`,
    "diagonal-drift": `zoompan=z='1.14':x='iw*0.02+(iw*0.08)*${progress}':y='ih*0.00+(ih*0.06)*${progress}':d=1:s=1080x1920:fps=30`,
    "tilt-reveal": `zoompan=z='1.12':x='iw/2-(iw/zoom/2)':y='ih*0.12-(ih*0.10)*${progress}':d=1:s=1080x1920:fps=30`,
    "hook-punch-zoom": `zoompan=z='if(lt(${progress},0.18),1.0+0.35*${progress}/0.18,1.35-0.16*(${progress}-0.18)/0.82)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30`,
    "whip-pan-soft": `zoompan=z='1.18':x='iw*0.14-(iw*0.20)*${progress}':y='ih*0.03':d=1:s=1080x1920:fps=30`,
    "fast-push-in": `zoompan=z='min(1.0+0.24*${progress},1.24)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1080x1920:fps=30`,
    "snap-drift": `zoompan=z='1.16':x='iw*0.03+(iw*0.14)*${progress}':y='ih*0.02':d=1:s=1080x1920:fps=30`,
  };
  return presets[motionPreset] || presets["slow-zoom-in"];
}

export function renderImageSceneClip({
  ffmpegBin,
  imagePath,
  outputPath,
  durationSeconds = 8,
  motionPreset = "slow-zoom-in",
}) {
  const resolvedFfmpegBin = resolveFfmpegBin(ffmpegBin);
  if (!resolvedFfmpegBin) throw new Error("ffmpegBin is required for image scene rendering.");
  if (!imagePath) throw new Error("imagePath is required for image scene rendering.");
  if (!outputPath) throw new Error("outputPath is required for image scene rendering.");

  const duration = Math.max(3, Math.min(30, Number(durationSeconds || 8)));
  const frameCount = Math.max(90, Math.round(duration * 30));
  const fadeOutStart = Math.max(0, duration - 0.25).toFixed(2);
  const scaleAndCrop = "scale=1296:2304:force_original_aspect_ratio=increase,crop=1296:2304";
  const zoomExpr = buildZoomPanExpression({ motionPreset, frameCount });

  const args = [
    "-y",
    "-loop", "1",
    "-t", String(duration),
    "-i", imagePath,
    "-vf", `${scaleAndCrop},${zoomExpr},fps=30,format=yuv420p,fade=t=in:st=0:d=0.15,fade=t=out:st=${fadeOutStart}:d=0.25`,
    "-an",
    "-r", "30",
    "-threads", "0",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-pix_fmt", "yuv420p",
    outputPath,
  ];
  const result = spawnSync(resolvedFfmpegBin, args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 8 });

  if (result.status !== 0) {
    const stderrTail = tailText(result.stderr);
    const stdoutTail = tailText(result.stdout);
    throw new Error(`Image scene render failed: code=${result.status}\nffmpeg=${resolvedFfmpegBin}\nargs=${args.join(" ")}\nSTDOUT_TAIL:\n${stdoutTail}\nSTDERR_TAIL:\n${stderrTail}`);
  }
  return { path: outputPath, durationSeconds: duration, motionPreset, ffmpegBin: resolvedFfmpegBin };
}
