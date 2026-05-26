export function validateXfadePlan({ transitionSeconds = 0.3, sceneDurations = [], actualVideoDurations = [] } = {}) {
  if (transitionSeconds <= 0 || sceneDurations.length < 2) return { ok: true, reason: "" };
  for (let index = 0; index < sceneDurations.length; index += 1) {
    const audioDuration = Number(sceneDurations[index] || 0);
    const actualVideoDuration = Number(actualVideoDurations[index] || 0);
    const requiredVideoDuration = index === sceneDurations.length - 1
      ? audioDuration
      : audioDuration + transitionSeconds;
    if (actualVideoDuration + 0.05 < requiredVideoDuration) {
      return {
        ok: false,
        reason: `Xfade boundary violated at scene ${index + 1}: video=${actualVideoDuration}s required=${requiredVideoDuration}s`,
      };
    }
  }
  return { ok: true, reason: "" };
}

export function buildXfadeFilterGraph({ sceneCount, transitionName = "fade", transitionSeconds = 0.3, sceneDurations = [] } = {}) {
  if (sceneCount < 2 || transitionSeconds <= 0) return "";
  const filters = [];
  let previous = "[0:v]";
  let cumulativeAudioDuration = Number(sceneDurations[0] || 0);
  for (let i = 1; i < sceneCount; i += 1) {
    const out = i === sceneCount - 1 ? "[vout]" : `[v${i}]`;
    const offset = Math.max(0, cumulativeAudioDuration).toFixed(3);
    filters.push(`${previous}[${i}:v]xfade=transition=${transitionName}:duration=${transitionSeconds}:offset=${offset}${out}`);
    previous = out;
    cumulativeAudioDuration += Number(sceneDurations[i] || 0);
  }
  return filters.join(";");
}
