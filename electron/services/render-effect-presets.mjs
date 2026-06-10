const MOTION_PRESETS = {
  none: { axis: "none", direction: "none", energy: "none", zoomType: "none", bestFor: ["static"] },

  "slow-zoom-in": { axis: "center", direction: "center-in", energy: "calm", zoomType: "in", bestFor: ["portrait", "object"] },
  "slow-pull-back": { axis: "center", direction: "center-out", energy: "calm", zoomType: "out", bestFor: ["architecture", "landscape"] },
  "center-breathe": { axis: "center", direction: "center-breathe", energy: "calm", zoomType: "breathe", bestFor: ["document", "portrait"] },
  "subject-hold-push": { axis: "center", direction: "hold-then-in", energy: "calm", zoomType: "delayed-in", bestFor: ["object", "portrait"] },
  "wide-pullback": { axis: "center", direction: "detail-to-wide", energy: "calm", zoomType: "out", bestFor: ["map", "architecture"] },
  "edge-to-center": { axis: "center", direction: "edge-to-center", energy: "calm", zoomType: "in", bestFor: ["document", "artifact"] },

  "slow-pan-left": { axis: "horizontal", direction: "right-to-left", energy: "calm", zoomType: "hold", bestFor: ["map", "timeline"] },
  "slow-pan-right": { axis: "horizontal", direction: "left-to-right", energy: "calm", zoomType: "hold", bestFor: ["map", "timeline"] },
  "slow-pan-up": { axis: "vertical", direction: "bottom-to-top", energy: "calm", zoomType: "hold", bestFor: ["building", "document"] },
  "slow-pan-down": { axis: "vertical", direction: "top-to-bottom", energy: "calm", zoomType: "hold", bestFor: ["document", "portrait"] },
  "reveal-from-top": { axis: "vertical", direction: "top-to-bottom", energy: "calm", zoomType: "hold", bestFor: ["document", "map"] },
  "reveal-from-bottom": { axis: "vertical", direction: "bottom-to-top", energy: "calm", zoomType: "hold", bestFor: ["architecture", "artifact"] },

  "diagonal-drift": { axis: "diagonal", direction: "diag-down-right", energy: "calm", zoomType: "in", bestFor: ["landscape", "architecture"] },
  "reverse-diagonal-drift": { axis: "diagonal", direction: "diag-up-left", energy: "calm", zoomType: "in", bestFor: ["landscape", "architecture"] },
  "diagonal-drift-up-left": { axis: "diagonal", direction: "diag-up-left", energy: "calm", zoomType: "in", bestFor: ["landscape"] },
  "diagonal-drift-up-right": { axis: "diagonal", direction: "diag-up-right", energy: "calm", zoomType: "in", bestFor: ["landscape"] },
  "diagonal-drift-down-left": { axis: "diagonal", direction: "diag-down-left", energy: "calm", zoomType: "in", bestFor: ["landscape"] },
  "diagonal-drift-down-right": { axis: "diagonal", direction: "diag-down-right", energy: "calm", zoomType: "in", bestFor: ["landscape"] },
  "micro-parallax-crop": { axis: "micro", direction: "micro-shift", energy: "calm", zoomType: "in", bestFor: ["document", "object"] },
  "tilt-reveal": { axis: "vertical", direction: "bottom-to-top", energy: "calm", zoomType: "in", bestFor: ["architecture", "document"] },

  "hook-punch-zoom": { axis: "center", direction: "center-in", energy: "high", zoomType: "punch-in", bestFor: ["hook", "climax"] },
  "cinematic-push-in": { axis: "center", direction: "center-in", energy: "medium", zoomType: "in", bestFor: ["object", "portrait"] },
  "fast-push-in": { axis: "center", direction: "center-in", energy: "high", zoomType: "in", bestFor: ["hook", "object"] },
  "whip-pan-soft": { axis: "horizontal", direction: "left-to-right", energy: "high", zoomType: "hold", bestFor: ["hook", "reversal"] },
  "snap-drift": { axis: "diagonal", direction: "diag-down-right", energy: "high", zoomType: "in", bestFor: ["reversal", "climax"] },
  "fast-pan-left": { axis: "horizontal", direction: "right-to-left", energy: "high", zoomType: "hold", bestFor: ["reversal"] },
  "fast-pan-right": { axis: "horizontal", direction: "left-to-right", energy: "high", zoomType: "hold", bestFor: ["reversal"] },
};

const MOTION_BY_INTENSITY = {
  none: ["none"],
  light: [
    "slow-zoom-in", "slow-pull-back", "center-breathe", "subject-hold-push",
    "slow-pan-left", "slow-pan-right", "slow-pan-up", "slow-pan-down",
    "reveal-from-top", "reveal-from-bottom", "diagonal-drift",
    "reverse-diagonal-drift", "diagonal-drift-up-right", "diagonal-drift-down-left",
    "micro-parallax-crop", "edge-to-center",
  ],
  strong: [
    "hook-punch-zoom", "cinematic-push-in", "fast-push-in", "subject-hold-push",
    "whip-pan-soft", "fast-pan-left", "fast-pan-right",
    "snap-drift", "diagonal-drift", "reverse-diagonal-drift",
    "diagonal-drift-up-left", "diagonal-drift-down-right",
    "reveal-from-top", "reveal-from-bottom", "micro-parallax-crop",
  ],
};

const DIRECTION_CYCLE = [
  "center-in",
  "right-to-left",
  "top-to-bottom",
  "diag-up-left",
  "center-out",
  "bottom-to-top",
  "left-to-right",
  "diag-down-left",
  "hold-then-in",
  "diag-up-right",
  "micro-shift",
  "detail-to-wide",
];

function hashSeed(parts = []) {
  const text = parts.join("|");
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function normalizeIntensity(value) {
  return ["none", "light", "strong"].includes(value) ? value : "light";
}

function candidateScore(name, targetDirection, visualCategory, section) {
  const meta = getMotionPresetMetadata(name);
  let score = 0;
  if (meta.direction === targetDirection) score += 12;
  if (meta.bestFor.some((item) => new RegExp(item, "i").test(`${visualCategory} ${section}`))) score += 5;
  if (/product|device|object|portrait|artifact/i.test(visualCategory) && meta.axis === "center") score += 4;
  if (/map|timeline/i.test(visualCategory) && meta.axis === "horizontal") score += 4;
  if (/document|quote|text/i.test(visualCategory) && ["vertical", "micro", "center"].includes(meta.axis)) score += 4;
  if (/architecture|building|space|landscape/i.test(visualCategory) && ["diagonal", "vertical", "center"].includes(meta.axis)) score += 3;
  if (/hook|climax|reversal/i.test(section) && meta.energy === "high") score += 3;
  return score;
}

export function getMotionPresetMetadata(name = "") {
  const key = String(name || "slow-zoom-in");
  return MOTION_PRESETS[key] ? { name: key, ...MOTION_PRESETS[key] } : { name: key, ...MOTION_PRESETS["slow-zoom-in"] };
}

export function chooseSceneMotionPreset({
  renderEffectPreset = "cinematic",
  motionIntensity = "light",
  order = 1,
  section = "",
  visualCategory = "",
  jobId = "",
} = {}) {
  const intensity = normalizeIntensity(motionIntensity);
  const library = MOTION_BY_INTENSITY[intensity] || MOTION_BY_INTENSITY.light;
  if (intensity === "none") return { name: "none", fps: 30, ...getMotionPresetMetadata("none") };

  const safeOrder = Math.max(1, Math.round(Number(order || 1)));
  const directionOffset = hashSeed([jobId, renderEffectPreset, intensity]) % DIRECTION_CYCLE.length;
  const targetDirection = DIRECTION_CYCLE[(safeOrder - 1 + directionOffset) % DIRECTION_CYCLE.length];
  const ranked = library
    .map((name) => ({
      name,
      score: candidateScore(name, targetDirection, visualCategory, section),
      tiebreaker: hashSeed([jobId, renderEffectPreset, intensity, safeOrder, section, visualCategory, name]),
    }))
    .sort((a, b) => b.score - a.score || a.tiebreaker - b.tiebreaker);

  const selected = ranked[0]?.name || library[hashSeed([jobId, renderEffectPreset, intensity, safeOrder]) % library.length];
  return {
    name: selected,
    fps: 30,
    ...getMotionPresetMetadata(selected),
  };
}

export function getTransitionConfig({ transitionPreset = "scene-fade", transitionSeconds = 0.3 } = {}) {
  const seconds = transitionPreset === "none" ? 0 : Math.max(0, Math.min(0.6, Number(transitionSeconds || 0.3)));
  const transitionMap = {
    none: { filter: "concat", transition: "none" },
    "scene-fade": { filter: "fade", transition: "fade" },
    "smooth-crossfade": { filter: "xfade", transition: "fade" },
    "directional-wipe": { filter: "xfade", transition: "smoothleft" },
    "hook-whip": { filter: "xfade", transition: "hblur" },
  };
  return { ...(transitionMap[transitionPreset] || transitionMap["scene-fade"]), seconds };
}
