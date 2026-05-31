import { sanitizeFlowPrompt } from "./flow-prompt-safety.mjs";
import { outputModeForScene } from "./scene-output-mode-policy.mjs";

const MIN_SCENES = 3;
const MAX_SCENES = 18;
const MAX_LONGFORM_SECONDS = 1200;

export function splitKoreanSentences(script = "") {
  const normalized = String(script).replace(/\s+/g, " ").trim();
  if (!normalized) return [];
  const sentences = [];
  let start = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1] || "";
    if (/[.!?]/.test(char) && (!next || /\s/.test(next))) {
      sentences.push(normalized.slice(start, index + 1).trim());
      start = index + 1;
    }
  }
  const tail = normalized.slice(start).trim();
  if (tail) sentences.push(tail);
  return sentences.filter(Boolean);
}

export function targetSceneCount({ sentenceCount, targetSeconds }) {
  const seconds = Number(targetSeconds || 60);
  const byTime = Math.max(MIN_SCENES, Math.ceil(seconds / 12));
  const bySentence = Math.max(MIN_SCENES, Math.ceil(Number(sentenceCount || 1) / 2));
  return Math.min(MAX_SCENES, Math.max(byTime, bySentence));
}

export function planScenesFromScript({ script, title, targetSeconds, customDurationSeconds, characterProfile, stylePreset, characterSheet, flowOutputMode = "video", hybridIntroVideoSceneCount = 2, aspectRatio = "9:16" }) {
  const totalDuration = Math.max(15, Math.min(MAX_LONGFORM_SECONDS, Number(customDurationSeconds || targetSeconds || 60)));
  const sentences = splitKoreanSentences(script);
  const sourceSentences = sentences.length ? sentences : [String(script || title || "Scene").trim()].filter(Boolean);
  const count = Math.min(sourceSentences.length || 1, targetSceneCount({
    sentenceCount: sourceSentences.length,
    targetSeconds: totalDuration,
  }));
  const tempScenes = [];
  let totalSyllables = 0;

  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index * sourceSentences.length) / count);
    const end = Math.floor(((index + 1) * sourceSentences.length) / count);
    const narration = sourceSentences.slice(start, Math.max(start + 1, end)).join(" ") || sourceSentences[index] || title;
    const syllables = narration.replace(/\s+/g, "").length;
    totalSyllables += syllables;
    tempScenes.push({ order: index + 1, narration, syllables });
  }

  let allocatedSeconds = 0;
  const scenes = tempScenes.map((scene) => {
    let duration = Math.round((scene.syllables / Math.max(1, totalSyllables)) * totalDuration);
    duration = Math.max(4, duration);
    allocatedSeconds += duration;
    const visualCategory = visualCategoryForOrder(scene.order);
    const outputMode = outputModeForScene({
      sceneOrder: scene.order,
      flowOutputMode,
      hybridIntroVideoSceneCount,
    });
    const prompt = buildVisualStoryPrompt({
      title,
      narration: scene.narration,
      order: scene.order,
      visualCategory,
      characterProfile,
      stylePreset,
      characterSheet,
      flowOutputMode: outputMode,
      aspectRatio,
    });
    const safe = finalizeFlowPrompt({ prompt, title, order: scene.order, visualCategory });
    return {
      order: scene.order,
      visual_category: visualCategory,
      outputMode,
      flowOutputMode: outputMode,
      narration: scene.narration,
      duration_seconds: duration,
      ...safe,
    };
  });

  const diff = totalDuration - allocatedSeconds;
  if (diff !== 0 && scenes.length > 0) {
    const last = scenes[scenes.length - 1];
    last.duration_seconds = Math.max(4, last.duration_seconds + diff);
  }

  return scenes;
}

export function planScenesFromHpsl({ title, hpsl = {}, targetSeconds = 60, characterProfile, stylePreset, characterSheet, flowOutputMode = "video", hybridIntroVideoSceneCount = 2, aspectRatio = "9:16" }) {
  const totalDuration = Math.max(15, Math.min(MAX_LONGFORM_SECONDS, Number(targetSeconds || 60)));
  const sectionSeconds = allocateSectionSeconds(hpsl, totalDuration);
  const sections = ["hook", "point", "story", "lesson"];
  const tempScenes = [];

  for (const section of sections) {
    const sectionData = hpsl?.[section] || {};
    const narration = cleanPlannerText(sectionData.narration || title || section);
    const duration = sectionSeconds[section];
    const chunks = chunkSectionNarration(narration, duration, section === "story");
    const durations = allocateChunkDurations(chunks, duration);
    for (let index = 0; index < chunks.length; index += 1) {
      tempScenes.push({
        section,
        sectionGoal: cleanPlannerText(sectionData.goal || defaultSectionGoal(section)),
        narration: chunks[index],
        duration_seconds: durations[index],
      });
    }
  }

  const diff = totalDuration - tempScenes.reduce((sum, scene) => sum + scene.duration_seconds, 0);
  if (diff && tempScenes.length) {
    const last = tempScenes[tempScenes.length - 1];
    last.duration_seconds = Math.max(1, Math.min(10, last.duration_seconds + diff));
  }

  return tempScenes.map((scene, index) => {
    const order = index + 1;
    const visualCategory = visualCategoryForSection(scene.section, order);
    const outputMode = outputModeForScene({
      sceneOrder: order,
      flowOutputMode,
      hybridIntroVideoSceneCount,
    });
    const prompt = buildVisualStoryPrompt({
      title,
      narration: `${scene.sectionGoal}. ${scene.narration}`,
      order,
      visualCategory,
      characterProfile,
      stylePreset,
      characterSheet,
      flowOutputMode: outputMode,
      aspectRatio,
    });
    const safe = finalizeFlowPrompt({ prompt, title, order, visualCategory });
    return {
      order,
      section: scene.section,
      sectionGoal: scene.sectionGoal,
      visual_category: visualCategory,
      outputMode,
      flowOutputMode: outputMode,
      narration: scene.narration,
      duration_seconds: scene.duration_seconds,
      ...safe,
    };
  });
}

function allocateSectionSeconds(hpsl, targetSeconds) {
  const raw = {
    hook: positiveNumber(hpsl?.hook?.target_seconds, 7),
    point: positiveNumber(hpsl?.point?.target_seconds, 13),
    story: positiveNumber(hpsl?.story?.target_seconds, 30),
    lesson: positiveNumber(hpsl?.lesson?.target_seconds, 10),
  };
  const rawSum = Math.max(1, raw.hook + raw.point + raw.story + raw.lesson);
  const minSectionSeconds = targetSeconds >= 30 ? 6 : 4;
  const scaled = {
    hook: Math.max(minSectionSeconds, Math.round((raw.hook / rawSum) * targetSeconds)),
    point: Math.max(minSectionSeconds, Math.round((raw.point / rawSum) * targetSeconds)),
    story: Math.max(minSectionSeconds, Math.round((raw.story / rawSum) * targetSeconds)),
    lesson: minSectionSeconds,
  };
  scaled.lesson = Math.max(minSectionSeconds, targetSeconds - scaled.hook - scaled.point - scaled.story);
  let diff = targetSeconds - scaled.hook - scaled.point - scaled.story - scaled.lesson;
  for (const section of ["story", "point", "hook", "lesson"]) {
    if (!diff) break;
    const room = scaled[section] - minSectionSeconds;
    if (diff < 0 && room > 0) {
      const take = Math.min(room, Math.abs(diff));
      scaled[section] -= take;
      diff += take;
    } else if (diff > 0) {
      scaled[section] += diff;
      diff = 0;
    }
  }
  return scaled;
}

function positiveNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function cleanPlannerText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function chunkSectionNarration(narration, duration, preferSentences) {
  const needed = Math.max(1, Math.ceil(Number(duration || 1) / 10));
  const sentenceChunks = preferSentences ? splitKoreanSentences(narration) : [];
  const baseChunks = sentenceChunks.length >= needed ? sentenceChunks : splitIntoChunks(narration, needed);
  let chunks = baseChunks.map(cleanPlannerText).filter(Boolean);
  while (chunks.length < needed) {
    const longestIndex = chunks.reduce((best, item, index) => (
      item.length > chunks[best].length ? index : best
    ), 0);
    const split = splitIntoChunks(chunks[longestIndex], 2);
    if (split.length < 2) break;
    chunks.splice(longestIndex, 1, ...split);
  }
  return chunks.length ? chunks : [narration];
}

function splitIntoChunks(text, count) {
  const words = cleanPlannerText(text).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  if (words.length <= count) return words;
  const chunks = [];
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index * words.length) / count);
    const end = Math.floor(((index + 1) * words.length) / count);
    chunks.push(words.slice(start, end).join(" "));
  }
  return chunks.filter(Boolean);
}

function allocateChunkDurations(chunks, totalSeconds) {
  const count = Math.max(1, chunks.length);
  const weights = chunks.map((chunk) => Math.max(1, cleanPlannerText(chunk).replace(/\s+/g, "").length));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const durations = weights.map((weight) => Math.max(1, Math.min(10, Math.round((weight / weightSum) * totalSeconds))));
  let diff = totalSeconds - durations.reduce((sum, duration) => sum + duration, 0);
  while (diff !== 0) {
    let changed = false;
    for (let index = durations.length - 1; index >= 0 && diff !== 0; index -= 1) {
      if (diff > 0 && durations[index] < 10) {
        durations[index] += 1;
        diff -= 1;
        changed = true;
      } else if (diff < 0 && durations[index] > 1) {
        durations[index] -= 1;
        diff += 1;
        changed = true;
      }
    }
    if (!changed) break;
  }
  while (diff > 0) {
    durations.push(Math.min(10, diff));
    diff -= Math.min(10, diff);
  }
  if (durations.length > count) {
    const extra = durations.splice(count);
    durations[count - 1] = Math.min(10, durations[count - 1] + extra.reduce((sum, item) => sum + item, 0));
  }
  return durations;
}

function defaultSectionGoal(section) {
  return {
    hook: "Open with curiosity and an immediate visual reason to keep watching",
    point: "Make the core fact or conclusion easy to grasp",
    story: "Explain the context through concrete examples and visual cause-and-effect",
    lesson: "Close with a useful takeaway or caution",
  }[section] || "Make the narration visually clear";
}

function inferVisualKeywords({ title, narration }) {
  const text = `${title} ${narration}`.toLowerCase();
  if (/구글 글래스|google glass|smart glass|스마트.?글래스|ar|증강/.test(text)) {
    return {
      subject: "sleek smart glasses with a subtle heads-up AR display",
      environments: [
        "a worksite technician repairing equipment while a floating manual overlay guides each step",
        "a doctor reviewing patient vitals on a transparent augmented reality interface in a bright clinic",
        "a traveler walking through a city while navigation arrows appear in their field of view",
        "a close-up of a privacy camera indicator light turning on before recording starts",
      ],
      motifs: "transparent interface elements, practical hands-free use, realistic reflections on lenses",
    };
  }
  if (/ai|인공지능|챗gpt|chatgpt|gemini/.test(text)) {
    return {
      subject: "AI tools transforming real work on screens and devices",
      environments: [
        "a newsroom desk where article drafts, charts, and model outputs update rapidly",
        "a designer reviewing AI-generated storyboard frames on a large monitor",
        "a small business owner automating repetitive tasks on a laptop dashboard",
      ],
      motifs: "clean data overlays, fast iteration, human using AI as a tool",
    };
  }
  return {
    subject: "the core object or situation from the narration",
    environments: [
      "a concrete real-world demonstration of the narration idea",
      "a close-up of the key object in use",
      "a before-and-after visual contrast that makes the idea easy to understand",
    ],
    motifs: "clear cause and effect, visible action, simple visual metaphor",
  };
}

function extractSceneKeywords(text = "") {
  return Array.from(new Set(String(text)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => Array.from(item).length >= 2)
    .slice(0, 8)));
}

function sceneVariation({ order, narration }) {
  const keywords = extractSceneKeywords(narration);
  const emphasis = [
    "show cause and effect through visible motion",
    "use a close-up detail shot before revealing the wider situation",
    "contrast the old way and the new way in one continuous shot",
    "show the user interaction from the viewer's point of view",
    "use foreground object movement to lead into the next idea",
    "show a realistic problem being solved on screen without readable text",
  ][(order - 1) % 6];
  return {
    keywords: keywords.join(", "),
    emphasis,
  };
}

function visualCategoryForSection(section, order) {
  const sectionCategories = {
    hook: ["curiosity-object", "surprising-moment"],
    point: ["core-fact-demo", "simple-comparison"],
    story: ["real-world-use-case", "cause-effect-sequence", "risk-or-tension"],
    lesson: ["takeaway-metaphor", "choice-or-balance"],
  };
  const options = sectionCategories[section] || ["real-world-use-case", "cause-effect-sequence", "takeaway-metaphor"];
  return options[(Math.max(1, Number(order || 1)) - 1) % options.length];
}

function visualCategoryForOrder(order) {
  const categories = [
    "curiosity-object",
    "core-fact-demo",
    "real-world-use-case",
    "cause-effect-sequence",
    "takeaway-metaphor",
    "risk-or-tension",
  ];
  return categories[(Math.max(1, Number(order || 1)) - 1) % categories.length];
}

function finalizeFlowPrompt({ prompt, title, order, visualCategory }) {
  const safety = sanitizeFlowPrompt(prompt, { title, sceneOrder: order, visualCategory });
  return {
    image_prompt: safety.prompt,
    flow_prompt_safety: safety,
  };
}

function buildVisualStoryPrompt({ title, narration, order, visualCategory, characterProfile, stylePreset, characterSheet, flowOutputMode = "video", aspectRatio = "9:16" }) {
  const visual = inferVisualKeywords({ title, narration });
  const environment = visual.environments[(order - 1) % visual.environments.length];
  const variation = sceneVariation({ order, narration });
  return [
    aspectRatio === "16:9" ? "16:9 horizontal cinematic YouTube longform B-roll scene." : "9:16 vertical cinematic YouTube shorts B-roll scene.",
    visualCategory ? `Visual category: ${visualCategory}.` : "",
    `Visual goal: make this narration instantly understandable without showing subtitles or text: ${narration}`,
    `Main subject: ${visual.subject}.`,
    `Action: ${environment}.`,
    `Scene keywords: ${variation.keywords}.`,
    `Variation: ${variation.emphasis}.`,
    `Context keywords: ${title}; ${visual.motifs}.`,
    stylePreset?.promptSuffix || "Camera: dynamic close-up to medium shot, smooth handheld or dolly motion, clear subject focus, polished realistic lighting.",
    buildStyleLock(stylePreset, flowOutputMode),
    characterPrompt(characterProfile, characterSheet),
    "No talking head, avoid a person simply speaking to camera, no presenter reading the script.",
    "No subtitles, no readable text, no logos, no watermarks.",
  ].filter(Boolean).join(" ");
}

function buildStyleLock(stylePreset = {}, outputMode = "video") {
  const modeInstruction = outputMode === "image"
    ? "Generate one strong still image that can be animated later with slow pan or zoom."
    : "Generate a short cinematic motion shot with clear subject action.";
  return [
    `GLOBAL STYLE LOCK: ${stylePreset?.aesthetic || "clear cinematic YouTube Shorts visuals"}.`,
    `Output mode: ${outputMode}. ${modeInstruction}`,
    `Character continuity: ${stylePreset?.characterContinuity || "keep the same character identity, age, wardrobe, body type, and visual proportions across every scene"}.`,
    `World continuity: ${stylePreset?.worldContinuity || "keep the same palette, lighting, camera language, and scene design across every scene"}.`,
    `Negative constraints: ${stylePreset?.negativePrompt || "no readable text, no logos, no watermarks, no random character identity changes"}.`,
  ].join(" ");
}

function characterPrompt(characterProfile, characterSheet = {}) {
  const profile = cleanPlannerText(characterSheet?.profileText || characterProfile);
  if (!profile) {
    return "Use objects, environments, demonstrations, and visual metaphors over a talking presenter.";
  }
  return `Character consistency: if a recurring human is needed, use this exact character sheet: ${profile}. Do not change age, gender, ethnicity, hairstyle, outfit, or role between scenes. If reference images are attached in Flow, match the same identity and outfit.`;
}
