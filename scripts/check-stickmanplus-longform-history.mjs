#!/usr/bin/env node
import assert from "node:assert/strict";
import { getStylePreset } from "../electron/services/style-presets.mjs";
import { planLongformScenesFromDraft } from "../electron/services/longform-planner.mjs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const job = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "고대 로마의 작은 세금 실수는 도시 전체를 흔들었습니다. 사람들은 금화가 사라졌다고 믿었지만, 진짜 문제는 권력자들의 관리 실패였습니다.",
  options: {
    videoFormat: "longform",
    scriptLengthMode: "custom",
    customDurationSeconds: 720,
    stylePresetId: "stickmanplus",
    flowOutputMode: "hybrid",
    introVideoClipCount: 10,
  },
});

const draft = {
  title: "로마 세금 실수의 반전",
  script: job.sourceValue.repeat(20),
  structure: "LONGFORM_CHAPTERS",
};

const scenes = planLongformScenesFromDraft({
  job,
  draft,
  stylePreset: getStylePreset("stickmanplus"),
  characterSheet: {
    profileText: "photorealistic Korean male history presenter wearing a black suit",
  },
});

const prompt = scenes.slice(0, 12).map((scene) => scene.image_prompt).join("\n");
assert.match(prompt, /stickmanplus|stickman|whiteboard|comic/i);
assert.match(prompt, /castle|map|scroll|crown|coins|scales|timeline|court|battlefield|parchment/i);
assert.match(prompt, /symbolic stickman roles|historical props only|no readable text/i);
assert.doesNotMatch(prompt, /photorealistic Korean male history presenter|black suit/i);
assert.ok(scenes.some((scene) => scene.outputMode === "video"));
assert.ok(scenes.some((scene) => scene.outputMode === "image"));

console.log(JSON.stringify({ ok: true, checked: "stickmanplus-longform-history", sceneCount: scenes.length }));
