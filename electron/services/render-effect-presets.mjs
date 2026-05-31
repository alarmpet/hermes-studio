const MOTION_BY_INTENSITY = {
  none: ["none"],
  light: [
    "slow-zoom-in", "slow-pull-back", "diagonal-drift", "tilt-reveal",
    "slow-pan-left", "slow-pan-right", "slow-pan-up", "slow-pan-down",
    "diagonal-drift-up-right", "diagonal-drift-down-left"
  ],
  strong: [
    "hook-punch-zoom", "cinematic-push-in", "whip-pan-soft", "fast-push-in",
    "snap-drift", "diagonal-drift", "fast-pan-left", "fast-pan-right",
    "diagonal-drift-up-left", "diagonal-drift-down-right"
  ],
};

function hashSeed(parts = []) {
  const text = parts.join("|");
  let hash = 2166136261;
  for (const char of text) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function chooseSceneMotionPreset({
  renderEffectPreset = "cinematic",
  motionIntensity = "light",
  order = 1,
  section = "",
  visualCategory = "",
  jobId = "",
} = {}) {
  const intensity = ["none", "light", "strong"].includes(motionIntensity) ? motionIntensity : "light";
  const library = MOTION_BY_INTENSITY[intensity] || MOTION_BY_INTENSITY.light;
  if (intensity === "none") return { name: "none", fps: 30 };
  let index = hashSeed([jobId, renderEffectPreset, intensity, order, section, visualCategory]) % library.length;
  if (section === "hook" && (renderEffectPreset === "dynamic-shorts" || intensity === "strong")) {
    index = jobId ? (hashSeed([jobId]) % Math.min(3, library.length)) : 0;
  }
  if (/product|device|object/i.test(visualCategory)) {
    const productIndex = library.indexOf("cinematic-push-in");
    if (productIndex >= 0) index = productIndex;
  }
  return { name: library[index], fps: 30 };
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
