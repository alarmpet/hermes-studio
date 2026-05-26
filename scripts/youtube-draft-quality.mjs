const PLACEHOLDER_PATTERN = /\b(string|Korean narration|Korean sentence|English stable character profile|topic-specific object\/person\/place|what viewer should understand visually)\b/i;

function normalizeText(text = "") {
  return String(text)
    .replace(/\s+/g, " ")
    .trim();
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

function includesMostOfScript(sceneText = "", script = "") {
  const scene = compactHangul(sceneText);
  const full = compactHangul(script);
  if (!scene || !full || full.length < 10) return false;
  if (scene.includes(full) || full.includes(scene)) {
    return scene.length / Math.max(1, full.length) >= 0.8;
  }
  return jaccardSimilarity(sceneText, script) >= 0.8;
}

export function validateDraftQuality({ draft = {}, stage = "", jobDir = "" } = {}) {
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

  const hpslResult = validateHpslStructure(draft, stage, jobDir);
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

function validateHpslStructure(draft = {}, stage = "", jobDir = "") {
  if (String(draft.structure || "").toUpperCase() !== "HPSL") {
    return { ok: true };
  }
  const required = ["hook", "point", "story", "lesson"];
  for (const sectionName of required) {
    const section = draft.hpsl?.[sectionName];
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
