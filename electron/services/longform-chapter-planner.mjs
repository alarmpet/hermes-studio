import { estimateNarrationSeconds } from "./direct-script-duration.mjs";

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function chapterId(index) {
  return `chapter_${String(index + 1).padStart(3, "0")}`;
}

function sceneSeconds(scene = {}, speechSpeed = 1) {
  const explicit = Number(scene.duration_seconds || scene.durationSeconds || 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return Math.max(1, estimateNarrationSeconds({ text: scene.narration || scene.text || "", speechSpeed }));
}

export function buildLongformChapterPlan({ job = {}, draft = {} } = {}) {
  const options = job.options || {};
  const targetSeconds = Math.max(180, Math.round(Number(
    options.longformTargetSeconds || options.customDurationSeconds || draft.duration_seconds || 600,
  )));
  const chapterTargetSeconds = Math.max(60, Math.min(120, Math.round(Number(options.chapterTargetSeconds || 90))));
  const speechSpeed = Number(options.speechSpeed || 1);
  const scenes = Array.isArray(draft.scenes)
    ? draft.scenes.filter((scene) => cleanText(scene.narration || scene.text))
    : [];
  const sourceScenes = scenes.length
    ? scenes
    : [{ order: 1, narration: cleanText(draft.script || draft.title || "Longform chapter"), duration_seconds: targetSeconds }];

  const groups = [];
  let current = [];
  let currentSeconds = 0;

  for (const scene of sourceScenes) {
    const seconds = sceneSeconds(scene, speechSpeed);
    if (current.length > 0 && currentSeconds + seconds > chapterTargetSeconds) {
      groups.push({ scenes: current, estimatedSeconds: currentSeconds });
      current = [];
      currentSeconds = 0;
    }
    current.push(scene);
    currentSeconds += seconds;
  }
  if (current.length) groups.push({ scenes: current, estimatedSeconds: currentSeconds });

  const chapters = [];
  let usedSeconds = 0;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const isLast = index === groups.length - 1;
    const remainingTarget = targetSeconds - usedSeconds;
    const estimatedTarget = Math.round(group.estimatedSeconds || remainingTarget || chapterTargetSeconds);
    const target = isLast
      ? Math.max(30, Math.min(180, estimatedTarget))
      : Math.max(30, Math.min(180, estimatedTarget));
    const id = chapterId(index);
    chapters.push({
      chapterIndex: index + 1,
      chapterId: id,
      title: index === 0 ? "Cold open" : `Chapter ${index + 1}`,
      startSecond: usedSeconds,
      targetSeconds: target,
      narration: group.scenes.map((scene) => cleanText(scene.narration || scene.text)).join(" "),
      sceneOrders: group.scenes.map((scene) => Number(scene.order)).filter((order) => Number.isFinite(order)),
      jobDir: `chapters/${id}`,
      status: "pending",
      finalPath: "",
      failureCode: "",
    });
    usedSeconds += target;
  }

  return {
    ok: true,
    version: 1,
    jobId: job.id || "",
    targetSeconds,
    chapterTargetSeconds,
    chapters,
    createdAt: new Date().toISOString(),
  };
}
