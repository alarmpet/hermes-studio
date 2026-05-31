import { SCRIPT_LENGTH_PRESETS } from "../../youtube-job-schema.mjs";
import { getStylePreset } from "./style-presets.mjs";
import { planScenesFromScript } from "./script-planner.mjs";

export function buildDirectScriptDraft(job) {
  const script = String(job?.sourceValue || "").trim();
  if (!script) throw new Error("Direct script input is empty.");
  const preset = SCRIPT_LENGTH_PRESETS[job.options.scriptLengthPreset] || SCRIPT_LENGTH_PRESETS.standard;
  const targetSeconds = job.options.scriptLengthMode === "custom"
    ? Number(job.options.customDurationSeconds || preset.targetSeconds)
    : preset.targetSeconds;
  const title = inferTitle(script);
  const characterProfile = job.options.characterSheet?.profileText || "";
  const stylePreset = job.options.stylePreset?.promptSuffix
    ? job.options.stylePreset
    : getStylePreset(job.options.stylePresetId);
  const scenes = planScenesFromScript({
    script,
    title,
    targetSeconds,
    customDurationSeconds: targetSeconds,
    characterProfile,
    stylePreset,
    characterSheet: job.options.characterSheet,
    flowOutputMode: job.options.flowOutputMode || "video",
    hybridIntroVideoSceneCount: job.options.hybridIntroVideoSceneCount,
  });
  const guardedScenes = addHybridHookNarrationWarnings({
    scenes,
    flowOutputMode: job.options.flowOutputMode || "video",
    hybridIntroVideoSceneCount: job.options.hybridIntroVideoSceneCount,
  });
  return {
    title,
    structure: "direct-script",
    duration_seconds: targetSeconds,
    character_profile: characterProfile,
    script,
    scenes: guardedScenes,
  };
}

function addHybridHookNarrationWarnings({ scenes = [], flowOutputMode = "video", hybridIntroVideoSceneCount = 2 } = {}) {
  if (flowOutputMode !== "hybrid") return scenes;
  const introCount = Math.max(0, Math.min(10, Math.round(Number(hybridIntroVideoSceneCount ?? 2))));
  return scenes.map((scene) => {
    if ((scene.order || 1) > introCount || scene.outputMode !== "video") return scene;
    const narrationLength = String(scene.narration || "").replace(/\s+/g, "").length;
    if (narrationLength <= 35) return scene;
    return {
      ...scene,
      hybrid_hook_narration_warning: {
        code: "HYBRID_HOOK_NARRATION_LONG",
        message: "Opening video scenes work best when narration is under 35 Korean characters.",
        narrationLength,
        recommendedMax: 35,
      },
    };
  });
}

function inferTitle(script) {
  const first = script.split(/[.!?\n]/).map((item) => item.trim()).find(Boolean) || "Direct script";
  return first.slice(0, 40);
}
