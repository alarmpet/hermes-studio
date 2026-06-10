import { spawnSync } from "node:child_process";

export const STYLE_PRESETS = [
  preset("cinematic-tech-news", "Cinematic Tech News", "polished realistic tech-news B-roll", "smooth dolly or slow push-in", "cool neutral studio lighting", "teal, steel, white"),
  preset("documentary-handheld", "Documentary Handheld", "observational documentary realism", "subtle handheld natural motion", "available light with soft contrast", "natural skin tones"),
  preset("clean-explainer", "Clean Explainer", "simple visual metaphor with clean composition", "locked-off or gentle pan", "bright even lighting", "white, graphite, accent color"),
  preset("product-macro", "Product Macro", "macro product detail, tactile surfaces", "slow macro tracking shot", "controlled studio highlights", "black, chrome, deep accent"),
  preset("futuristic-interface", "Futuristic Interface", "near-future interface environment without readable UI text", "slow orbit or parallax", "soft neon rim lighting", "cyan, emerald, graphite"),
  preset("warm-human-story", "Warm Human Story", "human-centered everyday realism", "gentle eye-level follow shot", "warm window light", "warm amber, soft blue"),
  preset("noir-investigation", "Noir Investigation", "dramatic investigative mood", "slow push through shadows", "low-key contrast lighting", "black, white, muted gold"),
  preset("animated-clay", "Animated Clay", "tactile clay animation style", "static camera with small handmade motion", "soft tabletop lighting", "colorful matte clay"),
  preset(
    "stickman-explainer",
    "Stickman Explainer",
    "minimal black stickman explainer animation on a clean whiteboard canvas",
    "locked-off whiteboard composition with gentle digital pan",
    "flat clean high-key lighting",
    "white, black, one accent color",
    {
      characterContinuity: "same simple stickman proportions, round head, thin black limbs, consistent line thickness, no gender or age drift",
      worldContinuity: "same whiteboard canvas, same black line weight, same single accent color, simple icon-like props",
      negativePrompt: "no realistic humans, no photorealistic faces, no complex backgrounds, no readable text, no logos, no watermarks",
      preferredOutputModes: ["image", "video"],
    },
  ),
  preset(
    "stickmanplus",
    "StickmanPlus History",
    "flat vector stickmanplus history explainer, whiteboard-comic infographic style for surprising historical stories",
    "locked-off explainer composition with gentle pan, simple slide-in arrows, spotlight reveals, and cause-effect diagram motion",
    "flat high-key illustration lighting with soft vignette, no realistic shadows",
    "warm beige parchment, off-white, black outlines, navy suits, red arrows, gold coins, muted blue castles, green highlights",
    {
      characterContinuity: "same round white stickman characters with dot eyes, simple expressive eyebrows, thick black outline, small navy suit or simplified period costume, consistent proportions and line weight across every scene",
      worldContinuity: "same beige parchment or whiteboard-comic world, thick black outlines, flat vector props, muted palette, simple historical icons such as castles, maps, scrolls, crowns, coins, scales, ships, timelines, arrows, spotlights, magnifying glasses, court rooms, and battlefield symbols",
      negativePrompt: "no photorealistic humans, no realistic faces, no exact celebrity or historical-person likeness, no readable text, no Korean text, no English text, no logos, no watermarks, no brand marks, no dense realistic backgrounds",
      preferredOutputModes: ["image", "video"],
      promptSuffix: [
        "Style: stickmanplus flat vector history explainer, whiteboard-comic infographic, thick black outlines, warm beige parchment background, simple expressive round-head stickman characters.",
        "Camera: locked-off explainer board with gentle pan or slow push, clear symbolic staging, simple slide-in arrows and spotlight reveals.",
        "Lighting: flat high-key illustration lighting, soft vignette only, no realistic shadows.",
        "Color palette: warm beige, off-white, black outlines, navy suits, red arrows, gold coins and crowns, muted blue castles, green discovery highlights.",
        "Historical visual toolbox: castles, maps, scrolls, crowns, coins, scales, ships, timelines, arrows, spotlights, magnifying glasses, court rooms, battlefield symbols, broken walls, tax chests, treaty tables.",
        "Character continuity: same round white stickman characters with dot eyes, simple expressive eyebrows, thick black outline, small navy suit or simplified period costume, consistent proportions and line weight across every scene.",
        "World continuity: same whiteboard-comic parchment world, flat vector props, minimal shading, no realistic humans.",
        "Negative constraints: no readable text, no Korean text, no English text, no logos, no watermarks, no brand marks, no exact real-person likeness, no photorealistic faces.",
      ].join(" "),
    },
  ),
];

function preset(id, label, aesthetic, camera, lighting, colorPalette, extra = {}) {
  const characterContinuity = extra.characterContinuity
    || "keep the same character identity, age, wardrobe, body type, and visual proportions across every scene";
  const worldContinuity = extra.worldContinuity
    || `keep the same ${colorPalette} palette, lighting style, camera language, and scene design across every scene`;
  const negativePrompt = extra.negativePrompt
    || "no readable text, no logos, no watermarks, no random character identity changes";
  return {
    id,
    label,
    description: aesthetic,
    aesthetic,
    camera,
    lighting,
    colorPalette,
    characterContinuity,
    worldContinuity,
    negativePrompt,
    preferredOutputModes: extra.preferredOutputModes || ["video", "image"],
    promptSuffix: extra.promptSuffix || `Style: ${aesthetic}. Camera: ${camera}. Lighting: ${lighting}. Color palette: ${colorPalette}. Character continuity: ${characterContinuity}. World continuity: ${worldContinuity}. Negative constraints: ${negativePrompt}.`,
  };
}

export function listStylePresets({ dbHelperPath = "", pythonBin = "python" } = {}) {
  const merged = new Map(STYLE_PRESETS.map((item) => [item.id, item]));
  for (const item of listDbStylePresets({ dbHelperPath, pythonBin })) {
    const normalized = normalizePreset(item);
    if (normalized?.id) merged.set(normalized.id, normalized);
  }
  return Array.from(merged.values());
}

export function getStylePreset(id = "cinematic-tech-news", options = {}) {
  return listStylePresets(options).find((item) => item.id === id) || STYLE_PRESETS[0];
}

function listDbStylePresets({ dbHelperPath = "", pythonBin = "python" } = {}) {
  if (!dbHelperPath) return [];
  const result = spawnSync(pythonBin, [dbHelperPath, "list-style-presets"], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) return [];
  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizePreset(item = {}) {
  const id = String(item.id || "").trim();
  if (!id) return null;
  return {
    id,
    label: String(item.label || id).trim(),
    description: String(item.aesthetic || item.description || "").trim(),
    aesthetic: String(item.aesthetic || item.description || "").trim(),
    camera: String(item.camera || "").trim(),
    lighting: String(item.lighting || "").trim(),
    colorPalette: String(item.colorPalette || item.color_palette || "").trim(),
    characterContinuity: String(item.characterContinuity || item.character_continuity || "").trim(),
    worldContinuity: String(item.worldContinuity || item.world_continuity || "").trim(),
    negativePrompt: String(item.negativePrompt || item.negative_prompt || "").trim(),
    preferredOutputModes: normalizeOutputModes(item.preferredOutputModes || item.preferred_output_modes),
    promptSuffix: String(item.promptSuffix || item.prompt_suffix || "").trim(),
    isCustom: Boolean(item.is_custom || item.isCustom),
  };
}

function normalizeOutputModes(value) {
  if (Array.isArray(value)) return value.filter((item) => ["video", "image"].includes(item));
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return normalizeOutputModes(parsed);
    } catch {
      return value.split(",").map((item) => item.trim()).filter((item) => ["video", "image"].includes(item));
    }
  }
  return ["video", "image"];
}
