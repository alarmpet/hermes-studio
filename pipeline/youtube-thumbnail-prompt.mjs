export function buildFlowThumbnailPrompt({
  title,
  script,
  hpsl,
  aspectRatio = "9:16",
  visualContext = "",
  userOverlay = {},
  stylePresetId = "",
  stylePreset = {},
}) {
  const overlay = buildThumbnailOverlayPlan({ title, script, hpsl, userOverlay, stylePresetId, stylePreset });
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

  const styleInstruction = overlay.styleMode === "match-video"
    ? "Match the video's visual style. For stickman, whiteboard, cartoon, flat, or vector presets, use a flat explainer thumbnail background instead of cinematic realism."
    : "Use cinematic editorial realism as an intentional thumbnail contrast when it fits the video topic.";

  return [
    `${canvas}.`,
    "Create one high-impact cinematic editorial thumbnail background image.",
    `Topic context: ${context}`,
    `Visual hook mood: ${overlay.hookMood}.`,
    styleInstruction,
    "Show a clear central visual metaphor or dramatic moment that reflects the topic.",
    "Use strong contrast, expressive lighting, clean composition, and an empty dark area near the top for Hermes text overlay.",
    "No readable text, no subtitles, no captions, no logos, no brand marks, no watermarks.",
    "Avoid depicting identifiable real people; use generic roles, objects, environments, and symbolic B-roll.",
  ].join("\n");
}

export function buildThumbnailOverlayPlan({ title, script, hpsl, userOverlay = {}, stylePresetId = "", stylePreset = {} }) {
  const source = compactText([
    title,
    hpsl?.hook?.narration,
    hpsl?.point?.narration,
    script,
  ].filter(Boolean).join(" "), 520);
  const autoHeadline = makeHookHeadline(title || source, source);
  const hookHeadline = compactText(userOverlay.headlineText || autoHeadline, 32);
  const subheadline = compactText(userOverlay.subheadlineText || "", 36);
  const highlightKeywords = chooseHighlightKeywords(hookHeadline, source);
  const styleModeInfo = inferThumbnailStyleMode({ stylePresetId, stylePreset, userOverlay });

  return {
    enabled: userOverlay.enabled !== false,
    hookHeadline,
    subheadline,
    highlightKeywords,
    style: normalizeThumbnailOverlayStyle(userOverlay),
    styleMode: styleModeInfo.mode,
    videoStyleFamily: styleModeInfo.videoStyleFamily,
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

const GENERIC_TITLE_PATTERNS = [
  /^(우리는|사람들은|요즘|지금|오늘|이제|왜|어떻게|무엇이|진짜|이게|그게|이것이|그것이)\b/,
  /(이렇게|이게|그게|됐을까요|될까요|배웠죠|난리입니다|알고 있나요|궁금합니다)$/i,
];

const STOPWORDS = new Set([
  "그리고",
  "하지만",
  "때문입니다",
  "때문에",
  "됩니다",
  "입니다",
  "합니다",
  "있습니다",
  "있죠",
  "이유는",
  "진짜",
  "요즘",
  "오늘",
  "지금",
  "우리",
  "우리는",
  "사람들",
]);

const DOMAIN_KEYWORDS = [
  "AI",
  "GPU",
  "CUDA",
  "반도체",
  "생태계",
  "전환",
  "금리",
  "채권",
  "시장",
  "유동성",
  "콜럼버스",
  "항해",
  "거리",
  "계산",
  "착오",
  "역사",
  "위험",
  "반전",
  "증명",
];

function makeHookHeadline(value, source = "") {
  const title = cleanSentence(value);
  const context = compactText(`${title} ${source}`, 520);
  const keywords = extractTopicKeywords(context);

  if (isGenericHeadline(title) && keywords.length >= 2) {
    return balanceHeadline(`${keywords[0]}의 진짜 이유`, 18);
  }

  const contrast = findContrastHook(context, keywords);
  if (contrast) return balanceHeadline(contrast, 18);

  const clean = title || (keywords.length ? `${keywords[0]}의 숨은 변수` : "결말을 바꾼 한 수");
  return balanceHeadline(clean, 18);
}

function cleanSentence(value) {
  return compactText(value, 80)
    .replace(/[.!?。！？]+$/g, "")
    .replace(/(입니다|합니다|이에요|예요|됐을까요|될까요)$/g, "")
    .trim();
}

function isGenericHeadline(value) {
  const text = compactText(value, 80);
  if (!text) return true;
  return GENERIC_TITLE_PATTERNS.some((pattern) => pattern.test(text));
}

function extractTopicKeywords(source) {
  const directHits = DOMAIN_KEYWORDS.filter((word) => new RegExp(escapeRegex(word), "i").test(source));
  const tokens = Array.from(source.matchAll(/[\p{L}\p{N}]{2,14}/gu), (match) => match[0])
    .filter((word) => !STOPWORDS.has(word))
    .filter((word) => !/^(으로|에서|에게|보다|라는|이다|아니라|핵심|기대|커질수록)$/.test(word));

  return Array.from(new Set([...directHits, ...tokens])).slice(0, 8);
}

function findContrastHook(source, keywords) {
  if (!keywords.length) return "";
  if (/아니라|보다|착오|반전|오해|숨은|진짜|핵심/.test(source)) {
    const first = keywords[0];
    const second = keywords.find((word) => word !== first && word.length <= 8);
    return second ? `${first}, 핵심은 ${second}` : `${first}의 숨은 핵심`;
  }
  return "";
}

function chooseHighlightKeywords(headline, source) {
  const candidates = Array.from(new Set([
    ...extractTopicKeywords(`${headline} ${source}`),
    ...(`${headline} ${source}`.match(/[\p{L}\p{N}]{2,12}/gu) || []),
  ]));
  const scored = candidates
    .filter((word) => !STOPWORDS.has(word))
    .map((word) => ({
      word,
      score: (/[A-Z0-9]/.test(word) ? 2 : 0)
        + (DOMAIN_KEYWORDS.some((keyword) => keyword.toLowerCase() === word.toLowerCase()) ? 4 : 0)
        + Math.min(word.length, 8),
    }))
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map((item) => item.word);
}

function inferHookMood(source) {
  if (/위험|주의|경고|충격|폭락|사고|흔들/.test(source)) return "urgent warning";
  if (/금리|채권|시장|유동성|투자|환율|주가/.test(source)) return "market tension reveal";
  if (/비밀|반전|오해|숨은|착오|진짜|핵심/.test(source)) return "mysterious reveal";
  if (/역사|콜럼버스|항해|제국|전쟁|왕조|근대/.test(source)) return "educational reveal";
  if (/AI|GPU|CUDA|기술|미래|혁신|반도체|플랫폼/.test(source)) return "futuristic curiosity";
  return "curiosity-driven reveal";
}

function inferThumbnailStyleMode({ stylePresetId = "", stylePreset = {}, userOverlay = {} } = {}) {
  const styleText = [
    stylePresetId,
    stylePreset.id,
    stylePreset.label,
    stylePreset.aesthetic,
    stylePreset.promptSuffix,
  ].filter(Boolean).join(" ").toLowerCase();
  const videoStyleFamily = /stickman|whiteboard|cartoon|flat|vector/.test(styleText)
    ? "flat-explainer"
    : "cinematic";
  return {
    mode: userOverlay.styleMode || (videoStyleFamily === "flat-explainer" ? "match-video" : "cinematic-contrast"),
    videoStyleFamily,
  };
}

function balanceHeadline(value, maxChars) {
  const text = compactText(value, maxChars);
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars).trim();
}

function compactText(value, maxChars) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
