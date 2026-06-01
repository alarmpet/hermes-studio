export function wrapBalancedTitle(text = "", { maxChars = 10, maxLines = 2 } = {}) {
  const title = compactTitleText(text);
  if (!title) return [];
  const chars = Array.from(title);
  const limit = Math.max(1, Number(maxChars || 10));
  const lineLimit = Math.max(1, Number(maxLines || 2));
  if (chars.length <= limit || lineLimit === 1) {
    return [chars.slice(0, limit).join("")].filter(Boolean);
  }
  if (lineLimit !== 2) return greedyWrapTitle(title, limit, lineLimit);

  const tokenLines = balancedTokenSplit(title, limit);
  if (tokenLines.length) return tokenLines;
  return balancedCharacterSplit(title, limit);
}

function compactTitleText(text = "") {
  return String(text || "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[|｜].*$/u, "")
    .slice(0, 80);
}

function balancedTokenSplit(title, maxChars) {
  const tokens = title.split(/\s+/u).filter(Boolean);
  if (tokens.length < 2) return [];
  const candidates = [];
  for (let split = 1; split < tokens.length; split += 1) {
    const top = tokens.slice(0, split).join(" ");
    const bottom = tokens.slice(split).join(" ");
    const topLength = visualLength(top);
    const bottomLength = visualLength(bottom);
    if (topLength > maxChars || bottomLength > maxChars) continue;
    candidates.push({
      lines: [top, bottom],
      score: Math.abs(topLength - bottomLength)
        + tinyLinePenalty(topLength, maxChars)
        + tinyLinePenalty(bottomLength, maxChars),
    });
  }
  return candidates.sort((a, b) => a.score - b.score)[0]?.lines || [];
}

function balancedCharacterSplit(title, maxChars) {
  const chars = Array.from(title.replace(/\s+/g, ""));
  if (chars.length <= maxChars) return [chars.join("")];
  const candidates = [];
  const minSplit = Math.max(1, chars.length - maxChars);
  const maxSplit = Math.min(maxChars, chars.length - 1);
  for (let split = minSplit; split <= maxSplit; split += 1) {
    const top = chars.slice(0, split).join("");
    const bottom = chars.slice(split, split + maxChars).join("");
    candidates.push({
      lines: [top, bottom],
      score: Math.abs(visualLength(top) - visualLength(bottom))
        + tinyLinePenalty(visualLength(top), maxChars)
        + tinyLinePenalty(visualLength(bottom), maxChars),
    });
  }
  return candidates.sort((a, b) => a.score - b.score)[0]?.lines || [chars.slice(0, maxChars).join("")];
}

function greedyWrapTitle(title, maxChars, maxLines) {
  const lines = [];
  const tokens = title.split(/(\s+)/u).filter(Boolean);
  let current = "";
  for (const token of tokens) {
    const next = current ? `${current}${token}` : token.trimStart();
    if (visualLength(next) > maxChars && current.trim()) {
      lines.push(current.trim());
      current = token.trimStart();
    } else {
      current = next;
    }
    if (lines.length >= maxLines) break;
  }
  if (current.trim() && lines.length < maxLines) lines.push(current.trim());
  return lines.slice(0, maxLines).filter(Boolean);
}

function visualLength(value = "") {
  return Array.from(String(value).replace(/\s+/g, "")).length;
}

function tinyLinePenalty(length, maxChars) {
  return length < Math.max(3, Math.floor(maxChars * 0.42)) ? 4 : 0;
}
