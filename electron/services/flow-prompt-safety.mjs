const PUBLIC_FIGURE_REPLACEMENTS = [
  { pattern: /\bElon Musk\b/gi, replacement: "a tech company CEO" },
  { pattern: /\bDonald Trump\b/gi, replacement: "a former US president" },
  { pattern: /\bJoe Biden\b/gi, replacement: "a US political leader" },
  { pattern: /\bTaylor Swift\b/gi, replacement: "a famous pop singer" },
  { pattern: /\bBTS\s+Jungkook\b|\bJungkook\b|정국/gi, replacement: "a popular K-pop singer" },
  { pattern: /\bSon Heung-min\b|손흥민/gi, replacement: "a professional football player" },
  { pattern: /\bLee Jae-yong\b|이재용/gi, replacement: "a large technology company executive" },
];

const ROLE_HINTS = [
  "ceo", "founder", "president", "minister", "candidate", "politician", "actor", "singer",
  "athlete", "football player", "influencer", "journalist", "executive", "idol",
  "대표", "회장", "대통령", "장관", "후보", "정치인", "배우", "가수", "선수", "기자",
];

const GENERIC_LIKENESS_PATTERNS = [
  /\blooks like\b/i,
  /\bface of\b/i,
  /\bimpersonating\b/i,
  /\bdeepfake\b/i,
  /닮은/i,
  /실사\s*얼굴/i,
];

const FLOW_POLICY_WARNING_PATTERNS = [
  /유명인의\s*동영상\s*생성/i,
  /google\s*정책을\s*위반/i,
  /celebrity/i,
  /public\s*figure/i,
  /likeness/i,
];

export function isFlowPolicyWarningText(text = "") {
  return FLOW_POLICY_WARNING_PATTERNS.some((pattern) => pattern.test(String(text || "")));
}

export function sanitizeFlowPrompt(prompt = "", context = {}) {
  let output = String(prompt || "");
  const flags = [];
  const replacements = [];

  for (const rule of PUBLIC_FIGURE_REPLACEMENTS) {
    output = output.replace(rule.pattern, (match) => {
      flags.push("PUBLIC_FIGURE_REFERENCE");
      replacements.push({ from: match, to: rule.replacement });
      return rule.replacement;
    });
  }

  const contextText = [
    context.title,
    context.script,
    context.narration,
    context.characterProfile,
    output,
  ].filter(Boolean).join(" ");
  for (const name of dynamicPublicFigureCandidates(contextText)) {
    const role = inferGenericRole(contextText);
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
    output = output.replace(re, (match) => {
      flags.push("DYNAMIC_PUBLIC_FIGURE_CANDIDATE");
      replacements.push({ from: match, to: role });
      return role;
    });
  }

  for (const pattern of GENERIC_LIKENESS_PATTERNS) {
    if (pattern.test(output)) {
      flags.push("LIKENESS_LANGUAGE");
      output = output.replace(pattern, "generic non-identifiable appearance");
    }
  }

  const safetySuffix = [
    "Do not depict any identifiable real public figure, celebrity, politician, athlete, influencer, or named private person.",
    "Use only fictional, anonymous, non-identifiable people or symbolic B-roll.",
    "Avoid faces when the story involves a real person; show objects, locations, silhouettes, hands, crowds, devices, charts, or contextual scenes instead.",
    "No logos, no readable text, no subtitles, no watermarks.",
  ].join(" ");

  const compact = `${output} ${safetySuffix}`.replace(/\s+/g, " ").trim();

  return {
    prompt: compact,
    changed: replacements.length > 0 || flags.length > 0 || compact !== String(prompt || "").trim(),
    flags: Array.from(new Set(flags)),
    replacements,
    context: {
      title: context.title || "",
      sceneOrder: context.sceneOrder || 0,
      visualCategory: context.visualCategory || "",
    },
  };
}

export function buildFlowSafeFallbackPrompt({ title = "", narration = "", visualCategory = "", sceneOrder = 1 } = {}) {
  return sanitizeFlowPrompt([
    "9:16 cinematic YouTube shorts B-roll scene.",
    visualCategory ? `Visual category: ${visualCategory}.` : "",
    `Topic context: ${title}.`,
    `Narration meaning: ${narration}.`,
    "Show symbolic, non-identifiable visuals that explain the story: objects, hands, environments, blurred crowd, newsroom desk, device close-ups, charts without readable text, or location exterior.",
    "Use anonymous fictional people only if needed, filmed from behind or in silhouette.",
    "Dynamic close-up to medium shot, realistic lighting, smooth camera movement.",
  ].filter(Boolean).join(" "), { title, narration, sceneOrder, visualCategory });
}

function inferGenericRole(text = "") {
  const lower = String(text || "").toLowerCase();
  if (/ceo|founder|executive|대표|회장/.test(lower)) return "a technology company executive";
  if (/president|minister|candidate|politician|대통령|장관|후보|정치인/.test(lower)) return "a public official";
  if (/singer|actor|idol|가수|배우|아이돌/.test(lower)) return "an entertainment industry figure";
  if (/athlete|football player|선수/.test(lower)) return "a professional athlete";
  if (/journalist|기자/.test(lower)) return "a journalist";
  return "a public figure";
}

function dynamicPublicFigureCandidates(contextText = "") {
  const text = String(contextText || "");
  const candidates = new Set();
  const latinNames = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g) || [];
  for (const name of latinNames) {
    if (/^(Google Flow|YouTube Shorts|Visual|Scene|Topic|Narration)$/i.test(name)) continue;
    const index = text.indexOf(name);
    const windowText = text.slice(Math.max(0, index - 80), index + name.length + 80);
    const lowerWindow = windowText.toLowerCase();
    if (ROLE_HINTS.some((hint) => lowerWindow.includes(hint))) candidates.add(name);
  }
  return Array.from(candidates);
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
