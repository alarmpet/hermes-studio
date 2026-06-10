import { requestOllamaJson } from "./ollama-provider.mjs";

const STORYBOARD_HINT_KEYS = [
  "scene_purpose",
  "visual_subject",
  "camera",
  "mood",
  "motion",
  "negative_prompt",
];

export function buildOllamaStoryboardPrompt({ draft = {}, maxScenes = 24 } = {}) {
  const scenes = Array.isArray(draft.scenes) ? draft.scenes.slice(0, maxScenes) : [];
  const compactScenes = scenes.map((scene, index) => ({
    order: Number(scene?.order || index + 1),
    narration: cleanText(scene?.narration),
    existing_image_prompt: cleanText(scene?.image_prompt || scene?.imagePrompt || scene?.prompt),
  }));

  return [
    "Return JSON only. Do not rewrite the script, narration, durations, or existing image prompts.",
    "Analyze each scene as a director and provide optional visual planning hints only.",
    "Schema: {\"scenes\":[{\"order\":number,\"scene_purpose\":\"string\",\"visual_subject\":\"string\",\"camera\":\"string\",\"mood\":\"string\",\"motion\":\"string\",\"negative_prompt\":\"string\"}]}",
    "Keep hints concise, concrete, and aligned with the Korean narration.",
    "",
    `Title: ${cleanText(draft.title)}`,
    `Script: ${cleanText(draft.script).slice(0, 4000)}`,
    `Scenes: ${JSON.stringify(compactScenes)}`,
  ].join("\n");
}

export function normalizeOllamaStoryboardHints(value = {}) {
  const rawScenes = Array.isArray(value?.scenes) ? value.scenes : [];
  const scenes = rawScenes
    .map((scene) => normalizeHintScene(scene))
    .filter((scene) => scene && STORYBOARD_HINT_KEYS.some((key) => scene[key]));
  return { scenes };
}

export function applyOllamaStoryboardHints({ draft = {}, hints = {} } = {}) {
  const normalizedHints = normalizeOllamaStoryboardHints(hints);
  const hintByOrder = new Map(normalizedHints.scenes.map((scene) => [scene.order, scene]));
  const appliedScenes = Array.isArray(draft.scenes)
    ? draft.scenes.map((scene, index) => {
        const order = Number(scene?.order || index + 1);
        const hint = hintByOrder.get(order);
        if (!hint) return { ...scene };
        return {
          ...scene,
          storyboard_hint: Object.fromEntries(
            STORYBOARD_HINT_KEYS
              .map((key) => [key, hint[key]])
              .filter(([, value]) => Boolean(value)),
          ),
        };
      })
    : [];
  const hintCount = appliedScenes.filter((scene) => scene.storyboard_hint).length;

  return {
    ...draft,
    scenes: appliedScenes,
    ollama_storyboard_assist: {
      applied: hintCount > 0,
      hintCount,
    },
  };
}

export async function runOllamaStoryboardAssist({
  draft = {},
  config = {},
  requestJson = requestOllamaJson,
} = {}) {
  if (!config?.enabled) {
    return {
      draft,
      diagnostics: {
        ok: false,
        skipped: true,
        failureCode: "OLLAMA_DISABLED",
        provider: "ollama",
        taskName: "storyboard",
      },
    };
  }

  const result = await requestJson({
    config,
    taskName: "storyboard",
    schema: storyboardAssistSchema(),
    system: "You are a video storyboard assistant. Return valid JSON only.",
    prompt: buildOllamaStoryboardPrompt({ draft }),
  });

  if (!result?.ok) {
    return {
      draft,
      diagnostics: {
        ok: false,
        provider: "ollama",
        taskName: "storyboard",
        failureCode: result?.failure?.failureCode || "OLLAMA_UNKNOWN_FAILURE",
        message: result?.failure?.message,
        ...(result?.diagnostics || {}),
      },
    };
  }

  const assistedDraft = applyOllamaStoryboardHints({ draft, hints: result.parsed });
  return {
    draft: assistedDraft,
    diagnostics: {
      ok: true,
      provider: "ollama",
      taskName: "storyboard",
      applied: Boolean(assistedDraft.ollama_storyboard_assist?.applied),
      hintCount: assistedDraft.ollama_storyboard_assist?.hintCount || 0,
      ...(result.diagnostics || {}),
    },
  };
}

function storyboardAssistSchema() {
  return {
    type: "object",
    properties: {
      scenes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            order: { type: "number" },
            scene_purpose: { type: "string" },
            visual_subject: { type: "string" },
            camera: { type: "string" },
            mood: { type: "string" },
            motion: { type: "string" },
            negative_prompt: { type: "string" },
          },
          required: ["order"],
        },
      },
    },
    required: ["scenes"],
  };
}

function normalizeHintScene(scene = {}) {
  const order = Number(scene?.order);
  if (!Number.isFinite(order) || order < 1) return null;
  const normalized = { order: Math.round(order) };
  for (const key of STORYBOARD_HINT_KEYS) {
    const text = cleanText(scene[key]).slice(0, 360);
    if (text) normalized[key] = text;
  }
  return normalized;
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}
