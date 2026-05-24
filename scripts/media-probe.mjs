#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ffmpegPath from "ffmpeg-static";

export function getMediaDuration(filePath) {
  const target = resolve(filePath);
  if (!existsSync(target)) {
    throw new Error(`Media file not found: ${target}`);
  }
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-i", target], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const text = `${result.stderr || ""}\n${result.stdout || ""}`;
  const match = text.match(/Duration:\s*(\d{2}):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (!match) {
    throw new Error(`Could not parse media duration for ${target}`);
  }
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

export function getSrtEndTime(filePath) {
  const target = resolve(filePath);
  if (!existsSync(target)) {
    throw new Error(`SRT file not found: ${target}`);
  }
  const text = readFileSync(target, "utf8");
  let end = 0;
  for (const match of text.matchAll(/-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/g)) {
    const seconds = Number(match[1]) * 3600
      + Number(match[2]) * 60
      + Number(match[3])
      + Number(match[4]) / 1000;
    end = Math.max(end, seconds);
  }
  return end;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const target = process.argv[2];
  if (!target) {
    throw new Error("Usage: node .\\scripts\\media-probe.mjs <media-file>");
  }
  console.log(JSON.stringify({ path: resolve(target), duration: getMediaDuration(target) }, null, 2));
}
