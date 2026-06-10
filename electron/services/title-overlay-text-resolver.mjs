const MAX_AUTO_TITLE_COMPACT_CHARS = 18;

const TITLE_STOP_WORDS = new Set([
  "오늘",
  "이번",
  "이제",
  "바로",
  "정말",
  "진짜",
  "우리는",
  "흔히",
  "작은",
  "체구",
  "이야기",
  "이유",
]);

export function resolveTitleOverlayText({ job = {}, draft = {}, sourceValue = "" } = {}) {
  const options = job.options || {};
  const manualText = cleanTitle(options.titleOverlayText || "");
  if (options.titleOverlayMode === "manual" && manualText) {
    return { text: manualText.slice(0, 80), source: "manual" };
  }

  const draftTitle = cleanTitle(draft.title);
  if (draftTitle && compactLength(draftTitle) <= MAX_AUTO_TITLE_COMPACT_CHARS && !isBadTopTitle(draftTitle)) {
    return { text: draftTitle, source: "draft-title" };
  }

  const candidates = [
    ["hpsl-hook", draft.hpsl?.hook?.narration],
    ["hpsl-point", draft.hpsl?.point?.narration],
    ["draft-title", draftTitle],
    ["script-first-sentence", firstSentence(draft.script)],
    ["source-value", sourceValue || job.sourceValue],
  ];

  for (const [source, value] of candidates) {
    const text = shortenAutoTitle(cleanTitle(value));
    if (text && !isBadTopTitle(text)) return { text, source };
  }

  return { text: "오늘의 핵심 진실", source: "default" };
}

function firstSentence(text = "") {
  return String(text).split(/(?<=[.!?。！？])\s*/u)[0] || "";
}

function cleanTitle(value = "") {
  return String(value)
    .split(/\r?\n/)
    .map((line) => line
      .replace(/https?:\/\/\S+/gi, "")
      .replace(/[{}\[\]<>]/g, "")
      .replace(/["'`]/g, "")
      .replace(/[^\S\r\n]+/g, " ")
      .trim()
    )
    .filter(Boolean)
    .join("\n");
}

function shortenAutoTitle(value = "") {
  const cleaned = trimTitleEnding(cleanTitle(value));
  if (!cleaned) return "";
  if (compactLength(cleaned) <= MAX_AUTO_TITLE_COMPACT_CHARS && !isBadTopTitle(cleaned)) return cleaned;

  const questionTitle = compactQuestionTitle(cleaned);
  if (questionTitle) return questionTitle;

  const keywordTitle = compactKeywordTitle(cleaned);
  if (keywordTitle && !isBadTopTitle(keywordTitle)) return keywordTitle;

  return trimToCompactLength(cleaned, MAX_AUTO_TITLE_COMPACT_CHARS);
}

function compactQuestionTitle(value = "") {
  const tokens = titleTokens(value);
  const questionToken = [...tokens].reverse().find((token) => /까|까요|나요|인가|일까|뭘까|왜/u.test(token));
  if (!questionToken) return "";
  const frontTokens = tokens
    .filter((token) => token !== questionToken)
    .map(stripParticle)
    .filter((token) => token.length >= 2)
    .filter((token) => !TITLE_STOP_WORDS.has(token));
  const picked = [];
  for (const token of frontTokens) {
    const candidate = [...picked, token, questionToken].join(" ");
    if (compactLength(candidate) <= MAX_AUTO_TITLE_COMPACT_CHARS) picked.push(token);
  }
  const title = [...picked.slice(-2), questionToken].join(" ").trim();
  return compactLength(title) <= MAX_AUTO_TITLE_COMPACT_CHARS ? title : "";
}

function compactKeywordTitle(value = "") {
  const tokens = titleTokens(value)
    .map(stripParticle)
    .filter((token) => token.length >= 2)
    .filter((token) => !TITLE_STOP_WORDS.has(token));
  const preferred = tokens.filter((token) => /나폴레옹|황제|키|조작|진실|역사|비밀|반전/u.test(token));
  const source = preferred.length ? preferred : tokens;
  const picked = [];
  for (const token of source) {
    const candidate = [...picked, token].join(" ");
    if (compactLength(candidate) > MAX_AUTO_TITLE_COMPACT_CHARS) break;
    picked.push(token);
  }
  return trimTitleEnding(picked.join(" "));
}

function titleTokens(value = "") {
  return cleanTitle(value)
    .replace(/[?!？！，,.:;|/\\]+/gu, " ")
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function stripParticle(value = "") {
  return String(value)
    .replace(/(입니다|습니다|했죠|하죠|인데요|인데|이에요|예요)$/u, "")
    .replace(/(으로|에서|에게|까지|부터|처럼|보다|만큼|는|은|이|가|을|를|의|로|과|와|도|만)$/u, "")
    .trim();
}

function trimTitleEnding(value = "") {
  return String(value)
    .replace(/(입니다|습니다|했죠|하죠|이에요|예요)[.!?。！？]*$/u, "")
    .replace(/[.!?。！？]+$/u, "")
    .trim();
}

function trimToCompactLength(value = "", maxCompactChars = MAX_AUTO_TITLE_COMPACT_CHARS) {
  const chars = Array.from(value);
  let result = "";
  for (const char of chars) {
    const next = result + char;
    if (compactLength(next) > maxCompactChars) break;
    result = next;
  }
  return trimTitleEnding(result);
}

function compactLength(value = "") {
  return Array.from(String(value).replace(/\s+/g, "")).length;
}

function isBadTopTitle(value = "") {
  return /우리\s*흔히|오늘은|이번에는|부릅니다|이야기해|확인합니다|뿜어져\s*나오/u.test(value);
}
