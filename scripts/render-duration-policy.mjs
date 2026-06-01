export function classifyDurationSyncPolicy({ order, videoDuration, audioDuration, outputMode = "" } = {}) {
  const safeVideoDuration = Number(videoDuration || 0);
  const safeAudioDuration = Number(audioDuration || 0);
  const ratio = safeVideoDuration > 0 ? safeAudioDuration / safeVideoDuration : Number.POSITIVE_INFINITY;
  const extraHoldSeconds = Math.max(0, safeAudioDuration - safeVideoDuration);
  const base = {
    order: Number(order || 0),
    failedSceneOrder: Number(order || 0),
    videoDuration: Number(safeVideoDuration.toFixed(3)),
    audioDuration: Number(safeAudioDuration.toFixed(3)),
    ratio: Number(ratio.toFixed(6)),
    extraHoldSeconds: Number(extraHoldSeconds.toFixed(3)),
    qualityWarnings: [],
    requiresRegeneration: false,
    failureCode: "",
  };

  if (!Number.isFinite(ratio) || safeVideoDuration <= 0 || safeAudioDuration <= 0) {
    return {
      ...base,
      strategy: "invalid",
      requiresRegeneration: true,
      failureCode: "INVALID_MEDIA_DURATION",
    };
  }

  const isImageMode = String(outputMode || "").toLowerCase() === "image";
  const longformSoftMismatch = safeVideoDuration >= 20 && ratio <= 1.2;

  const imageMotionSoftMismatch = isImageMode
    ? ratio > 1.2 && ratio <= 3 && extraHoldSeconds <= 30
    : ratio > 1.2 && ratio <= 1.7 && extraHoldSeconds <= 8;
  const videoLoopExtensionMismatch = !isImageMode
    && ratio > 1.7
    && ratio <= 2.5
    && extraHoldSeconds <= 12;

  if ((isImageMode && (ratio > 3 || extraHoldSeconds > 30))
    || (!isImageMode && !videoLoopExtensionMismatch && !imageMotionSoftMismatch && (ratio > 1.7 || (extraHoldSeconds > 4 && !longformSoftMismatch)))) {
    return {
      ...base,
      strategy: "regenerate",
      requiresRegeneration: true,
      failureCode: "SCENE_DURATION_MISMATCH",
      qualityWarnings: [{
        code: "SCENE_DURATION_MISMATCH",
        sceneOrder: Number(order || 0),
        message: `Scene ${order} audio is too long for one Flow clip.`,
        ratio: Number(ratio.toFixed(3)),
        extraHoldSeconds: Number(extraHoldSeconds.toFixed(3)),
      }],
    };
  }

  if (ratio > 1.2 || longformSoftMismatch || imageMotionSoftMismatch) {
    return {
      ...base,
      strategy: videoLoopExtensionMismatch ? "loop-extension" : "slowdown-loop",
      qualityWarnings: [{
        code: videoLoopExtensionMismatch ? "VIDEO_LOOP_EXTENSION" : "SOFT_DURATION_MISMATCH",
        sceneOrder: Number(order || 0),
        message: videoLoopExtensionMismatch
          ? `Scene ${order} uses a looped Flow clip extension instead of failing final render.`
          : `Scene ${order} needs a soft slowdown/loop instead of a freeze frame.`,
        ratio: Number(ratio.toFixed(3)),
        extraHoldSeconds: Number(extraHoldSeconds.toFixed(3)),
      }],
    };
  }

  if (ratio >= 0.85) {
    return {
      ...base,
      strategy: "setpts",
    };
  }

  return {
    ...base,
    strategy: "trim",
  };
}
