export function estimateCompactKoreanChars(value = "") {
  return Array.from(String(value || "").replace(/\s+/g, "")).length;
}

export function decideScriptPolishAcceptance({
  originalScript = "",
  polishedScript = "",
  scriptPolishEnabled = false,
  maxGrowthRatio = 1.12,
} = {}) {
  if (!scriptPolishEnabled) return { accept: false, reason: "SCRIPT_POLISH_DISABLED" };
  const originalChars = Math.max(1, estimateCompactKoreanChars(originalScript));
  const polishedChars = estimateCompactKoreanChars(polishedScript);
  if (!polishedChars) return { accept: false, reason: "SCRIPT_POLISH_EMPTY" };
  const maxAllowedChars = Math.ceil(originalChars * maxGrowthRatio);
  if (polishedChars > maxAllowedChars) {
    return {
      accept: false,
      reason: "SCRIPT_POLISH_TOO_LONG",
      originalChars,
      polishedChars,
      maxAllowedChars,
    };
  }
  return { accept: true, reason: "SCRIPT_POLISH_ACCEPTED", originalChars, polishedChars };
}
