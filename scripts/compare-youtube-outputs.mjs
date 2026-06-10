#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

const [oldDirArg, newDirArg] = process.argv.slice(2);
assert.ok(oldDirArg && newDirArg, "Usage: node scripts/compare-youtube-outputs.mjs <OLD_JOB_DIR> <NEW_JOB_DIR>");

function readJsonIfExists(path, fallback = {}) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8"));
}

function summarize(jobDirArg) {
  const jobDir = resolve(jobDirArg);
  const report = readJsonIfExists(join(jobDir, "render-report-v2.json"));
  const upload = readJsonIfExists(join(jobDir, "youtube-upload-metadata.json"));
  const thumbnail = readJsonIfExists(join(jobDir, "thumbnail-flow-metadata.json"));
  const analysis = analyzeYouTubeOutput(jobDir);
  const scenes = Array.isArray(report.scenes) ? report.scenes : [];
  return {
    jobDir,
    ok: analysis.ok,
    failureCodes: analysis.failureCodes || [],
    finalDuration: Number(report.finalDuration || analysis.details?.finalDuration || 0),
    warningCount: (analysis.details?.qualityWarnings || []).length + (analysis.details?.improvementWarnings || []).length,
    improvementWarningCodes: (analysis.details?.improvementWarnings || []).map((warning) => warning.code),
    fallbackCount: scenes.filter((scene) => scene.strategy === "video-to-image-fallback").length,
    softSlowdownCount: scenes.filter((scene) => scene.strategy === "slowdown-loop").length,
    title: upload.title || "",
    tagCount: Array.isArray(upload.tags) ? upload.tags.length : 0,
    categoryId: upload.categoryId || "",
    thumbnailHeadline: thumbnail.hookHeadline || "",
    styleMode: thumbnail.styleMode || "",
    styleWarning: thumbnail.styleWarning || "",
  };
}

const oldSummary = summarize(oldDirArg);
const newSummary = summarize(newDirArg);
const result = {
  ok: newSummary.ok,
  old: oldSummary,
  new: newSummary,
  delta: {
    duration: Number((newSummary.finalDuration - oldSummary.finalDuration).toFixed(3)),
    fallbackCount: newSummary.fallbackCount - oldSummary.fallbackCount,
    warningCount: newSummary.warningCount - oldSummary.warningCount,
    softSlowdownCount: newSummary.softSlowdownCount - oldSummary.softSlowdownCount,
  },
};

console.log(JSON.stringify(result, null, 2));
process.exitCode = result.ok ? 0 : 1;
