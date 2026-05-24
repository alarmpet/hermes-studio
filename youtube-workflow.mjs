const MIN_SCENES = 3;
const DEFAULT_CHARACTER_PROFILE = "same recurring Korean female presenter in her early 30s, shoulder-length black hair, warm professional expression, teal blazer over a white top; keep the same ethnicity, gender, age, hairstyle, face, and outfit across every scene; background people may appear only as secondary blurred extras";

export function extractTargetUrl(text = "") {
  const match = String(text).match(/https?:\/\/[^\s<>"')]+/i);
  if (!match) return "";
  return match[0].replace(/[.,!?;:]+$/u, "");
}

export function normalizeYoutubeInput(text = "") {
  const withoutCommand = String(text)
    .replace(/^\/(?:yturl|yt|youtube)(?:@\w+)?\s*/i, "")
    .replace(/^!(?:yturl|yt|youtube)\s*/i, "");
  const url = extractTargetUrl(withoutCommand);
  return withoutCommand.replace(url, "").replace(/\s+/g, " ").trim();
}

export function parseJsonMarkdown(text = "") {
  const raw = String(text).trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const objectMatch = candidate.match(/\{[\s\S]*\}/);
    if (!objectMatch) return null;
    try {
      return JSON.parse(objectMatch[0]);
    } catch {
      return null;
    }
  }
}

export function normalizeYouTubeDraft(value = {}) {
  const title = cleanText(value.title) || "YouTube shorts draft";
  const script = cleanText(value.script) || cleanText(value.body) || title;
  const character_profile = cleanText(value.character_profile || value.characterProfile) || DEFAULT_CHARACTER_PROFILE;
  const sourceScenes = Array.isArray(value.scenes) ? value.scenes : [];
  const scenes = sourceScenes
    .map((scene, index) => normalizeScene(scene, index, title, character_profile))
    .filter((scene) => scene.narration || scene.image_prompt);

  while (scenes.length < MIN_SCENES) {
    const order = scenes.length + 1;
    scenes.push({
      order,
      narration: fallbackNarration(script, order),
      image_prompt: withCharacterProfile(fallbackImagePrompt(title, order), character_profile),
      duration_seconds: 8,
    });
  }

  return {
    title,
    character_profile,
    duration_seconds: Number(value.duration_seconds || value.durationSeconds || 90),
    script,
    scenes: scenes.map((scene, index) => ({
      ...scene,
      order: index + 1,
      duration_seconds: Number(scene.duration_seconds || 8),
    })),
  };
}

export function applyConsistentCharacterProfile(draft = {}) {
  return normalizeYouTubeDraft(draft);
}

export function buildYouTubeDraftPrompt({ mode, input, article } = {}) {
  const source = mode === "url"
    ? [
        `Source URL: ${article?.sourceUrl || ""}`,
        `Source title: ${article?.title || input || ""}`,
        `Source body: ${cleanText(article?.body || input || "").slice(0, 5000)}`,
      ].join("\n")
    : `Keyword/request: ${cleanText(input || "")}`;

  return [
    "You are a Korean YouTube shorts planner.",
    "Create an original, copyright-safe Korean video draft.",
    "Do not copy source sentences. Transform the idea into new wording.",
    "Return only JSON. No markdown.",
    "Schema:",
    "{\"title\":\"string\",\"character_profile\":\"English stable recurring character description\",\"duration_seconds\":90,\"script\":\"string\",\"scenes\":[{\"order\":1,\"narration\":\"string\",\"image_prompt\":\"English 9:16 cinematic prompt\",\"duration_seconds\":8}]}",
    "Rules:",
    "- scenes must contain at least 3 items.",
    "- character_profile must describe one stable recurring human presenter/lead if any human appears: ethnicity, gender, approximate age, hairstyle, face, outfit, and role must remain consistent.",
    "- every image_prompt must include that same character identity when people appear, and must not change race, gender, age, hairstyle, or outfit between scenes.",
    "- image_prompt must be in English and must avoid logos, readable text, subtitles, and watermarks.",
    "- script must be Korean, concise, and suitable for narration.",
    "",
    source,
  ].join("\n");
}

export function buildFlowPromptFromDraft(draft, sceneLimit = 3) {
  const normalized = normalizeYouTubeDraft(draft);
  const visualBeats = normalized.scenes
    .slice(0, sceneLimit)
    .map((scene) => scene.image_prompt)
    .join(" Then ");

  return [
    "9:16 vertical YouTube shorts video, 8 seconds.",
    `Title: ${normalized.title}.`,
    `Visual beats: ${visualBeats}.`,
    "Style: realistic cinematic editorial visuals, smooth camera motion, polished lighting.",
    "No subtitles, no readable text, no logos, no watermarks, no spoken audio.",
  ].join(" ");
}

function normalizeScene(scene = {}, index, title, characterProfile) {
  const imagePrompt = cleanText(scene.image_prompt || scene.imagePrompt || scene.prompt || fallbackImagePrompt(title, index + 1));
  return {
    order: Number(scene.order || index + 1),
    narration: cleanText(scene.narration || scene.voiceover || scene.text || ""),
    image_prompt: withCharacterProfile(imagePrompt, characterProfile),
    duration_seconds: Number(scene.duration_seconds || scene.durationSeconds || 8),
  };
}

function withCharacterProfile(prompt, characterProfile) {
  const cleanPrompt = cleanText(prompt);
  const profile = cleanText(characterProfile);
  if (!profile) return cleanPrompt;
  if (cleanPrompt.includes(profile)) return cleanPrompt;
  return `Consistent character rule: if any human character appears, use ${profile}. Scene: ${cleanPrompt}`;
}

function fallbackNarration(script, order) {
  const lines = cleanText(script).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  return lines[order - 1] || lines[0] || `Scene ${order}`;
}

function fallbackImagePrompt(title, order) {
  return `cinematic 9:16 editorial visual for "${cleanText(title)}", scene ${order}, realistic lighting, no text, no logos`;
}

function cleanText(value = "") {
  return String(value || "").replace(/\s+/g, " ").trim();
}
