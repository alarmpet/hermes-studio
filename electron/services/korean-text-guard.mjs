export function koreanTextStats(text = "") {
  const value = String(text || "");
  const chars = Array.from(value);
  const length = chars.length;
  const hangulCount = (value.match(/[\uac00-\ud7af]/gu) || []).length;
  const hanCount = (value.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu) || []).length;
  const replacementCount = (value.match(/\ufffd/gu) || []).length;
  const questionClusterCount = (value.match(/\?{3,}/g) || []).length;
  const suspiciousSymbolCount = (value.match(/[�]|[\u0080-\u009f]/gu) || []).length;
  const hangulRatio = hangulCount / Math.max(1, length);
  const hanRatio = hanCount / Math.max(1, length);
  return {
    length,
    hangulCount,
    hanCount,
    replacementCount,
    questionClusterCount,
    suspiciousSymbolCount,
    hangulRatio: Number(hangulRatio.toFixed(3)),
    hanRatio: Number(hanRatio.toFixed(3)),
  };
}

export function looksLikeCorruptKorean(text = "") {
  const value = String(text || "").trim();
  if (!value) return true;
  const stats = koreanTextStats(value);
  if (stats.length < 12) {
    return stats.replacementCount > 0 || stats.suspiciousSymbolCount > 0;
  }
  return (
    stats.replacementCount > 0
    || stats.suspiciousSymbolCount > 0
    || stats.questionClusterCount >= 2
    || (stats.hanCount >= 4 && stats.hangulRatio < 0.35)
    || (stats.hanRatio >= 0.12 && stats.hangulRatio < 0.45)
    || (stats.hangulCount < 4 && stats.length >= 30)
  );
}

export function validateTtsNarrationScenes(scenes = []) {
  const corrupt = scenes
    .map((scene, index) => ({
      order: Number(scene?.order || index + 1),
      narration: String(scene?.narration || ""),
    }))
    .filter((scene) => looksLikeCorruptKorean(scene.narration));

  if (corrupt.length) {
    const first = corrupt[0];
    const error = new Error(`DRAFT_NARRATION_CORRUPTED scene=${first.order}: narration contains mojibake or unsupported text before TTS.`);
    error.code = "DRAFT_NARRATION_CORRUPTED";
    error.failedSceneOrder = first.order;
    error.corruptSceneOrders = corrupt.map((scene) => scene.order);
    throw error;
  }
}
