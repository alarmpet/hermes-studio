export function estimateDirectScriptDuration({ script = "", targetSeconds = 60 } = {}) {
  const compactLength = String(script || "").replace(/\s+/g, "").length;
  const target = Math.max(1, Number(targetSeconds || 60));
  const estimatedSeconds = Math.max(3, Math.round(compactLength / 5.5));
  const ratio = estimatedSeconds / target;
  if (ratio < 0.55) {
    return {
      severity: "warning",
      estimatedSeconds,
      ratio,
      message: `Script is too short for the selected duration. Estimated narration ${estimatedSeconds}s / target ${target}s; the video may feel stretched or repetitive.`,
    };
  }
  if (ratio > 1.35) {
    return {
      severity: "warning",
      estimatedSeconds,
      ratio,
      message: `Script is too long for the selected duration. Estimated narration ${estimatedSeconds}s / target ${target}s; TTS may become too fast or clipped.`,
    };
  }
  return {
    severity: "ok",
    estimatedSeconds,
    ratio,
    message: `Estimated narration ${estimatedSeconds}s / target ${target}s.`,
  };
}
