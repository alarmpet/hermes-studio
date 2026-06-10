export const DIRECT_SCRIPT_CHARS_PER_SECOND = 5.5;
export const SAFE_VIDEO_KOREAN_CHARS_PER_SECOND = 4.0;
export const MAX_VIDEO_NARRATION_CHARS = 60;
export const MAX_IMAGE_NARRATION_CHARS = 70;
export const MAX_SENTENCE_PRESERVE_CHARS = 80;
export const SAFE_VIDEO_MIN_SECONDS = 3.0;
export const SAFE_VIDEO_MAX_SECONDS = 7.4;

export function normalizeDirectScriptSpeechSpeed(speechSpeed = 1.06) {
  return Math.max(0.75, Math.min(1.5, Number(speechSpeed || 1.06)));
}

export function estimateDirectScriptSeconds({
  script = "",
  speechSpeed = 1.06,
  minSeconds = 15,
  maxSeconds = 1200,
  round = true,
} = {}) {
  const compactLength = Array.from(String(script || "").replace(/\s+/g, "")).length;
  const speed = normalizeDirectScriptSpeechSpeed(speechSpeed);
  const rawSeconds = compactLength / DIRECT_SCRIPT_CHARS_PER_SECOND / speed;
  const value = round ? Math.round(rawSeconds) : Number(rawSeconds.toFixed(2));
  return Math.max(minSeconds, Math.min(maxSeconds, value || minSeconds));
}

export function estimateNarrationSeconds(input = {}) {
  const options = typeof input === "string" ? { text: input } : (input || {});
  const {
    text = "",
    speechSpeed = 1,
    koreanCharsPerSecond = SAFE_VIDEO_KOREAN_CHARS_PER_SECOND,
    englishWordsPerSecond = 2.5,
  } = options;
  const value = String(text || "").replace(/\s+/g, " ").trim();
  if (!value) return 0;
  const speed = normalizeDirectScriptSpeechSpeed(speechSpeed || 1);
  const compact = value.replace(/\s+/g, "");
  if (/[\uac00-\ud7a3]/.test(compact)) {
    return Number((Array.from(compact).length / Math.max(0.1, koreanCharsPerSecond) / speed).toFixed(3));
  }
  const words = value.split(/\s+/).filter(Boolean).length;
  return Number((words / Math.max(0.1, englishWordsPerSecond) / speed).toFixed(3));
}

export function estimateDirectScriptDuration({ script = "", targetSeconds = 60, speechSpeed = 1.06 } = {}) {
  const target = Math.max(1, Number(targetSeconds || 60));
  const estimatedSeconds = estimateDirectScriptSeconds({
    script,
    speechSpeed,
    minSeconds: 3,
    maxSeconds: 1200,
  });
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
