import { sanitizeFlowPrompt } from "./flow-prompt-safety.mjs";

const CHAPTERS = [
  { id: "cold_open", label: "Cold open", ratio: 0.09 },
  { id: "context", label: "Context", ratio: 0.18 },
  { id: "deep_dive", label: "Deep dive", ratio: 0.44 },
  { id: "examples", label: "Examples", ratio: 0.17 },
  { id: "takeaway", label: "Takeaway", ratio: 0.12 },
];

export function isLongformJob(job = {}) {
  return job?.options?.videoFormat === "longform" || Number(job?.options?.customDurationSeconds || 0) >= 600;
}

export function planLongformScenesFromDraft({
  job = {},
  draft = {},
  stylePreset = {},
  characterSheet = {},
} = {}) {
  const options = job.options || {};
  const aspectRatio = options.aspectRatio === "16:9" ? "16:9" : "9:16";
  const targetSeconds = Number(options.longformTargetSeconds || options.customDurationSeconds || draft.duration_seconds || 720);
  const introSeconds = Math.max(30, Math.min(90, Number(options.introVideoSeconds || 60)));
  const introCount = Math.max(1, Math.min(10, Math.round(Number(options.introVideoClipCount || options.hybridIntroVideoSceneCount || 10))));
  const bodyImageSeconds = Math.max(10, Math.min(30, Number(options.bodyImageSeconds || 18)));
  const bodySeconds = Math.max(0, targetSeconds - introSeconds);
  const bodyCount = Math.max(1, Math.ceil(bodySeconds / bodyImageSeconds));
  const sceneCount = introCount + bodyCount;
  const units = splitNarrationUnits(draft);
  const groups = proportionalGroups(units, sceneCount);
  const introDuration = Math.max(4, Math.min(10, Math.round(introSeconds / introCount)));
  const scenes = [];

  for (let index = 0; index < sceneCount; index += 1) {
    const order = index + 1;
    const outputMode = order <= introCount ? "video" : "image";
    const chapter = chapterForIndex(index, sceneCount);
    const narration = groups[index]?.join(" ") || units[index % units.length] || draft.title || "Longform scene";
    const duration = outputMode === "video"
      ? introDuration
      : Math.max(10, Math.min(30, Math.round(bodySeconds / bodyCount)));
    const prompt = buildLongformPrompt({
      title: draft.title,
      narration,
      order,
      chapter,
      outputMode,
      stylePreset,
      characterSheet,
      aspectRatio,
    });
    const safe = sanitizeFlowPrompt(prompt, {
      title: draft.title,
      sceneOrder: order,
      visualCategory: chapter.id,
    });
    scenes.push({
      order,
      section: chapter.id,
      chapter: chapter.id,
      visual_category: chapter.id,
      outputMode,
      flowOutputMode: outputMode,
      narration,
      duration_seconds: duration,
      image_prompt: safe.prompt,
      flow_prompt_safety: safe,
    });
  }
  return scenes;
}

export function buildLongformMediaPlan({ job = {}, draft = {} } = {}) {
  const visualScenes = Array.isArray(draft.scenes) ? draft.scenes.map((scene) => ({
    order: scene.order,
    chapter: scene.chapter || scene.section || "",
    outputMode: scene.outputMode || scene.flowOutputMode || "image",
    duration_seconds: scene.duration_seconds,
    narration: scene.narration,
    image_prompt: scene.image_prompt,
  })) : [];
  return {
    videoFormat: "longform",
    targetSeconds: Number(job.options?.longformTargetSeconds || job.options?.customDurationSeconds || draft.duration_seconds || 720),
    introVideoClipCount: visualScenes.filter((scene) => scene.outputMode === "video").length,
    bodyVisualMode: job.options?.bodyVisualMode || "image",
    bodyImageSeconds: Number(job.options?.bodyImageSeconds || 18),
    aspectRatio: job.options?.aspectRatio || "9:16",
    chapters: CHAPTERS.map((chapter) => ({ id: chapter.id, label: chapter.label })),
    narrationSegments: visualScenes.map((scene) => ({
      order: scene.order,
      chapter: scene.chapter,
      text: scene.narration,
      target_seconds: scene.duration_seconds,
    })),
    visualScenes,
    createdAt: new Date().toISOString(),
  };
}

function splitNarrationUnits(draft = {}) {
  const text = [
    draft.script,
    ...Object.values(draft.hpsl || {}).map((section) => section?.narration || ""),
  ].filter(Boolean).join(" ");
  const normalized = String(text || draft.title || "").replace(/\s+/g, " ").trim();
  const sentences = normalized.match(/[^.!?\n]+[.!?]?/g)?.map((item) => item.trim()).filter(Boolean) || [];
  return sentences.length ? sentences : [normalized].filter(Boolean);
}

function proportionalGroups(items = [], count = 1) {
  const safeItems = items.length ? items : ["Longform scene"];
  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor((index * safeItems.length) / count);
    const end = Math.floor(((index + 1) * safeItems.length) / count);
    return safeItems.slice(start, Math.max(start + 1, end));
  });
}

function chapterForIndex(index, total) {
  const position = (index + 0.5) / Math.max(1, total);
  let cursor = 0;
  for (const chapter of CHAPTERS) {
    cursor += chapter.ratio;
    if (position <= cursor) return chapter;
  }
  return CHAPTERS[CHAPTERS.length - 1];
}

function buildLongformPrompt({ title, narration, order, chapter, outputMode, stylePreset = {}, characterSheet = {}, aspectRatio = "9:16" }) {
  const modeLine = outputMode === "video"
    ? "Output mode: video. Generate a short cinematic motion shot with one clear visible action."
    : "Output mode: image. Generate one strong still image that Hermes can animate later with slow pan or zoom.";
  const chapterGuide = {
    cold_open: "Make the opening immediately curious and visually concrete.",
    context: "Show the place, period, source context, and why the event matters.",
    deep_dive: "Show cause and effect, mechanisms, comparisons, and concrete details.",
    examples: "Show practical examples, analogies, and before/after contrasts.",
    takeaway: "Show a clean visual metaphor for the lesson or caution.",
  }[chapter.id] || "Make the narration visually clear.";
  const character = characterSheet?.profileText
    ? `Character sheet: ${characterSheet.profileText}. Keep identity, age, outfit, and role consistent if a person appears.`
    : "Prefer objects, environments, demonstrations, maps, machinery, and visual metaphors over a presenter.";
  return [
    aspectRatio === "16:9" ? "16:9 horizontal cinematic YouTube longform documentary B-roll." : "9:16 vertical cinematic YouTube longform documentary B-roll.",
    `Scene ${order}. Chapter: ${chapter.label}.`,
    `Title: ${title || "Longform video"}.`,
    `Narration context: ${narration}`,
    chapterGuide,
    "Do not show a person simply reading narration.",
    "Use visible action, period-appropriate setting, object close-ups, process visuals, or symbolic B-roll.",
    modeLine,
    stylePreset?.promptSuffix || "Style: polished documentary realism, natural cinematic lighting, clear subject focus.",
    character,
    "No subtitles, no readable text, no logos, no watermarks.",
  ].filter(Boolean).join(" ");
}
