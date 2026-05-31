const PLACEHOLDER_PATTERN = /\b(string|Korean narration|Korean sentence|English stable character profile|topic-specific object\/person\/place|what viewer should understand visually)\b/i;

function normalizeText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
}

function countMatches(text = "", pattern) {
  return Array.from(String(text || "").matchAll(pattern)).length;
}

function detectCorruptedKorean(text = "") {
  const value = normalizeText(text);
  const length = Array.from(value).length;
  const hangulCount = countMatches(value, /[\uac00-\ud7af]/gu);
  const hangulRatio = hangulCount / Math.max(1, length);
  if (length < 30) {
    return {
      hangulCount,
      hangulRatio: Number(hangulRatio.toFixed(3)),
      mojibakeCount: 0,
      questionClusterCount: 0,
      corrupted: false,
    };
  }
  const mojibakeCount = countMatches(value, /[\u5360\u63f6\u7b4c\u91ce\uf9cf\u0080\ufffd]|[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/gu);
  const questionClusterCount = countMatches(value, /\?{3,}/g);
  return {
    hangulCount,
    hangulRatio: Number(hangulRatio.toFixed(3)),
    mojibakeCount,
    questionClusterCount,
    corrupted: (
      (mojibakeCount >= 3 && hangulRatio < 0.35)
      || (mojibakeCount >= 8 && questionClusterCount >= 2)
      || (questionClusterCount >= 4 && hangulRatio < 0.15)
      || (hangulCount < 4 && length > 30)
    ),
  };
}

function textSet(text = "") {
  return new Set(normalizeText(text).toLowerCase().split(/\s+/).filter(Boolean));
}

export function jaccardSimilarity(a = "", b = "") {
  const left = textSet(a);
  const right = textSet(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) intersection += 1;
  }
  return intersection / Math.max(1, left.size + right.size - intersection);
}

function compactHangul(text = "") {
  return normalizeText(text).replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

function cleanJosa(token = "") {
  return String(token)
    .replace(/(?:으로|로|에서|에게|한테|와|과|을|를|이|가|은|는|의|도|만|에)$/u, "")
    .trim();
}

function requiredKeywordTokens(sourceValue = "") {
  const stopwords = new Set([
    "최신",
    "소식",
    "뉴스",
    "이슈",
    "기사",
    "정리",
    "요약",
    "영상",
    "유튜브",
    "분석",
  ]);
  return String(sourceValue || "")
    .split(/\s+/)
    .map((token) => cleanJosa(token.trim()))
    .filter((token) => token.length >= 2)
    .filter((token) => !stopwords.has(token.toLowerCase()));
}

function keywordAliases(token = "") {
  const value = token.toLowerCase();
  const aliases = new Set([value]);
  if (value === "gemini" || value === "제미나이") {
    aliases.add("gemini");
    aliases.add("제미나이");
  }
  return Array.from(aliases);
}

function includesMostOfScript(sceneText = "", script = "") {
  const scene = compactHangul(sceneText);
  const full = compactHangul(script);
  if (!scene || !full || full.length < 10) return false;
  if (scene.includes(full) || full.includes(scene)) {
    return scene.length / Math.max(1, full.length) >= 0.8;
  }
  return jaccardSimilarity(sceneText, script) >= 0.8;
}

export function validateDraftQuality({ draft = {}, job = {}, stage = "", jobDir = "" } = {}) {
  const scenes = Array.isArray(draft.scenes) ? draft.scenes : [];
  const combined = [
    draft.title,
    draft.script,
    draft.character_profile,
    ...scenes.flatMap((scene) => [
      scene?.narration,
      scene?.visual_intent,
      scene?.main_subject,
      scene?.action,
      scene?.setting,
      scene?.image_prompt,
    ]),
  ].map(normalizeText).join(" ");

  if (!normalizeText(draft.script) || !scenes.length) {
    return {
      ok: false,
      failureCode: "EMPTY_DRAFT",
      reason: "Draft must include script and at least one scene.",
      stage,
      jobDir,
    };
  }

  if (PLACEHOLDER_PATTERN.test(combined)) {
    return {
      ok: false,
      failureCode: "PLACEHOLDER_DRAFT",
      reason: "Draft contains schema placeholder text instead of usable video content.",
      stage,
      jobDir,
    };
  }

  const language = detectCorruptedKorean([
    draft.title,
    draft.script,
    ...scenes.map((scene) => scene?.narration),
  ].join(" "));
  if (language.corrupted) {
    return {
      ok: false,
      failureCode: "CORRUPTED_KOREAN_DRAFT",
      reason: "Draft Korean text appears corrupted or mojibake.",
      stage,
      jobDir,
      language,
    };
  }

  if (job?.sourceType === "keyword") {
    const requiredTokens = requiredKeywordTokens(job.sourceValue);
    const haystack = normalizeText([
      draft.title,
      draft.script,
      ...scenes.map((scene) => scene?.narration),
    ].join(" ")).toLowerCase();
    const missingTokens = requiredTokens.filter((token) => (
      !keywordAliases(token).some((alias) => haystack.includes(alias.toLowerCase()))
    ));
    if (missingTokens.length) {
      return {
        ok: false,
        failureCode: "SOURCE_GROUNDING_MISMATCH",
        reason: `Draft does not include required keyword subject: ${missingTokens.join(", ")}`,
        missingTokens,
        stage,
        jobDir,
      };
    }
  }

  const hpslResult = validateHpslStructure(draft, stage, jobDir, job);
  if (!hpslResult.ok) return hpslResult;

  const qualityWarnings = [];
  for (const scene of scenes) {
    const narration = normalizeText(scene?.narration);
    const order = Number(scene?.order || scenes.indexOf(scene) + 1);
    if (includesMostOfScript(narration, draft.script)) {
      return {
        ok: false,
        failureCode: "DUPLICATE_FULL_SCRIPT_SCENE",
        reason: `Scene ${order} repeats most of the full script.`,
        failedSceneOrder: order,
        duplicateSimilarity: Number(jaccardSimilarity(narration, draft.script).toFixed(3)),
        stage,
        jobDir,
      };
    }
    if (Array.from(narration).length > 80) {
      qualityWarnings.push({
        code: "LONG_SCENE_NARRATION",
        sceneOrder: order,
        length: Array.from(narration).length,
        message: `Scene ${order} narration is long for a single Flow clip.`,
      });
    }
    const prompt = normalizeText(scene?.image_prompt);
    if ((job?.options?.aspectRatio || "9:16") === "9:16" && /aspect ratio 16:9|\b16:9\b/i.test(prompt) && !/9:16/i.test(prompt)) {
      return {
        ok: false,
        failureCode: "FLOW_PROMPT_ASPECT_MISMATCH",
        reason: `Scene ${order} prompt requests 16:9 for a 9:16 job.`,
        failedSceneOrder: order,
        stage,
        jobDir,
      };
    }
  }

  for (let index = 1; index < scenes.length; index += 1) {
    const previous = normalizeText(scenes[index - 1]?.narration);
    const current = normalizeText(scenes[index]?.narration);
    const similarity = jaccardSimilarity(previous, current);
    if (previous && current && similarity >= 0.9) {
      return {
        ok: false,
        failureCode: "DUPLICATE_ADJACENT_SCENE",
        reason: `Scenes ${index} and ${index + 1} are too similar.`,
        failedSceneOrder: index + 1,
        duplicateSimilarity: Number(similarity.toFixed(3)),
        stage,
        jobDir,
      };
    }
  }

  return {
    ok: true,
    stage,
    jobDir,
    qualityWarnings,
  };
}

function validateHpslStructure(draft = {}, stage = "", jobDir = "", job = {}) {
  const hasScriptStructureContract = typeof job?.options?.scriptStructure === "string";
  const expectsHpsl = hasScriptStructureContract && String(job.options.scriptStructure).toLowerCase() === "hpsl";
  if (expectsHpsl && String(draft.structure || "").toUpperCase() !== "HPSL") {
    return {
      ok: false,
      failureCode: "HPSL_STRUCTURE_MISMATCH",
      reason: `Expected HPSL draft but got "${draft.structure || "missing"}".`,
      stage,
      jobDir,
    };
  }
  if (String(draft.structure || "").toUpperCase() !== "HPSL") {
    return { ok: true };
  }
  const required = ["hook", "point", "story", "lesson"];
  for (const sectionName of required) {
    const section = draft.hpsl?.[sectionName];
    if (!section || typeof section !== "object" || Array.isArray(section)) {
      return {
        ok: false,
        failureCode: "HPSL_SECTION_MISSING",
        reason: `HPSL section "${sectionName}" must be an object with narration and target_seconds.`,
        missingSection: sectionName,
        stage,
        jobDir,
      };
    }
    if (!normalizeText(section?.narration) || !(Number(section?.target_seconds) > 0)) {
      return {
        ok: false,
        failureCode: "HPSL_SECTION_MISSING",
        reason: `HPSL section "${sectionName}" must include narration and positive target_seconds.`,
        missingSection: sectionName,
        stage,
        jobDir,
      };
    }
  }
  return { ok: true };
}

export function assertDraftQuality(args = {}) {
  const result = validateDraftQuality(args);
  if (!result.ok) {
    const error = new Error(`Draft QA failed: ${result.reason}`);
    error.code = result.failureCode;
    error.qa = result;
    throw error;
  }
  return result;
}
