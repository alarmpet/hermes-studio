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
      image_prompt: buildVisualStoryPrompt({
        title,
        narration: scene.narration,
        order: scene.order,
        characterProfile,
      }),
    };
  });

  const diff = totalDuration - allocatedSeconds;
  if (diff !== 0 && scenes.length > 0) {
    const last = scenes[scenes.length - 1];
    last.duration_seconds = Math.max(4, last.duration_seconds + diff);
  }

  return scenes;
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

function buildVisualStoryPrompt({ title, narration, order, characterProfile }) {
  const visual = inferVisualKeywords({ title, narration });
  const environment = visual.environments[(order - 1) % visual.environments.length];
  const variation = sceneVariation({ order, narration });
  return [
    "9:16 cinematic YouTube shorts B-roll scene.",
    `Visual goal: make this narration instantly understandable without showing subtitles or text: ${narration}`,
    `Main subject: ${visual.subject}.`,
    `Action: ${environment}.`,
    `Scene keywords: ${variation.keywords}.`,
    `Variation: ${variation.emphasis}.`,
    `Context keywords: ${title}; ${visual.motifs}.`,
    "Camera: dynamic close-up to medium shot, smooth handheld or dolly motion, clear subject focus, polished realistic lighting.",
    characterProfile ? `Character consistency: if a recurring human is needed, use ${characterProfile}; otherwise prioritize objects, environments, demonstrations, and visual metaphors over a talking presenter.` : "",
    "No talking head, avoid a person simply speaking to camera, no presenter reading the script.",
    "No subtitles, no readable text, no logos, no watermarks.",
  ].filter(Boolean).join(" ");
}
