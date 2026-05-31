export function outputModeForScene({ sceneOrder, flowOutputMode = "video", hybridIntroVideoSceneCount = 2 } = {}) {
  const mode = String(flowOutputMode || "video").toLowerCase();
  const order = Math.max(1, Number(sceneOrder || 1));
  const introCount = Math.max(0, Math.min(10, Math.round(Number(hybridIntroVideoSceneCount ?? 2))));
  if (mode === "hybrid") return order <= introCount ? "video" : "image";
  if (mode === "image") return "image";
  return "video";
}

export function assignSceneOutputModes({ scenes = [], flowOutputMode = "video", hybridIntroVideoSceneCount = 2 } = {}) {
  return scenes.map((scene, index) => ({
    ...scene,
    outputMode: outputModeForScene({
      sceneOrder: scene.order || index + 1,
      flowOutputMode,
      hybridIntroVideoSceneCount,
    }),
  }));
}
