#!/usr/bin/env node
import assert from "node:assert/strict";
import { assignSceneOutputModes } from "../electron/services/scene-output-mode-policy.mjs";
import { planScenesFromScript } from "../electron/services/script-planner.mjs";

const scenes = [
  { order: 1, narration: "Hook one." },
  { order: 2, narration: "Hook two." },
  { order: 3, narration: "Point." },
  { order: 4, narration: "Lesson." },
];

assert.deepEqual(assignSceneOutputModes({ scenes, flowOutputMode: "video", hybridIntroVideoSceneCount: 2 }).map((scene) => scene.outputMode), ["video", "video", "video", "video"]);
assert.deepEqual(assignSceneOutputModes({ scenes, flowOutputMode: "image", hybridIntroVideoSceneCount: 2 }).map((scene) => scene.outputMode), ["image", "image", "image", "image"]);
assert.deepEqual(assignSceneOutputModes({ scenes, flowOutputMode: "hybrid", hybridIntroVideoSceneCount: 2 }).map((scene) => scene.outputMode), ["video", "video", "image", "image"]);
const autoModes = assignSceneOutputModes({ scenes, flowOutputMode: "auto", hybridIntroVideoSceneCount: 2, targetSeconds: 60 }).map((scene) => scene.outputMode);
assert.equal(autoModes[0], "video");
assert.ok(autoModes.includes("image"), "Auto mode should not turn every shortform scene into video");

const planned = planScenesFromScript({
  script: Array.from({ length: 16 }, (_, index) => `${index + 1}번째 문장입니다`).join(". ") + ".",
  title: "테스트",
  targetSeconds: 30,
  flowOutputMode: "hybrid",
  hybridIntroVideoSceneCount: 1,
});
assert.equal(planned[0].outputMode, "video");
assert.ok(planned.slice(1).every((scene) => scene.outputMode === "image"));
assert.match(planned[0].image_prompt, /Output mode: video/i);
assert.match(planned[1].image_prompt, /Output mode: image/i);

console.log(JSON.stringify({ ok: true, checked: "hybrid-scene-output-policy" }));
