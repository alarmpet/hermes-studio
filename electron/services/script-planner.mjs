const MIN_SCENES = 3;
const MAX_SCENES = 18;

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

export function planScenesFromScript({ script, title, targetSeconds, customDurationSeconds, characterProfile }) {
  const totalDuration = Math.max(15, Math.min(600, Number(customDurationSeconds || targetSeconds || 60)));
  const sentences = splitKoreanSentences(script);
  const sourceSentences = sentences.length ? sentences : [String(script || title || "Scene").trim()].filter(Boolean);
  const count = Math.min(sourceSentences.length || 1, targetSceneCount({
    sentenceCount: sourceSentences.length,
    targetSeconds: totalDuration,
  }));
  const perScene = Math.max(1, Math.ceil(sourceSentences.length / count));
  const tempScenes = [];
  let totalSyllables = 0;

  for (let index = 0; index < count; index += 1) {
    const narration = sourceSentences.slice(index * perScene, (index + 1) * perScene).join(" ") || script || title;
    const syllables = narration.replace(/\s+/g, "").length;
    totalSyllables += syllables;
    tempScenes.push({ order: index + 1, narration, syllables });
  }

  let allocatedSeconds = 0;
  const scenes = tempScenes.map((scene) => {
    let duration = Math.round((scene.syllables / Math.max(1, totalSyllables)) * totalDuration);
    duration = Math.max(4, duration);
    allocatedSeconds += duration;
    return {
      order: scene.order,
      narration: scene.narration,
      duration_seconds: duration,
      image_prompt: [
        "9:16 cinematic YouTube shorts scene.",
        `Title: ${title}.`,
        `Narration context: ${scene.narration}.`,
        characterProfile ? `Consistent character: ${characterProfile}.` : "",
        "No subtitles, no readable text, no logos, no watermarks.",
      ].filter(Boolean).join(" "),
    };
  });

  const diff = totalDuration - allocatedSeconds;
  if (diff !== 0 && scenes.length > 0) {
    const last = scenes[scenes.length - 1];
    last.duration_seconds = Math.max(4, last.duration_seconds + diff);
  }

  return scenes;
}
