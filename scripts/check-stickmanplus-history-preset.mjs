#!/usr/bin/env node
import assert from "node:assert/strict";
import { getStylePreset } from "../electron/services/style-presets.mjs";
import { planScenesFromScript } from "../electron/services/script-planner.mjs";

const preset = getStylePreset("stickmanplus");

assert.equal(preset.id, "stickmanplus");
assert.equal(preset.label, "StickmanPlus History");
assert.match(preset.aesthetic, /stickman|flat vector|history|explainer/i);
assert.match(preset.promptSuffix, /castle|map|scroll|crown|timeline|coins|arrows|whiteboard|comic/i);
assert.match(preset.characterContinuity, /round white head|dot eyes|consistent/i);
assert.match(preset.worldContinuity, /beige|parchment|thick black outline|muted/i);
assert.match(preset.negativePrompt, /no readable text|no logos|no photorealistic|no real faces/i);
assert.ok(preset.preferredOutputModes.includes("image"), "stickmanplus should support image mode");

const scenes = planScenesFromScript({
  title: "나폴레옹 키 조작의 진실",
  script: "사람들은 나폴레옹이 키가 작았다고 믿었습니다. 하지만 실제 기록은 전혀 다른 이야기를 보여줍니다. 이 오해는 영국 풍자화와 단위 차이에서 시작됐습니다.",
  targetSeconds: 45,
  flowOutputMode: "image",
  stylePreset: preset,
  characterProfile: "same realistic Korean presenter in a teal blazer",
});

const prompt = scenes.map((scene) => scene.image_prompt).join("\n");
assert.match(prompt, /stickmanplus|stickman|whiteboard|flat vector|comic/i);
assert.match(prompt, /castle|map|scroll|crown|timeline|coins|arrows|magnifying glass|court|battlefield|parchment/i);
assert.match(prompt, /Output mode: image/i);
assert.match(prompt, /no readable text/i);
assert.doesNotMatch(prompt, /same realistic Korean presenter|teal blazer/i);
assert.doesNotMatch(prompt, /Napoleon Bonaparte's exact face|photorealistic emperor/i);

console.log(JSON.stringify({ ok: true, checked: "stickmanplus-history-preset", sceneCount: scenes.length }));
