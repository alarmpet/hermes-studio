export function buildFlowThumbnailPrompt({ title, script, hpsl, aspectRatio = "9:16", visualContext = "", userOverlay = {} }) {
  const overlay = buildThumbnailOverlayPlan({ title, script, hpsl, userOverlay });
  const context = compactText([
    title,
    hpsl?.hook?.narration,
    hpsl?.point?.narration,
    visualContext,
    script,
  ].filter(Boolean).join(" "), 360);
  const canvas = aspectRatio === "16:9"
    ? "16:9 horizontal YouTube thumbnail background"
    : "9:16 vertical YouTube Shorts thumbnail background";

  return [
    `${canvas}.`,
    "Create one high-impact cinematic editorial thumbnail background image.",
    `Topic context: ${context}`,
    `Visual hook mood: ${overlay.hookMood}.`,
    "Show a clear central visual metaphor or dramatic moment that reflects the topic.",
    "Use strong contrast, expressive lighting, clean composition, and an empty dark area near the top for Hermes text overlay.",
    "No readable text, no subtitles, no captions, no logos, no brand marks, no watermarks.",
    "Avoid depicting identifiable real people; use generic roles, objects, environments, and symbolic B-roll.",
  ].join("\n");
}

export function buildThumbnailOverlayPlan({ title, script, hpsl, userOverlay = {} }) {
  const source = compactText([
    title,
    hpsl?.hook?.narration,
    hpsl?.point?.narration,
    script,
  ].filter(Boolean).join(" "), 520);
  const autoHeadline = makeHookHeadline(title || source);
  const hookHeadline = compactText(userOverlay.headlineText || autoHeadline, 32);
  const subheadline = compactText(userOverlay.subheadlineText || "", 36);
  const highlightKeywords = chooseHighlightKeywords(hookHeadline, source);

  return {
    enabled: userOverlay.enabled !== false,
    hookHeadline,
    subheadline,
    highlightKeywords,
    style: normalizeThumbnailOverlayStyle(userOverlay),
    hookMood: inferHookMood(source),
  };
}

export function normalizeThumbnailOverlayStyle(style = {}) {
  return {
    fontFamily: safeChoice(style.fontFamily, ["Malgun Gothic", "Pretendard", "Arial"], "Malgun Gothic"),
    fontWeight: clampInt(style.fontWeight, 500, 1000, 900),
    titleFontSize: clampInt(style.titleFontSize, 42, 140, 96),
    subFontSize: clampInt(style.subFontSize, 24, 80, 52),
    textColor: safeHex(style.textColor, "#ffffff"),
    highlightColor: safeHex(style.highlightColor, "#fde047"),
    backgroundColor: safeHex(style.backgroundColor, "#050505"),
    backgroundOpacity: clampNumber(style.backgroundOpacity, 0, 0.92, 0.72),
    outlineColor: safeHex(style.outlineColor, "#000000"),
    outlineWidth: clampInt(style.outlineWidth, 0, 16, 8),
    shadowOpacity: clampNumber(style.shadowOpacity, 0, 0.9, 0.45),
    positionYPercent: clampNumber(style.positionYPercent, 0, 55, 5.5),
    bandHeightPercent: clampNumber(style.bandHeightPercent, 12, 38, 22),
    maxLines: clampInt(style.maxLines, 1, 2, 2),
  };
}

function makeHookHeadline(value) {
  const text = compactText(value, 80)
    .replace(/[.!?。！？]+$/g, "")
    .replace(/입니다|합니다|했어요|이에요|예요$/g, "");
  const clean = text || "이 장면 놓치면 손해";
  return balanceHeadline(clean, 18);
}

function makeSubheadline(source, headline) {
  const withoutHeadline = compactText(source.replace(headline, ""), 120);
  if (/왜|충격|반전|비밀|주의|위험|변화/.test(withoutHeadline)) return balanceHeadline(withoutHeadline, 20);
  return "";
}

function chooseHighlightKeywords(headline, source) {
  const candidates = Array.from(new Set(`${headline} ${source}`.match(/[가-힣A-Za-z0-9]{2,12}/g) || []));
  const scored = candidates
    .filter((word) => !/그리고|하지만|오늘은|이제|있는지|합니다|입니다|대한|관련/.test(word))
    .map((word) => ({
      word,
      score: (/[A-Z0-9]/.test(word) ? 2 : 0)
        + (/AI|구글|삼성|애플|돈|요금|위험|충격|반전|비밀|주의|폭등|하락/i.test(word) ? 4 : 0)
        + Math.min(word.length, 8),
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((item) => item.word);
}

function inferHookMood(source) {
  if (/위험|주의|경고|논란|충격|폭락|사고/.test(source)) return "urgent warning";
  if (/비밀|반전|숨은|몰랐/.test(source)) return "mysterious reveal";
  if (/AI|기술|미래|혁신|구글|애플|삼성/.test(source)) return "futuristic curiosity";
  return "curiosity-driven reveal";
}

function balanceHeadline(value, maxChars) {
  const text = compactText(value, maxChars);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim();
}

function compactText(value, maxChars) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function safeHex(value, fallback) {
  const text = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(text) ? text : fallback;
}

function safeChoice(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function clampInt(value, min, max, fallback) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}
