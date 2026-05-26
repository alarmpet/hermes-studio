const MOTION_LIBRARY = {
  clean: ["slow-zoom-in", "slow-pan-left", "slow-pan-right"],
  cinematic: ["cinematic-push-in", "diagonal-drift", "tilt-reveal", "slow-pull-back"],
  "dynamic-shorts": ["hook-punch-zoom", "whip-pan-soft", "fast-push-in", "snap-drift"],
};

export function chooseSceneMotionPreset({
  renderEffectPreset = "cinematic",
  order = 1,
  section = "",
  visualCategory = "",
} = {}) {
  const library = MOTION_LIBRARY[renderEffectPreset] || MOTION_LIBRARY.cinematic;
  let index = (Number(order || 1) - 1) % library.length;
  if (section === "hook" && renderEffectPreset === "dynamic-shorts") index = 0;
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
