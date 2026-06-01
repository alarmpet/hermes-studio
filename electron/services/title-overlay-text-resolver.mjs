const MAX_AUTO_TITLE_COMPACT_CHARS = 18;

const TITLE_STOP_WORDS = new Set([
  "내",
  "나의",
  "오늘",
  "이번",
  "이제",
  "바로",
  "정말",
  "진짜",
  "알고",
  "계셨나요",
  "이유",
]);

export function resolveTitleOverlayText({ job = {}, draft = {}, sourceValue = "" } = {}) {
  const options = job.options || {};
  const manualText = cleanTitle(options.titleOverlayText || "");
  if (options.titleOverlayMode === "manual" && manualText) {
    return { text: manualText.slice(0, 80), source: "manual" };
  }

  const candidates = [
    ["draft-title", draft.title],
    ["hpsl-hook", draft.hpsl?.hook?.narration],
    ["hpsl-point", draft.hpsl?.point?.narration],
    ["script-first-sentence", firstSentence(draft.script)],
    ["source-value", sourceValue || job.sourceValue],
  ];

  for (const [source, value] of candidates) {
    const text = shortenAutoTitle(cleanTitle(value));
    if (text) return { text, source };
  }

  return { text: "오늘의 핵심 이야기", source: "default" };
}

function firstSentence(text = "") {
  return String(text).split(/(?<=[.!?。！？]|다\.)\s*/u)[0] || "";
}

function cleanTitle(value = "") {
  return String(value)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[{}\[\]<>]/g, "")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenAutoTitle(value = "") {
  const cleaned = trimTitleEnding(cleanTitle(value));
  if (!cleaned) return "";
  if (compactLength(cleaned) <= MAX_AUTO_TITLE_COMPACT_CHARS) return cleaned;

  const compactQuestion = compactQuestionTitle(cleaned);
  if (compactQuestion) return compactQuestion;

  const keywordTitle = compactKeywordTitle(cleaned);
  if (keywordTitle) return keywordTitle;

  return trimToCompactLength(cleaned, MAX_AUTO_TITLE_COMPACT_CHARS);
}

function compactQuestionTitle(value = "") {
  const tokens = titleTokens(value);
  const questionToken = [...tokens].reverse().find((token) => /까$|까요$|나$|나요$|까\?$/u.test(token));
  if (!questionToken) return "";

  const frontTokens = tokens
    .filter((token) => token !== questionToken)
    .filter((token) => !TITLE_STOP_WORDS.has(stripParticle(token)))
    .filter((token) => stripParticle(token).length >= 2);
  const picked = [];
  for (const token of frontTokens) {
    const candidate = [...picked, stripParticle(token), questionToken].join(" ");
    if (compactLength(candidate) <= MAX_AUTO_TITLE_COMPACT_CHARS) picked.push(stripParticle(token));
  }
  const title = [...picked.slice(-2), questionToken].join(" ").trim();
  return compactLength(title) <= MAX_AUTO_TITLE_COMPACT_CHARS ? title : "";
}

function compactKeywordTitle(value = "") {
  const tokens = titleTokens(value)
    .map(stripParticle)
    .filter((token) => token.length >= 2)
    .filter((token) => !TITLE_STOP_WORDS.has(token));
  const picked = [];
  for (const token of tokens) {
    const candidate = [...picked, token].join(" ");
    if (compactLength(candidate) > MAX_AUTO_TITLE_COMPACT_CHARS) break;
    picked.push(token);
  }
  return trimTitleEnding(picked.join(" "));
}

function titleTokens(value = "") {
  return cleanTitle(value)
    .replace(/[?!。！？.,:;|/\\]+/gu, " ")
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(Boolean);
}

function stripParticle(value = "") {
  return String(value)
    .replace(/(입니다|습니다|했죠|하죠|합니다|됩니다|이에요|예요)$/u, "")
    .replace(/(으로|에서|에게|까지|부터|처럼|보다|만큼|인데요|인데|은|는|이|가|을|를|의|에|로|와|과|도|만)$/u, "")
    .trim();
}

function trimTitleEnding(value = "") {
  return String(value)
    .replace(/(입니다|습니다|했죠|하죠|합니다|됩니다|이에요|예요)[.!?。！？]?$/u, "")
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
