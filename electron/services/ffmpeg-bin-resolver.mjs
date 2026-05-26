import { existsSync } from "node:fs";
import { join } from "node:path";

export function resolveFfmpegBin(candidate = "") {
  const pathEntries = String(process.env.PATH || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
  const pathCandidates = pathEntries.flatMap((entry) => [
    join(entry, "ffmpeg.exe"),
    join(entry, "ffmpeg"),
  ]);
  const candidates = [
    candidate,
    process.env.FFMPEG_PATH,
    process.resourcesPath ? join(process.resourcesPath, "app.asar.unpacked", "node_modules", "ffmpeg-static", "ffmpeg.exe") : "",
    "C:/Users/amd/hermes/node_modules/ffmpeg-static/ffmpeg.exe",
    ...pathCandidates,
    "ffmpeg",
  ].filter(Boolean);
  return candidates.find((item) => item === "ffmpeg" || existsSync(item)) || "";
}
