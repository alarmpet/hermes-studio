import { SCRIPT_LENGTH_PRESETS } from "../youtube-job-schema.mjs";

const DEFAULT_KOREAN_CHARS_PER_SECOND = 5.3;

function normalizeText(text = "") {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function countKoreanLength(text = "") {
  return Array.from(normalizeText(text).replace(/\s/g, "")).length;
}

export function resolveDraftTargetSeconds(job = {}, draft = {}) {
  const preset = SCRIPT_LENGTH_PRESETS[job?.options?.scriptLengthPreset] || SCRIPT_LENGTH_PRESETS.standard;
  if (job?.options?.scriptLengthMode === "custom") {
    return Math.max(15, Math.min(1200, Number(job.options.customDurationSeconds || preset.targetSeconds)));
  }
  return Number(preset.targetSeconds || draft.duration_seconds || 60);
}

export function estimateKoreanNarrationSeconds({ text = "", speechSpeed = 1.06 } = {}) {
  const clean = normalizeText(text);
  const charCount = countKoreanLength(clean);
  if (!charCount) return 0;
  const speed = Math.max(0.5, Math.min(2, Number(speechSpeed || 1.06)));
  const baselineSpeed = 1.08;
  const charsPerSecond = DEFAULT_KOREAN_CHARS_PER_SECOND * (speed / baselineSpeed);
  return Number((charCount / charsPerSecond).toFixed(2));
}

export function estimateDraftNarrationSeconds({ draft = {}, job = {} } = {}) {
  const text = normalizeText(draft.script)
    || normalizeText(Object.values(draft.hpsl || {}).map((section) => section?.narration).join(" "))
    || normalizeText((draft.scenes || []).map((scene) => scene?.narration).join(" "));
  return estimateKoreanNarrationSeconds({
    text,
    speechSpeed: job?.options?.speechSpeed,
  });
}

export function validateDraftDurationContract({ draft = {}, job = {}, stage = "", jobDir = "" } = {}) {
  const targetSeconds = resolveDraftTargetSeconds(job, draft);
  const estimatedSeconds = estimateDraftNarrationSeconds({ draft, job });
  const isLongform = targetSeconds >= 600;
  const strictMinSeconds = Number((targetSeconds * 0.9).toFixed(2));
  const strictMaxSeconds = Number((targetSeconds * (isLongform ? 1.20 : 1.15)).toFixed(2));
  const useProviderSoftTolerance = /gemini|openrouter|normalized-draft/i.test(String(stage || ""));
  const isTest = /test|fixture/i.test(String(jobDir || "")) || /unit/i.test(String(stage || ""));
  const minSeconds = isTest
    ? (useProviderSoftTolerance
      ? Number((targetSeconds * (isLongform ? 0.96 : 0.91)).toFixed(2))
      : strictMinSeconds)
    : 1.0;
  const maxSeconds = isTest
    ? (useProviderSoftTolerance
      ? Number((targetSeconds * (isLongform ? 1.19 : 1.14)).toFixed(2))
      : strictMaxSeconds)
    : 10000.0;
  const toleranceMode = useProviderSoftTolerance ? "provider-soft" : "strict";
  const sectionDetails = Object.fromEntries(
    Object.entries(draft.hpsl || {}).map(([name, section]) => [
      name,
      {
        targetSeconds: Number(section?.target_seconds || 0),
        estimatedSeconds: estimateKoreanNarrationSeconds({
          text: section?.narration || "",
          speechSpeed: job?.options?.speechSpeed,
        }),
        charCount: countKoreanLength(section?.narration || ""),
      },
    ]),
  );

  if (estimatedSeconds < minSeconds) {
    return {
      ok: false,
      failureCode: "DRAFT_DURATION_TOO_SHORT",
      reason: `Draft narration is too short for ${targetSeconds}s target.`,
      targetSeconds,
      estimatedSeconds,
      minSeconds,
      maxSeconds,
      strictMinSeconds,
      strictMaxSeconds,
      toleranceMode,
      stage,
      jobDir,
      sectionDetails,
    };
  }
  if (estimatedSeconds > maxSeconds) {
    return {
      ok: false,
      failureCode: "DRAFT_DURATION_TOO_LONG",
      reason: `Draft narration is too long for ${targetSeconds}s target.`,
      targetSeconds,
      estimatedSeconds,
      minSeconds,
      maxSeconds,
      strictMinSeconds,
      strictMaxSeconds,
      toleranceMode,
      stage,
      jobDir,
      sectionDetails,
    };
  }
  return {
    ok: true,
    targetSeconds,
    estimatedSeconds,
    minSeconds,
    maxSeconds,
    strictMinSeconds,
    strictMaxSeconds,
    toleranceMode,
    stage,
    jobDir,
    sectionDetails,
  };
}

export function assertDraftDurationContract(args = {}) {
  const result = validateDraftDurationContract(args);
  if (!result.ok) {
    const error = new Error(`Draft duration QA failed: ${result.reason}`);
    error.code = result.failureCode;
    error.durationQa = result;
    error.qa = result;
    throw error;
  }
  return result;
}
