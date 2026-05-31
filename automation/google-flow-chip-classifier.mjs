export function normalizeChipLabel(label = "") {
  return String(label || "").replace(/\s+/g, " ").trim();
}

export function isAgentChip(label = "") {
  const text = normalizeChipLabel(label).toLowerCase();
  return /agent|에이전트|요청(?:\s*사항)?|request/i.test(text);
}

export function isCreateChip(label = "") {
  const text = normalizeChipLabel(label).toLowerCase();
  return /arrow_forward|create|generate|만들기|생성/i.test(text);
}

export function isAddMediaChip(label = "") {
  const text = normalizeChipLabel(label).toLowerCase();
  return /add_2|add|미디어\s*추가/i.test(text);
}

export function isModelSettingsChip(label = "") {
  const text = normalizeChipLabel(label).toLowerCase();
  if (!text || isAgentChip(text) || isCreateChip(text) || isAddMediaChip(text)) return false;
  return /nano banana|imagen\s*\d*|veo\s*\d*|crop_9_16|9:16|16:9|1x|00:10|videocam|image|video|이미지|동영상|tune|settings|설정/i.test(text);
}

export function flowChipRejectionReason(item = {}) {
  const label = normalizeChipLabel(item.label || item.text || "");
  if (!label) return "empty-label";
  if (isAgentChip(label)) return "agent-chip";
  if (isCreateChip(label)) return "create-chip";
  if (isAddMediaChip(label)) return "add-media-chip";
  if (!isModelSettingsChip(label)) return "not-model-settings-chip";
  return "";
}

export function scoreFlowGeneratorChip(item = {}) {
  const label = normalizeChipLabel(item.label || item.text || "");
  if (!isModelSettingsChip(label)) return -Infinity;
  let score = 0;
  if (/veo\s*\d*|nano banana|imagen\s*\d*/i.test(label)) score += 100;
  if (/crop_9_16|9:16|16:9|1x/i.test(label)) score += 40;
  if (/동영상|이미지|video|image/i.test(label)) score += 20;
  if (/tune|settings|설정/i.test(label)) score += 10;
  score += Math.min(20, Number(item.width || item.rect?.width || 0) / 10);
  score += Math.min(20, Number(item.height || item.rect?.height || 0) / 4);
  return score;
}

export function classifyFlowChip(item = {}) {
  const label = normalizeChipLabel(item.label || item.text || "");
  const reason = flowChipRejectionReason(item);
  const score = scoreFlowGeneratorChip(item);
  return {
    label,
    eligible: !reason,
    reason,
    score,
  };
}

export function chooseFlowGeneratorChip(items = []) {
  return [...items]
    .map((item) => ({ ...item, _score: scoreFlowGeneratorChip(item) }))
    .filter((item) => Number.isFinite(item._score))
    .sort((a, b) => b._score - a._score)[0] || null;
}

export function rejectedFlowChipReasons(items = []) {
  return items
    .map((item) => ({ ...item, reason: flowChipRejectionReason(item) }))
    .filter((item) => item.reason)
    .map(({ reason, label, text, x, y, width, height }) => ({
      label: normalizeChipLabel(label || text || ""),
      reason,
      x,
      y,
      width,
      height,
    }));
}

export function flowChipClassifierBrowserSource() {
  return `
    const normalizeChipLabel = ${normalizeChipLabel.toString()};
    const isAgentChip = ${isAgentChip.toString()};
    const isCreateChip = ${isCreateChip.toString()};
    const isAddMediaChip = ${isAddMediaChip.toString()};
    const isModelSettingsChip = ${isModelSettingsChip.toString()};
    const flowChipRejectionReason = ${flowChipRejectionReason.toString()};
    const scoreFlowGeneratorChip = ${scoreFlowGeneratorChip.toString()};
    const chooseFlowGeneratorChip = ${chooseFlowGeneratorChip.toString()};
    const rejectedFlowChipReasons = ${rejectedFlowChipReasons.toString()};
  `;
}
