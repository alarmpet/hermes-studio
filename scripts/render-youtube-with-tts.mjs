#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { getMediaDuration, getSrtEndTime } from "./media-probe.mjs";

const ROOT = "C:/Users/amd/hermes";
const TTS_ROOT = "C:/Users/amd/supertonic3-local-tts-20260517-r4/supertonic3-local-tts";
const PY_TTS = `${TTS_ROOT}/.venv-win/Scripts/python.exe`;
const JOB_DIR = process.argv[2]
  ? resolve(process.argv[2])
  : `${ROOT}/outputs/youtube/1779594807781-8151113796-700001`;
const FINAL_NAME = process.env.HERMES_YOUTUBE_FINAL_NAME || "final-youtube-ai-news-tts-subtitled-v2.mp4";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    encoding: "utf8",
    env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", ...(options.env || {}) },
    maxBuffer: 40 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed\nARGS: ${args.join(" ")}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }
  return result;
}

function ts(seconds) {
  const whole = Math.floor(seconds);
  const ms = Math.round((seconds - whole) * 1000);
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = whole % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
}

function escapeFilterPath(path) {
  return path.replace(/\\/g, "/").replace(/:/g, "\\:").replace(/'/g, "\\'");
}

function wrapSubtitle(text, maxChars = 24) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ");
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 2).join("\n");
}

function fallbackScenes() {
  return [
    { order: 1, narration: "오늘은 최신 AI 뉴스 흐름을 빠르게 정리해보겠습니다." },
    { order: 2, narration: "AI는 챗봇을 넘어 업무 자동화, 영상 제작, 검색, 코딩 도구까지 빠르게 확장되고 있습니다." },
    { order: 3, narration: "기업들은 AI를 활용해 반복 업무를 줄이고 개인 맞춤형 서비스를 더 정교하게 제공하고 있습니다." },
    { order: 4, narration: "창작 분야에서는 이미지, 영상, 음악, 글쓰기 도구가 연결되며 제작 속도가 크게 빨라지고 있습니다." },
    { order: 5, narration: "하지만 AI가 빨라질수록 저작권, 개인정보, 가짜 정보 문제도 함께 중요해지고 있습니다." },
    { order: 6, narration: "핵심은 AI를 무조건 믿는 것이 아니라 좋은 도구로 다루는 능력입니다." },
  ];
}

function looksLikeCorruptKorean(text) {
  const value = String(text || "");
  if (!value.trim()) return true;
  const hangulCount = (value.match(/[가-힣]/g) || []).length;
  const questionCount = (value.match(/\?/g) || []).length;
  const koreanSignal = hangulCount / Math.max(value.length, 1);
  const mojibakeSignal = /[�李理吏紐留硫利]|[-]/.test(value);
  if (questionCount >= 2) return true;
  return mojibakeSignal || koreanSignal < 0.08;
}

function loadScenes() {
  const draftPath = join(JOB_DIR, "draft.json");
  if (existsSync(draftPath)) {
    const draft = JSON.parse(readFileSync(draftPath, "utf8"));
    if (Array.isArray(draft.scenes) && draft.scenes.length) {
      const scenes = draft.scenes.map((scene, index) => ({
        order: Number(scene.order || index + 1),
        narration: String(scene.narration || scene.text || "").trim(),
      })).filter((scene) => scene.narration);
      if (scenes.length && scenes.every((scene) => !looksLikeCorruptKorean(scene.narration))) {
        return scenes;
      }
      console.warn("draft.json narration looks corrupted; using curated Korean fallback script.");
    }
  }

  return fallbackScenes();
}

function renderSceneVideo({ rawVideo, audioPath, audioDuration, order }) {
  const videoDuration = getMediaDuration(rawVideo);
  const adjustedVideo = join(JOB_DIR, `scene_${order}_video_adjusted.mp4`);
  const finalScene = join(JOB_DIR, `scene_${order}_synced.mp4`);
  const ratio = audioDuration / videoDuration;

  if (ratio >= 0.9 && ratio <= 1.2) {
    const setpts = ratio.toFixed(6);
    run(ffmpegPath, [
      "-y",
      "-i", rawVideo,
      "-an",
      "-vf", `setpts=${setpts}*PTS`,
      "-t", String(audioDuration),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      adjustedVideo,
    ]);
  } else if (audioDuration > videoDuration) {
    const pad = Math.max(0, audioDuration - videoDuration);
    run(ffmpegPath, [
      "-y",
      "-i", rawVideo,
      "-an",
      "-vf", `tpad=stop_mode=clone:stop_duration=${pad.toFixed(3)}`,
      "-t", String(audioDuration),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      adjustedVideo,
    ]);
  } else {
    run(ffmpegPath, [
      "-y",
      "-i", rawVideo,
      "-an",
      "-t", String(audioDuration),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      adjustedVideo,
    ]);
  }

  run(ffmpegPath, [
    "-y",
    "-i", adjustedVideo,
    "-i", audioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "192k",
    "-t", String(audioDuration),
    "-movflags", "+faststart",
    finalScene,
  ]);

  return {
    order,
    finalScene,
    videoDuration,
    audioDuration,
    ratio,
    strategy: ratio >= 0.9 && ratio <= 1.2 ? "setpts" : (audioDuration > videoDuration ? "tpad" : "trim"),
  };
}

mkdirSync(JOB_DIR, { recursive: true });

const scenes = loadScenes();
const scenesPath = join(JOB_DIR, "tts-scenes-input.json");
writeFileSync(scenesPath, JSON.stringify(scenes, null, 2), "utf8");

run(PY_TTS, [join(ROOT, "scripts/make-scenes-tts.py"), JOB_DIR, scenesPath], { cwd: TTS_ROOT });

const manifest = JSON.parse(readFileSync(join(JOB_DIR, "scene_audio_manifest.json"), "utf8"));
if (!manifest.ok || !Array.isArray(manifest.scenes) || !manifest.scenes.length) {
  throw new Error("Scene TTS manifest is invalid.");
}

let cursor = 0;
const srtBlocks = [];
const concatLines = [];
const renderReport = [];

for (const sceneAudio of manifest.scenes) {
  const order = Number(sceneAudio.order);
  const rawVideo = join(JOB_DIR, `scene_${order}.mp4`);
  if (!existsSync(rawVideo)) {
    throw new Error(`Missing scene video: ${rawVideo}`);
  }
  const audioPath = resolve(sceneAudio.audio_path);
  const audioDuration = getMediaDuration(audioPath);
  const rendered = renderSceneVideo({ rawVideo, audioPath, audioDuration, order });
  renderReport.push(rendered);
  concatLines.push(`file '${rendered.finalScene.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`);
  srtBlocks.push(`${srtBlocks.length + 1}\n${ts(cursor)} --> ${ts(cursor + audioDuration)}\n${wrapSubtitle(sceneAudio.text)}\n`);
  cursor += audioDuration;
}

const concatPath = join(JOB_DIR, "concat_synced.txt");
const srtPath = join(JOB_DIR, "subtitles-ko-v2.srt");
const mergedPath = join(JOB_DIR, "merged-scenes-synced.mp4");
const finalPath = join(JOB_DIR, FINAL_NAME);
const reportPath = join(JOB_DIR, "render-report-v2.json");

writeFileSync(concatPath, concatLines.join("\n"), "utf8");
writeFileSync(srtPath, srtBlocks.join("\n"), "utf8");

run(ffmpegPath, [
  "-y",
  "-f", "concat",
  "-safe", "0",
  "-i", concatPath,
  "-c", "copy",
  mergedPath,
]);

const subtitleFilter = `subtitles='${escapeFilterPath(srtPath)}':force_style='FontName=Malgun Gothic,FontSize=18,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Shadow=1,Alignment=2,MarginV=60'`;
run(ffmpegPath, [
  "-y",
  "-i", mergedPath,
  "-vf", subtitleFilter,
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "20",
  "-c:a", "copy",
  "-movflags", "+faststart",
  finalPath,
]);

const finalDuration = getMediaDuration(finalPath);
const subtitleEnd = getSrtEndTime(srtPath);
if (Math.abs(finalDuration - subtitleEnd) > 0.5) {
  throw new Error(`Final duration mismatch: video=${finalDuration}s subtitleEnd=${subtitleEnd}s`);
}

writeFileSync(reportPath, JSON.stringify({
  ok: true,
  jobDir: JOB_DIR,
  finalPath,
  mergedPath,
  srtPath,
  concatPath,
  finalDuration,
  subtitleEnd,
  scenes: renderReport.map((item) => ({
    ...item,
    finalScene: item.finalScene.replace(/\\/g, "/"),
  })),
  source: scenes.map((scene) => ({
    ...scene,
    rawVideo: join(JOB_DIR, `scene_${scene.order}.mp4`).replace(/\\/g, "/"),
    file: basename(join(JOB_DIR, `scene_${scene.order}.mp4`)),
  })),
}, null, 2), "utf8");

console.log(JSON.stringify({
  ok: true,
  jobDir: JOB_DIR,
  finalPath,
  srtPath,
  reportPath,
  finalDuration,
  subtitleEnd,
}, null, 2));
