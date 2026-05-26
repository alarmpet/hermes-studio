#!/usr/bin/env node
import assert from "node:assert/strict";
import { planScenesFromScript } from "../electron/services/script-planner.mjs";

const scenes = planScenesFromScript({
  title: "구글 글래스의 귀환",
  script: "구글 글래스가 다시 주목받고 있습니다. 현장 작업자는 눈앞에서 매뉴얼을 보고, 의사는 수술 정보를 확인하고, 여행자는 길 안내를 바로 볼 수 있습니다. 하지만 개인정보와 촬영 알림 문제도 함께 해결해야 합니다.",
  targetSeconds: 45,
  characterProfile: "same Korean tech reporter in her early 30s, black bob haircut, teal blazer",
  flowOutputMode: "video",
  stylePreset: {
    aesthetic: "cinematic tech news",
    characterContinuity: "same Korean tech reporter identity, age, wardrobe, and body type",
    worldContinuity: "same newsroom-meets-field-report visual language",
    negativePrompt: "no readable text, no logos, no watermarks",
  },
});

assert.ok(scenes.length >= 3, "script should be split into multiple visual beats");

for (const scene of scenes) {
  assert.match(scene.image_prompt, /Visual goal:/, "prompt should contain a visual goal");
  assert.match(scene.image_prompt, /Action:/, "prompt should contain an action");
  assert.match(scene.image_prompt, /Camera:/, "prompt should contain camera direction");
  assert.match(scene.image_prompt, /GLOBAL STYLE LOCK/i, "scene prompt should include a global style lock");
  assert.match(scene.image_prompt, /Character continuity/i, "scene prompt should include character continuity");
  assert.match(scene.image_prompt, /World continuity/i, "scene prompt should include world continuity");
  assert.match(scene.image_prompt, /Negative constraints/i, "scene prompt should include negative constraints");
  assert.match(scene.image_prompt, /Scene keywords:/, "prompt should include narration-derived scene keywords to avoid repeated generic B-roll");
  assert.match(scene.image_prompt, /No talking head|avoid a person simply speaking/i, "prompt should avoid plain presenter reading");
  assert.doesNotMatch(scene.image_prompt, /Narration context:.*No subtitles/s, "prompt should not be the old generic narration-context template");
}

const combined = scenes.map((scene) => scene.image_prompt).join("\n");
assert.match(combined, /smart glasses|augmented reality|AR|heads-up display/i, "prompts should reflect Google Glass / AR keywords");
assert.match(combined, /worksite|doctor|travel|navigation|manual|privacy|camera/i, "prompts should turn script ideas into concrete visual situations");
assert.equal(new Set(scenes.map((scene) => scene.image_prompt)).size, scenes.length, "each scene prompt should be unique even when the environment template cycles");

const publicFigureScenes = planScenesFromScript({
  title: "Elon Musk AI company news",
  script: "Elon Musk announced a new AI company. Investors are watching the technology race change.",
  targetSeconds: 30,
  characterProfile: "same Korean tech reporter in her early 30s, black bob haircut, teal blazer",
});

const publicFigurePrompts = publicFigureScenes.map((scene) => scene.image_prompt).join("\n");
assert.doesNotMatch(publicFigurePrompts, /Elon Musk/i, "Flow prompts must not include famous person names");
assert.match(publicFigurePrompts, /tech company CEO|public figure|anonymous|symbolic|technology company executive/i, "Flow prompts should use generic roles and safe B-roll");
assert.ok(publicFigureScenes.some((scene) => scene.flow_prompt_safety?.changed), "scene should record safety rewrite metadata");

const stickmanScenes = planScenesFromScript({
  title: "simple AI explainer",
  script: "AI agents can split a large task into smaller steps. Each step can be checked before the next one begins.",
  targetSeconds: 30,
  flowOutputMode: "image",
  stylePreset: {
    aesthetic: "minimal black stickman explainer animation on a clean whiteboard canvas",
    characterContinuity: "same simple stickman proportions, round head, thin black limbs, consistent line thickness",
    worldContinuity: "same whiteboard canvas, same black line weight, same single accent color",
    negativePrompt: "no realistic humans, no photorealistic faces, no readable text, no logos, no watermarks",
  },
});

const stickmanPrompt = stickmanScenes.map((scene) => scene.image_prompt).join("\n");
assert.match(stickmanPrompt, /stickman|whiteboard/i, "stickman scene should retain stickman style");
assert.match(stickmanPrompt, /Output mode: image/i, "image mode prompt should be explicit");
assert.doesNotMatch(stickmanPrompt, /photorealistic people/i, "stickman scene should block realistic human drift");

console.log(JSON.stringify({ ok: true, checked: "visual-storytelling-prompts" }));
