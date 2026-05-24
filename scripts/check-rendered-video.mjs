#!/usr/bin/env node

import { statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getMediaDuration, getSrtEndTime } from "./media-probe.mjs";

function usage() {
  return "Usage: node .\\scripts\\check-rendered-video.mjs <final.mp4> [subtitles.srt]";
}

function assertOk(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const finalPath = process.argv[2] ? resolve(process.argv[2]) : "";
if (!finalPath) {
  throw new Error(`Missing final video path.\n${usage()}`);
}

const srtPath = process.argv[3] ? resolve(process.argv[3]) : resolve(dirname(finalPath), "subtitles-ko.srt");
const finalDuration = getMediaDuration(finalPath);
const subtitleEnd = getSrtEndTime(srtPath);
const size = statSync(finalPath).size;

assertOk(size > 1_000_000, `Final video is too small: ${size} bytes`);
assertOk(finalDuration > 1, `Final video duration is invalid: ${finalDuration}`);
assertOk(subtitleEnd <= finalDuration + 0.5, `Subtitle ends after video: subtitle=${subtitleEnd}s video=${finalDuration}s`);

console.log(JSON.stringify({
  ok: true,
  finalPath,
  finalDuration,
  subtitleEnd,
  size,
}, null, 2));
