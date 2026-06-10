import { sanitizeFlowPrompt } from "./flow-prompt-safety.mjs";
import { assignSceneOutputModes } from "./scene-output-mode-policy.mjs";
import {
  SAFE_VIDEO_MAX_SECONDS,
  SAFE_VIDEO_MIN_SECONDS,
  estimateNarrationSeconds,
} from "./direct-script-duration.mjs";

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
  const groups = balancedOpeningGroups({
    units,
    sceneCount,
    introCount,
    speechSpeed: options.speechSpeed || 1,
  });

  const adjustedGroups = groups.map((g) => [...g]);

  for (let index = 0; index < introCount; index += 1) {
    const narrationText = adjustedGroups[index].join(" ");
    const est = estimateNarrationSeconds({ text: narrationText, speechSpeed: options.speechSpeed || 1 });
    const limit = SAFE_VIDEO_MAX_SECONDS;

    if (est > limit && adjustedGroups[index].length > 1) {
      const current = [];
      const leftover = [];
      for (const sentence of adjustedGroups[index]) {
        const testText = [...current, sentence].join(" ");
        if (estimateNarrationSeconds({ text: testText, speechSpeed: options.speechSpeed || 1 }) <= limit || current.length === 0) {
          current.push(sentence);
        } else {
          leftover.push(sentence);
        }
      }
      adjustedGroups[index] = current;
      if (leftover.length > 0 && index + 1 < sceneCount) {
        adjustedGroups[index + 1].unshift(...leftover);
      }
    } else if (est > limit) {
      const textToSplit = narrationText;
      const splitPoint = Math.floor(textToSplit.length * (limit / est));
      let spaceIdx = textToSplit.lastIndexOf(" ", splitPoint);
      if (spaceIdx <= 0) spaceIdx = textToSplit.indexOf(" ", splitPoint);
      const splitIndex = spaceIdx > 0
        ? spaceIdx
        : Math.max(1, Math.min(Array.from(textToSplit).length - 1, splitPoint));
      if (splitIndex > 0) {
        const chars = Array.from(textToSplit);
        const head = chars.slice(0, splitIndex).join("").trim();
        const tail = chars.slice(splitIndex).join("").trim();
        adjustedGroups[index] = [head];
        if (index + 1 < sceneCount) {
          adjustedGroups[index + 1].unshift(tail);
        }
      }
    }
  }

  const introDuration = Math.max(4, Math.min(10, Math.round(introSeconds / introCount)));
  const scenes = [];
  const requestedFlowOutputModeRaw = String(options.flowOutputMode || "auto").toLowerCase();
  const requestedFlowOutputMode = requestedFlowOutputModeRaw === "hybrid" ? "auto" : requestedFlowOutputModeRaw;

  for (let index = 0; index < sceneCount; index += 1) {
    const order = index + 1;
    const provisionalOutputMode = requestedFlowOutputMode === "video"
      ? "video"
      : order <= introCount ? "video" : "image";
    const chapter = chapterForIndex(index, sceneCount);
    const narration = adjustedGroups[index]?.join(" ") || units[index % units.length] || draft.title || "Longform scene";
    const duration = provisionalOutputMode === "video"
      ? introDuration
      : Math.max(10, Math.min(30, Math.round(bodySeconds / bodyCount)));
    scenes.push({
      order,
      section: chapter.id,
      chapter: chapter.id,
      visual_category: chapter.id,
      chapterMeta: chapter,
      narration,
      duration_seconds: duration,
    });
  }

  const resolvedScenes = assignSceneOutputModes({
    scenes,
    flowOutputMode: requestedFlowOutputMode,
    hybridIntroVideoSceneCount: introCount,
    introVideoClipCount: introCount,
    targetSeconds,
    videoFormat: "longform",
    speechSpeed: options.speechSpeed || 1,
  });

  return resolvedScenes.map((scene) => {
    const estimatedNarrationSeconds = estimateNarrationSeconds({ text: scene.narration, speechSpeed: options.speechSpeed || 1 });
    const unsafeVideoNarration = (scene.outputMode || "image") === "video"
      && (estimatedNarrationSeconds < SAFE_VIDEO_MIN_SECONDS || estimatedNarrationSeconds > SAFE_VIDEO_MAX_SECONDS);
    const outputMode = unsafeVideoNarration ? "image" : (scene.outputMode || "image");
    const chapter = scene.chapterMeta || chapterForIndex(Math.max(0, Number(scene.order || 1) - 1), sceneCount);
    const prompt = buildLongformPrompt({
      title: draft.title,
      narration: scene.narration,
      order: scene.order,
      chapter,
      outputMode,
      stylePreset,
      characterSheet,
      aspectRatio,
    });
    const safe = sanitizeFlowPrompt(prompt, {
      title: draft.title,
      sceneOrder: scene.order,
      visualCategory: chapter.id,
    });
    const { chapterMeta, ...sceneWithoutMeta } = scene;
    return {
      ...sceneWithoutMeta,
      outputMode,
      flowOutputMode: outputMode,
      estimatedNarrationSeconds,
      autoRejectedReason: unsafeVideoNarration
        ? `narration unsafe (estimated ${estimatedNarrationSeconds.toFixed(2)}s)`
        : scene.autoRejectedReason,
      image_prompt: safe.prompt,
      flow_prompt_safety: safe,
    };
  });
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
  const script = cleanNarrationText(draft.script);
  const hpslText = cleanNarrationText(Object.values(draft.hpsl || {}).map((section) => section?.narration || "").join(" "));
  const text = mergeUniqueNarrationBlocks([script, hpslText]).join(" ");
  const normalized = String(text || draft.title || "").replace(/\s+/g, " ").trim();
  const sentences = normalized.match(/[^.!?\n]+[.!?]?/g)?.map((item) => item.trim()).filter(Boolean) || [];
  return sentences.length ? sentences : [normalized].filter(Boolean);
}

function mergeUniqueNarrationBlocks(blocks = []) {
  const result = [];
  const compactResult = [];
  for (const block of blocks.map(cleanNarrationText).filter(Boolean)) {
    const compact = compactNarration(block);
    if (!compact) continue;
    const duplicatesExisting = compactResult.some((existing) => (
      existing.includes(compact)
      || compact.includes(existing)
      || narrationSimilarity(existing, compact) >= 0.86
    ));
    if (duplicatesExisting) continue;
    result.push(block);
    compactResult.push(compact);
  }
  return result;
}

function cleanNarrationText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function compactNarration(value = "") {
  return cleanNarrationText(value).replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function narrationSimilarity(left = "", right = "") {
  const a = new Set(String(left).match(/.{1,4}/gu) || []);
  const b = new Set(String(right).match(/.{1,4}/gu) || []);
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) {
    if (b.has(item)) intersection += 1;
  }
  return intersection / Math.max(1, Math.min(a.size, b.size));
}

function balancedOpeningGroups({ units = [], sceneCount = 1, introCount = 1, speechSpeed = 1 } = {}) {
  const safeUnits = units.length ? [...units] : ["Longform scene"];
  const openingCount = Math.max(0, Math.min(introCount, sceneCount));
  if (!openingCount) return proportionalGroups(safeUnits, sceneCount);

  const queue = [...safeUnits];
  const openingGroups = [];
  const minOpeningSeconds = 3.8;
  const maxOpeningSeconds = SAFE_VIDEO_MAX_SECONDS;

  for (let index = 0; index < openingCount; index += 1) {
    const group = [];
    while (queue.length) {
      const candidate = [...group, queue[0]].join(" ");
      const estimated = estimateNarrationSeconds({ text: candidate, speechSpeed });
      if (group.length && estimated > maxOpeningSeconds) break;
      group.push(queue.shift());
      if (estimated >= minOpeningSeconds) break;
    }
    openingGroups.push(group);
  }

  const bodyGroups = proportionalGroups(queue, Math.max(0, sceneCount - openingCount));
  return [...openingGroups, ...bodyGroups];
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
  const character = longformCharacterPrompt({ characterSheet, stylePreset });
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
    longformStickmanGuard(stylePreset),
    character,
    "No subtitles, no readable text, no logos, no watermarks.",
  ].filter(Boolean).join(" ");
}

function isStickmanStylePreset(stylePreset = {}) {
  const text = [
    stylePreset.id,
    stylePreset.label,
    stylePreset.aesthetic,
    stylePreset.promptSuffix,
  ].filter(Boolean).join(" ").toLowerCase();
  return /stickmanplus|stickman|whiteboard-comic|whiteboard/.test(text);
}

function longformStickmanGuard(stylePreset = {}) {
  if (!isStickmanStylePreset(stylePreset)) return "";
  return "Stickman history guard: use symbolic stickman roles and historical props only, no realistic faces, no readable text inside generated media.";
}

function longformCharacterPrompt({ characterSheet = {}, stylePreset = {} } = {}) {
  if (isStickmanStylePreset(stylePreset)) {
    const sheet = String(characterSheet?.profileText || "").replace(/\s+/g, " ").trim();
    return [
      "Character sheet override: ignore realistic presenter instructions and use a consistent round-head stickman cast.",
      "If a user character sheet is present, reinterpret it as simple stickman line-art proportions only.",
      sheet ? "Do not copy realistic age, face, ethnicity, hair, or clothing details from the original sheet." : "",
    ].filter(Boolean).join(" ");
  }
  if (characterSheet?.profileText) {
    return `Character sheet: ${characterSheet.profileText}. Keep identity, age, outfit, and role consistent if a person appears.`;
  }
  return "Prefer objects, environments, demonstrations, maps, machinery, and visual metaphors over a presenter.";
}
