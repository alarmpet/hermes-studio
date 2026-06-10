import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { copyFile, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { getMediaDuration, getSrtEndTime } from "../../scripts/media-probe.mjs";
import { buildLongformChapterPlan } from "./longform-chapter-planner.mjs";

const CHAPTER_PLAN_FILE = "longform-chapter-plan.json";

export function isChapteredLongformRenderEnabled(job = {}) {
  return job?.options?.videoFormat === "longform" && Boolean(job?.options?.longformChapteredRenderEnabled);
}

export async function createLongformChapterAssets({ job = {}, draft = {}, renderOptions = {}, jobDir = "" } = {}) {
  if (!isChapteredLongformRenderEnabled(job)) return null;
  const existingPlan = await readLongformChapterPlan(jobDir);
  const chapterPlan = reconcileChapterPlan(buildLongformChapterPlan({ job, draft }), existingPlan);
  await writeLongformChapterPlan(jobDir, chapterPlan);
  for (const chapter of chapterPlan.chapters) {
    await writeChapterInputFiles({ job, draft, renderOptions, jobDir, chapter });
  }
  return chapterPlan;
}

export async function syncChapterSceneMedia({ jobDir = "", chapterPlan = null, scene = {}, media = {} } = {}) {
  if (!chapterPlan?.chapters?.length || !media?.path || !existsSync(media.path)) return;
  const chapter = chapterPlan.chapters.find((item) => item.sceneOrders.includes(Number(scene.order)));
  if (!chapter) return;
  const childOrder = chapter.sceneOrders.findIndex((order) => Number(order) === Number(scene.order)) + 1;
  if (childOrder <= 0) return;
  const childDir = join(jobDir, chapter.jobDir);
  await mkdir(childDir, { recursive: true });
  await copyFile(media.path, join(childDir, `scene_${childOrder}.mp4`));
  await copyStillSourceIfPresent({ jobDir, sceneOrder: scene.order, childDir, childOrder });
}

async function copyStillSourceIfPresent({ jobDir, sceneOrder, childDir, childOrder }) {
  for (const ext of ["jpg", "jpeg", "png", "webp"]) {
    const source = join(jobDir, `scene_${sceneOrder}_flow.${ext}`);
    if (existsSync(source)) {
      await copyFile(source, join(childDir, `scene_${childOrder}_flow.${ext}`));
      return;
    }
  }
}

async function writeChapterInputFiles({ job, draft, renderOptions, jobDir, chapter }) {
  const childDir = join(jobDir, chapter.jobDir);
  await mkdir(childDir, { recursive: true });
  const sceneMap = new Map((draft.scenes || []).map((scene) => [Number(scene.order), scene]));
  const childScenes = chapter.sceneOrders
    .map((order, index) => {
      const source = sceneMap.get(Number(order));
      if (!source) return null;
      return {
        ...source,
        parentOrder: source.order,
        order: index + 1,
        outputMode: source.outputMode || source.flowOutputMode || "video",
        flowOutputMode: source.flowOutputMode || source.outputMode || "video",
      };
    })
    .filter(Boolean);
  const childDraft = {
    ...draft,
    title: `${draft.title || "Longform"} - ${chapter.title}`,
    script: chapter.narration,
    duration_seconds: chapter.targetSeconds,
    scenes: childScenes,
  };
  const childJob = {
    ...job,
    id: `${job.id}-${chapter.chapterId}`,
    parentJobId: job.id,
    chapterId: chapter.chapterId,
    options: {
      ...job.options,
      longformChapteredRenderEnabled: false,
      longformTargetSeconds: chapter.targetSeconds,
      customDurationSeconds: chapter.targetSeconds,
    },
  };
  const childRenderOptions = {
    ...renderOptions,
    jobId: childJob.id,
    targetSeconds: chapter.targetSeconds,
    longformChapteredRenderEnabled: false,
    parentJobId: job.id,
    chapterId: chapter.chapterId,
  };
  await writeFile(join(childDir, "job-request.json"), JSON.stringify(childJob, null, 2), "utf8");
  await writeFile(join(childDir, "draft.json"), JSON.stringify(childDraft, null, 2), "utf8");
  await writeFile(join(childDir, "render-options.json"), JSON.stringify(childRenderOptions, null, 2), "utf8");
  await writeFile(join(childDir, "scene-media-manifest.json"), JSON.stringify({
    ok: true,
    version: 1,
    scenes: childScenes.map((scene) => ({
      order: scene.order,
      parentOrder: scene.parentOrder,
      status: "pending",
      path: join(childDir, `scene_${scene.order}.mp4`).replace(/\\/g, "/"),
      sceneOutputMode: scene.outputMode || scene.flowOutputMode || "video",
    })),
  }, null, 2), "utf8");
}

function reconcileChapterPlan(nextPlan, existingPlan) {
  if (!existingPlan?.chapters?.length) return nextPlan;
  const existingById = new Map(existingPlan.chapters.map((chapter) => [chapter.chapterId, chapter]));
  return {
    ...nextPlan,
    createdAt: existingPlan.createdAt || nextPlan.createdAt,
    chapters: nextPlan.chapters.map((chapter) => {
      const existing = existingById.get(chapter.chapterId);
      if (!existing) return chapter;
      const sameScenes = JSON.stringify(existing.sceneOrders || []) === JSON.stringify(chapter.sceneOrders || []);
      if (!sameScenes) return chapter;
      return {
        ...chapter,
        status: existing.status || chapter.status,
        finalPath: existing.finalPath || chapter.finalPath,
        finalDuration: existing.finalDuration,
        subtitleEnd: existing.subtitleEnd,
        failureCode: existing.failureCode || "",
        error: existing.error || "",
        completedAt: existing.completedAt || "",
        failedAt: existing.failedAt || "",
      };
    }),
  };
}

export async function renderChapteredYouTubeVideo({
  job = {},
  assets = {},
  context = {},
  runner,
  scriptPath,
  timeoutMs,
  finalName = "final-youtube-chaptered.mp4",
  runRenderChild,
} = {}) {
  const jobDir = resolve(assets.jobDir || "");
  let chapterPlan = await readLongformChapterPlan(jobDir);
  if (!chapterPlan?.chapters?.length) {
    chapterPlan = buildLongformChapterPlan({ job, draft: assets.draft || {} });
    await writeLongformChapterPlan(jobDir, chapterPlan);
  }
  const runChild = context.runRenderChild || runRenderChild;
  const stitcher = context.stitchChapterVideos || stitchChapterVideos;

  for (const chapter of chapterPlan.chapters) {
    const childDir = join(jobDir, chapter.jobDir);
    if (
      chapter.status === "completed"
      && chapter.finalPath
      && existsSync(chapter.finalPath)
      && existsSync(join(childDir, "subtitles-ko-v2.srt"))
    ) {
      continue;
    }
    chapter.status = "rendering";
    chapter.failureCode = "";
    await writeLongformChapterPlan(jobDir, chapterPlan);
    context.emit?.({
      type: "workflow-progress",
      jobId: job.id,
      phase: "chapter-render",
      message: `Rendering chapter ${chapter.chapterIndex}/${chapterPlan.chapters.length}.`,
      details: { chapterId: chapter.chapterId, chapterDir: childDir },
    });
    try {
      assertChapterSceneInputs({ childDir, chapter });
      const childFinalName = "chapter-final.mp4";
      const output = await runChild({ runner, scriptPath, jobDir: childDir, finalName: childFinalName, timeoutMs, context, job });
      const parsed = parseRenderOutput(output?.stdout);
      const finalPath = parsed.finalPath || join(childDir, childFinalName);
      if (!existsSync(finalPath)) throw new Error(`Chapter final video was not found: ${finalPath}`);
      const report = readJson(join(childDir, "render-report-v2.json"));
      chapter.status = "completed";
      chapter.finalPath = finalPath;
      chapter.finalDuration = Number(report.finalDuration || parsed.finalDuration || getMediaDuration(finalPath) || 0);
      chapter.subtitleEnd = Number(report.subtitleEnd || parsed.subtitleEnd || 0);
      chapter.completedAt = new Date().toISOString();
      await writeFile(join(childDir, "chapter-render-report.json"), JSON.stringify({ ok: true, chapter, render: report || parsed }, null, 2), "utf8");
      await writeLongformChapterPlan(jobDir, chapterPlan);
    } catch (error) {
      chapter.status = "failed";
      chapter.failureCode = error?.failureCode || error?.details?.failureCode || "CHAPTER_RENDER_FAILED";
      chapter.error = error?.message || String(error);
      chapter.failedAt = new Date().toISOString();
      await writeLongformChapterPlan(jobDir, chapterPlan);
      throw error;
    }
  }

  const finalPath = join(jobDir, finalName || "final-youtube-chaptered.mp4");
  const stitch = await stitcher({ job, assets, context, jobDir, chapterPlan, finalPath });
  const report = {
    ok: true,
    jobDir,
    finalPath: stitch.finalPath || finalPath,
    finalDuration: stitch.finalDuration,
    subtitleEnd: stitch.subtitleEnd,
    chapteredRender: true,
    chapterCount: chapterPlan.chapters.length,
    chapters: chapterPlan.chapters,
    chapterStitchManifestPath: join(jobDir, "chapter-stitch-manifest.json"),
  };
  await writeFile(join(jobDir, "render-report-v2.json"), JSON.stringify(report, null, 2), "utf8");
  return report;
}

function assertChapterSceneInputs({ childDir, chapter }) {
  const missing = [];
  for (let index = 0; index < (chapter.sceneOrders || []).length; index += 1) {
    const path = join(childDir, `scene_${index + 1}.mp4`);
    if (!existsSync(path)) missing.push(path);
  }
  if (missing.length) {
    const error = new Error(`CHAPTER_SCENE_MEDIA_MISSING: ${chapter.chapterId} missing ${missing.length} scene media file(s). First: ${missing[0]}`);
    error.failureCode = "CHAPTER_SCENE_MEDIA_MISSING";
    throw error;
  }
}

export async function stitchChapterVideos({ jobDir = "", chapterPlan = {}, finalPath = "" } = {}) {
  const concatPath = join(jobDir, "concat-list.txt");
  const intermediatePath = join(jobDir, "chapter-stitch-intermediate.mp4");
  const chapters = chapterPlan.chapters || [];
  const concatLines = chapters.map((chapter) => {
    const rel = escapeConcatPath(relative(jobDir, chapter.finalPath));
    return `file '${rel}'`;
  });
  await writeFile(concatPath, `${concatLines.join("\n")}\n`, "utf8");
  await mergeChapterSubtitles({ jobDir, chapters });
  await runCommand(ffmpegPath, ["-y", "-f", "concat", "-safe", "0", "-i", concatPath, "-c", "copy", intermediatePath], { cwd: jobDir });
  await runCommand(ffmpegPath, [
    "-y",
    "-i", intermediatePath,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "20",
    "-c:a", "aac",
    "-b:a", "192k",
    "-movflags", "+faststart",
    finalPath,
  ], { cwd: jobDir });
  await unlink(intermediatePath).catch(() => {});
  const finalDuration = getMediaDuration(finalPath);
  const subtitleEnd = getSrtEndTime(join(jobDir, "subtitles-ko-v2.srt"));
  const markers = buildChapterMarkers(chapters);
  await writeFile(join(jobDir, "youtube-chapter-markers.txt"), markers, "utf8");
  await writeFile(join(jobDir, "chapter-stitch-manifest.json"), JSON.stringify({
    ok: true,
    concatPath,
    finalPath,
    finalDuration,
    subtitleEnd,
    markers,
    chapters,
  }, null, 2), "utf8");
  return { finalPath, finalDuration, subtitleEnd };
}

function escapeConcatPath(path = "") {
  return String(path || "")
    .replace(/\\/g, "/")
    .replace(/'/g, "\\'");
}

async function mergeChapterSubtitles({ jobDir, chapters }) {
  const blocks = [];
  let offset = 0;
  let cueIndex = 1;
  for (const chapter of chapters) {
    const srtPath = join(jobDir, chapter.jobDir, "subtitles-ko-v2.srt");
    if (!existsSync(srtPath)) {
      const error = new Error(`CHAPTER_SUBTITLE_MISSING: ${chapter.chapterId} has no subtitles-ko-v2.srt`);
      error.failureCode = "CHAPTER_SUBTITLE_MISSING";
      throw error;
    }
    const parsed = offsetSrt(await readFile(srtPath, "utf8"), offset, cueIndex);
    if (parsed.count <= 0) {
      const error = new Error(`CHAPTER_SUBTITLE_INVALID: ${chapter.chapterId} subtitle file has no cues`);
      error.failureCode = "CHAPTER_SUBTITLE_INVALID";
      throw error;
    }
    blocks.push(...parsed.blocks);
    cueIndex += parsed.count;
    offset += Number(chapter.finalDuration || chapter.targetSeconds || 0);
  }
  await writeFile(join(jobDir, "subtitles-ko-v2.srt"), `${blocks.join("\n\n")}\n`, "utf8");
}

function offsetSrt(text, offsetSeconds, firstIndex) {
  const blocks = String(text || "").split(/\r?\n\r?\n/).map((block) => block.trim()).filter(Boolean);
  let count = 0;
  const shifted = blocks.map((block) => {
    const lines = block.split(/\r?\n/);
    const body = lines.slice(2).join("\n");
    const timeLine = lines.find((line) => line.includes("-->")) || "";
    if (!timeLine || !body.trim()) {
      throw new Error("Invalid SRT cue block");
    }
    const [start, end] = timeLine.split("-->").map((item) => item.trim());
    const startSecond = parseSrtTime(start);
    const endSecond = parseSrtTime(end);
    if (!Number.isFinite(startSecond) || !Number.isFinite(endSecond) || endSecond <= startSecond) {
      throw new Error(`Invalid SRT cue timing: ${timeLine}`);
    }
    count += 1;
    return `${firstIndex + count - 1}\n${formatSrtTime(startSecond + offsetSeconds)} --> ${formatSrtTime(endSecond + offsetSeconds)}\n${body}`;
  });
  return { blocks: shifted, count };
}

function parseSrtTime(value = "00:00:00,000") {
  const match = String(value).match(/(\d+):(\d+):(\d+),(\d+)/);
  if (!match) return NaN;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function formatSrtTime(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  const whole = Math.floor(safe);
  const ms = Math.round((safe - whole) * 1000);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function buildChapterMarkers(chapters = []) {
  let offset = 0;
  return chapters.map((chapter) => {
    const line = `${formatMarkerTime(offset)} ${chapter.title || `Chapter ${chapter.chapterIndex}`}`;
    offset += Number(chapter.finalDuration || chapter.targetSeconds || 0);
    return line;
  }).join("\n");
}

function formatMarkerTime(seconds) {
  const whole = Math.floor(Math.max(0, Number(seconds) || 0));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

async function readLongformChapterPlan(jobDir) {
  const path = join(jobDir, CHAPTER_PLAN_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return null;
  }
}

async function writeLongformChapterPlan(jobDir, plan) {
  await mkdir(jobDir, { recursive: true });
  await writeFile(join(jobDir, CHAPTER_PLAN_FILE), JSON.stringify({ ...plan, updatedAt: new Date().toISOString() }, null, 2), "utf8");
}

function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

function parseRenderOutput(stdout = "") {
  try {
    return JSON.parse(String(stdout || "").trim().match(/\{[\s\S]*\}\s*$/)?.[0] || "{}");
  } catch {
    return {};
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolveCommand, rejectCommand) => {
    const child = spawn(command, args, { cwd: options.cwd || dirname(command), windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", (chunk) => { stdout += chunk; });
    child.stderr?.on("data", (chunk) => { stderr += chunk; });
    child.on("error", rejectCommand);
    child.on("close", (code) => {
      if (code === 0) resolveCommand({ stdout, stderr });
      else rejectCommand(new Error(`${command} failed with exit code ${code}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`));
    });
  });
}
