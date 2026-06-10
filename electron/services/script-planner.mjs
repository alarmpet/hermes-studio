import { sanitizeFlowPrompt } from "./flow-prompt-safety.mjs";
import { assignSceneOutputModes, outputModeForScene } from "./scene-output-mode-policy.mjs";

const MIN_SCENES = 3;
const MAX_SCENES = 80;
const MAX_LONGFORM_SECONDS = 1200;
const TARGET_SCENE_SECONDS = 6;
const MAX_SCENE_SECONDS = 8;
const MAX_VIDEO_NARRATION_CHARS = 60;
const MAX_IMAGE_NARRATION_CHARS = 70;
// 이 길이 이하의 완결 문장(마침표/물음표/느낌표로 끝남)은 절대 분할하지 않음
const MAX_SENTENCE_PRESERVE_CHARS = 80;
// 이 길이 이하의 파편은 인접 청크에 흡수
const MIN_FRAGMENT_CHARS = 10;
// 한국어 TTS 실측 기반: 글자당 평균 발화 속도 (공백 제외)
const KO_CHARS_PER_SECOND = 5.0;

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
  // 10초당 1씬 기준 → 씬이 더 잘게 나뉘어 시각적 템포 개선
  const byTime = Math.max(MIN_SCENES, Math.ceil(seconds / TARGET_SCENE_SECONDS));
  const bySentence = Math.max(MIN_SCENES, Math.ceil(Number(sentenceCount || 1) / 2));
  return Math.min(MAX_SCENES, Math.max(byTime, bySentence));
}

export function planScenesFromScript({ script, title, targetSeconds, customDurationSeconds, speechSpeed = 1.0, characterProfile, stylePreset, characterSheet, flowOutputMode = "video", hybridIntroVideoSceneCount = 2, aspectRatio = "9:16" }) {
  const totalDuration = Math.max(15, Math.min(MAX_LONGFORM_SECONDS, Number(customDurationSeconds || targetSeconds || 60)));
  const sentences = splitKoreanSentences(script);
  const sourceSentences = sentences.length ? sentences : [String(script || title || "Scene").trim()].filter(Boolean);
  const plannedCount = targetSceneCount({
    sentenceCount: sourceSentences.length,
    targetSeconds: totalDuration,
  });
  const narrationUnits = expandNarrationUnits(sourceSentences, plannedCount);
  const count = Math.min(narrationUnits.length || 1, plannedCount);
  const tempScenes = [];
  let totalEstimatedSeconds = 0;

  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index * narrationUnits.length) / count);
    const end = Math.floor(((index + 1) * narrationUnits.length) / count);
    const narration = narrationUnits.slice(start, Math.max(start + 1, end)).join(" ") || narrationUnits[index] || title;
    const chars = narration.replace(/\s+/g, "").length;
    // speechSpeed 보정: 빠를수록 짧게, 느릴수록 길게
    const estimatedSeconds = chars / (KO_CHARS_PER_SECOND * Math.max(0.8, Number(speechSpeed || 1.0)));
    totalEstimatedSeconds += estimatedSeconds;
    tempScenes.push({ order: index + 1, narration, chars, estimatedSeconds });
  }

  // totalSyllables/totalEstimatedSeconds base duration allocation
  let allocatedSeconds = 0;
  const preSplitScenes = tempScenes.map((scene) => {
    // TTS 예상 시간 기준으로 duration 배분 (글자수 비례보다 정확)
    let duration = Math.round((scene.estimatedSeconds / Math.max(1, totalEstimatedSeconds)) * totalDuration);
    duration = Math.max(4, Math.min(MAX_SCENE_SECONDS, duration));
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

  const balancedDurations = allocateChunkDurations(
    preSplitScenes.map((scene) => scene.narration),
    totalDuration,
  );
  allocatedSeconds = 0;
  for (let index = 0; index < preSplitScenes.length; index += 1) {
    preSplitScenes[index].duration_seconds = balancedDurations[index] || preSplitScenes[index].duration_seconds;
    allocatedSeconds += preSplitScenes[index].duration_seconds;
  }

  rebalanceSceneDurations(preSplitScenes, totalDuration, 4, MAX_SCENE_SECONDS);

  // sentence-proportional 경로에서도 image 씬 길이 제한 적용
  // (HPSL 경로의 splitLongNarrationScenes와 동일한 역할)
  const splitScenes = splitLongNarrationScenes(preSplitScenes, {
    flowOutputMode,
    hybridIntroVideoSceneCount,
  });

  // 분할 후 order 재정렬, outputMode 재계산, 프롬프트 재생성 및 모션 프리셋 다양성 보장
  let prevMotionPreset = "";
  const resolvedScenes = assignSceneOutputModes({
    scenes: splitScenes.map((scene, index) => ({ ...scene, order: index + 1 })),
    flowOutputMode,
    hybridIntroVideoSceneCount,
    targetSeconds: totalDuration,
    videoFormat: totalDuration >= 600 ? "longform" : "shorts",
  });

  return resolvedScenes.map((scene, index) => {
    const order = index + 1;
    const outputMode = scene.outputMode || "image";
    const prompt = buildVisualStoryPrompt({
      title,
      narration: scene.narration,
      order,
      visualCategory: scene.visual_category,
      characterProfile,
      stylePreset,
      characterSheet,
      flowOutputMode: outputMode,
      aspectRatio,
    });
    const safe = finalizeFlowPrompt({ prompt, title, order, visualCategory: scene.visual_category });
    const motionPreset = pickMotionPreset(order, prevMotionPreset);
    prevMotionPreset = motionPreset;
    return {
      ...scene,
      order,
      outputMode,
      flowOutputMode: outputMode,
      motionPreset,
      ...safe
    };
  });
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

  const splitScenes = splitLongNarrationScenes(tempScenes, {
    flowOutputMode,
    hybridIntroVideoSceneCount,
  });

  rebalanceSceneDurations(splitScenes, totalDuration, 1, MAX_SCENE_SECONDS);

  const resolvedScenes = assignSceneOutputModes({
    scenes: splitScenes.map((scene, index) => ({ ...scene, order: index + 1 })),
    flowOutputMode,
    hybridIntroVideoSceneCount,
    targetSeconds: totalDuration,
    videoFormat: totalDuration >= 600 ? "longform" : "shorts",
  });

  return resolvedScenes.map((scene, index) => {
    const order = index + 1;
    const visualCategory = visualCategoryForSection(scene.section, order);
    const outputMode = scene.outputMode || "image";
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
      autoReason: scene.autoReason,
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

function expandNarrationUnits(sentences = [], targetCount = MIN_SCENES) {
  const cleaned = sentences.map(cleanPlannerText).filter(Boolean);
  if (!cleaned.length) return [];
  if (cleaned.length === 1 && isPreservedCompleteSentence(cleaned[0])) {
    return cleaned;
  }
  const totalChars = cleaned.reduce((sum, sentence) => sum + Math.max(1, compactLength(sentence)), 0);
  const desired = Math.max(cleaned.length, Number(targetCount || cleaned.length));
  const units = [];

  for (const sentence of cleaned) {
    const chars = Math.max(1, compactLength(sentence));
    if (isPreservedCompleteSentence(sentence)) {
      units.push(sentence);
      continue;
    }
    const share = chars / Math.max(1, totalChars);
    const pieceCount = Math.max(1, Math.round(share * desired));
    const maxChars = Math.max(12, Math.ceil(chars / pieceCount));
    units.push(...splitLongUnit(sentence, maxChars).map(cleanPlannerText).filter(Boolean));
  }

  while (units.length < desired) {
    const splittableIndexes = units
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !isPreservedCompleteSentence(item));
    if (!splittableIndexes.length) break;
    const longestIndex = splittableIndexes.reduce((best, current) => (
      compactLength(current.item) > compactLength(best.item) ? current : best
    )).index;
    const longest = units[longestIndex];
    const parts = splitLongUnit(longest, Math.max(12, Math.ceil(compactLength(longest) / 2)));
    if (parts.length < 2) break;
    units.splice(longestIndex, 1, ...parts);
  }

  return absorbTinyFragments(units);
}

function isPreservedCompleteSentence(value = "") {
  const cleaned = cleanPlannerText(value);
  return /[.!?]\s*$/.test(cleaned) && compactLength(cleaned) <= MAX_SENTENCE_PRESERVE_CHARS;
}

function rebalanceSceneDurations(scenes = [], targetSeconds, minSeconds = 1, maxSeconds = MAX_SCENE_SECONDS) {
  if (!scenes.length) return scenes;
  for (const scene of scenes) {
    scene.duration_seconds = Math.max(minSeconds, Math.min(maxSeconds, Math.round(Number(scene.duration_seconds || minSeconds))));
  }

  let diff = Math.round(Number(targetSeconds || 0)) - scenes.reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0);
  while (diff !== 0) {
    let changed = false;
    const indexes = diff > 0
      ? scenes.map((_, index) => index).reverse()
      : scenes.map((_, index) => index);
    for (const index of indexes) {
      if (diff > 0 && scenes[index].duration_seconds < maxSeconds) {
        scenes[index].duration_seconds += 1;
        diff -= 1;
        changed = true;
      } else if (diff < 0 && scenes[index].duration_seconds > minSeconds) {
        scenes[index].duration_seconds -= 1;
        diff += 1;
        changed = true;
      }
      if (diff === 0) break;
    }
    if (!changed) break;
  }
  return scenes;
}

function chunkSectionNarration(narration, duration, preferSentences) {
  const needed = Math.max(1, Math.ceil(Number(duration || 1) / TARGET_SCENE_SECONDS));
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
  while (chunks.length * MAX_SCENE_SECONDS < Number(duration || 1)) {
    const longestIndex = chunks.reduce((best, item, index) => (
      compactLength(item) > compactLength(chunks[best]) ? index : best
    ), 0);
    const split = splitLongUnit(chunks[longestIndex], Math.max(8, Math.ceil(compactLength(chunks[longestIndex]) / 2)));
    if (split.length < 2) break;
    chunks.splice(longestIndex, 1, ...split);
  }
  return chunks.length ? chunks : [narration];
}

function splitLongNarrationScenes(scenes = [], { flowOutputMode = "video", hybridIntroVideoSceneCount = 0 } = {}) {
  const result = [];
  for (const scene of scenes) {
    const nextOrder = result.length + 1;
    const plannedOutputMode = String(flowOutputMode || "").toLowerCase() === "auto"
      ? "video"
      : outputModeForScene({
          sceneOrder: nextOrder,
          flowOutputMode,
          hybridIntroVideoSceneCount,
        });
    const maxChars = plannedOutputMode === "video" ? MAX_VIDEO_NARRATION_CHARS : MAX_IMAGE_NARRATION_CHARS;
    const chunks = splitNarrationByCompactLength(scene.narration, maxChars);
    if (chunks.length <= 1) {
      result.push(scene);
      continue;
    }
    const durations = allocateChunkDurations(chunks, Math.max(chunks.length, Number(scene.duration_seconds || chunks.length)));
    for (let index = 0; index < chunks.length; index += 1) {
      result.push({
        ...scene,
        narration: chunks[index],
        duration_seconds: durations[index] || 1,
        splitFromSection: scene.section,
        splitPart: index + 1,
      });
    }
  }
  return result;
}

function splitNarrationByCompactLength(text = "", maxCompactChars = MAX_IMAGE_NARRATION_CHARS) {
  const cleaned = cleanPlannerText(text);
  if (!cleaned) return [];
  if (compactLength(cleaned) <= maxCompactChars) return [cleaned];

  // 완결 문장(마침표/물음표/느낌표)이고 MAX_SENTENCE_PRESERVE_CHARS 이하면 분할 금지
  if (/[.!?]\s*$/.test(cleaned) && compactLength(cleaned) <= MAX_SENTENCE_PRESERVE_CHARS) {
    return [cleaned];
  }

  const sentences = splitKoreanSentences(cleaned);
  // 문장 경계가 있으면 문장 단위로만 분할 — 개별 문장은 보존
  const units = sentences.length > 1
    ? sentences.map(cleanPlannerText).filter(Boolean)
    : (cleaned.split(/(?<=[,，])\s*/u))
        .flatMap((unit) => splitLongUnit(unit, maxCompactChars))
        .map(cleanPlannerText)
        .filter(Boolean);

  const chunks = [];
  let current = "";
  for (const unit of units) {
    const candidate = current ? `${current} ${unit}` : unit;
    if (current && compactLength(candidate) > maxCompactChars) {
      chunks.push(current);
      current = unit;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);

  // 단일 문장이 maxCompactChars를 초과하지만 MAX_SENTENCE_PRESERVE_CHARS 이하인 경우 보존
  const safeChunks = chunks.flatMap((chunk) => {
    if (compactLength(chunk) <= maxCompactChars) return [chunk];
    if (/[.!?]\s*$/.test(chunk) && compactLength(chunk) <= MAX_SENTENCE_PRESERVE_CHARS) return [chunk];
    return splitLongUnit(chunk, maxCompactChars);
  }).filter(Boolean);

  return absorbTinyFragments(safeChunks);
}

/** 공백 제외 MIN_FRAGMENT_CHARS 이하의 아주 짧은 파편을 인접 청크에 병합 */
function absorbTinyFragments(chunks) {
  if (chunks.length <= 1) return chunks;
  const result = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (compactLength(chunk) <= MIN_FRAGMENT_CHARS && result.length > 0) {
      // 앞쪽 청크에 병합
      result[result.length - 1] = `${result[result.length - 1]} ${chunk}`;
    } else if (compactLength(chunk) <= MIN_FRAGMENT_CHARS && i + 1 < chunks.length) {
      // 첫 번째 청크가 파편이면 다음 청크에 병합
      chunks[i + 1] = `${chunk} ${chunks[i + 1]}`;
    } else {
      result.push(chunk);
    }
  }
  return result;
}

function splitLongUnit(text = "", maxCompactChars = MAX_IMAGE_NARRATION_CHARS) {
  const cleaned = cleanPlannerText(text);
  if (!cleaned || compactLength(cleaned) <= maxCompactChars) return cleaned ? [cleaned] : [];
  const words = cleaned.split(/\s+/u).filter(Boolean);
  if (words.length <= 1) {
    const chars = Array.from(cleaned);
    const chunks = [];
    for (let index = 0; index < chars.length; index += maxCompactChars) {
      chunks.push(chars.slice(index, index + maxCompactChars).join(""));
    }
    return chunks;
  }
  const chunks = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && compactLength(candidate) > maxCompactChars) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function compactLength(text = "") {
  return Array.from(String(text).replace(/\s+/g, "")).length;
}

const MOTION_PRESETS = [
  "diagonal-drift",
  "diagonal-drift-up-left",
  "diagonal-drift-down-right",
  "zoom-in-center",
  "zoom-out-slow"
];

function pickMotionPreset(order, prevPreset) {
  const available = MOTION_PRESETS.filter((p) => p !== prevPreset);
  return available[(order - 1) % available.length];
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

function allocateChunkDurations(chunks, totalSeconds, maxSeconds = MAX_SCENE_SECONDS) {
  const count = Math.max(1, chunks.length);
  const weights = chunks.map((chunk) => Math.max(1, cleanPlannerText(chunk).replace(/\s+/g, "").length));
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const durations = weights.map((weight) => Math.max(1, Math.min(maxSeconds, Math.round((weight / weightSum) * totalSeconds))));
  let diff = totalSeconds - durations.reduce((sum, duration) => sum + duration, 0);
  while (diff !== 0) {
    let changed = false;
    for (let index = durations.length - 1; index >= 0 && diff !== 0; index -= 1) {
      if (diff > 0 && durations[index] < maxSeconds) {
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
    durations.push(Math.min(maxSeconds, diff));
    diff -= Math.min(maxSeconds, diff);
  }
  if (durations.length > count) {
    const extra = durations.splice(count);
    durations[count - 1] = Math.min(maxSeconds, durations[count - 1] + extra.reduce((sum, item) => sum + item, 0));
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
    stickmanHistoryInstruction(stylePreset),
    buildStyleLock(stylePreset, flowOutputMode),
    characterPrompt(characterProfile, characterSheet, stylePreset),
    "No talking head, avoid a person simply speaking to camera, no presenter reading the script.",
    "No subtitles, no readable text, no logos, no watermarks.",
  ].filter(Boolean).join(" ");
}

function isStickmanStylePreset(stylePreset = {}) {
  const haystack = [
    stylePreset.id,
    stylePreset.label,
    stylePreset.aesthetic,
    stylePreset.promptSuffix,
  ].filter(Boolean).join(" ").toLowerCase();
  return /stickmanplus|stickman|whiteboard-comic|whiteboard/.test(haystack);
}

function stickmanHistoryInstruction(stylePreset = {}) {
  if (!isStickmanStylePreset(stylePreset)) return "";
  return [
    "Stickman style override: use symbolic stickman explainer visuals, not realistic presenters.",
    "For history topics, represent people as generic stickman roles: ruler, advisor, soldier, merchant, spy, citizen, historian, messenger.",
    "Use visual metaphors over literal portraits: maps, scrolls, crowns, castles, ships, coins, scales, arrows, timelines, spotlights, magnifying glasses, broken walls, treaty tables.",
    "All signs, placards, books, maps, and boards must be blank or use abstract icon marks only; Hermes subtitles and top-title will provide readable Korean text.",
  ].join(" ");
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

function characterPrompt(characterProfile, characterSheet = {}, stylePreset = {}) {
  if (isStickmanStylePreset(stylePreset)) {
    const sheet = cleanPlannerText(characterSheet?.profileText || "");
    return [
      "Character consistency: ignore realistic human presenter profiles; use the same simplified stickman cast with round white heads, dot eyes, expressive eyebrows, thick black outlines, and consistent proportions.",
      "Use period costumes only as simple symbolic accessories.",
      sheet ? `User character sheet must be interpreted as stickman line-art only: ${sheet}.` : "",
    ].filter(Boolean).join(" ");
  }
  const profile = cleanPlannerText(characterSheet?.profileText || characterProfile);
  if (!profile) {
    return "Use objects, environments, demonstrations, and visual metaphors over a talking presenter.";
  }
  return `Character consistency: if a recurring human is needed, use this exact character sheet: ${profile}. Do not change age, gender, ethnicity, hairstyle, outfit, or role between scenes. If reference images are attached in Flow, match the same identity and outfit.`;
}
