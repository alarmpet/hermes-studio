#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { planScenesFromHpsl, planScenesFromScript, targetSceneCount } from "../electron/services/script-planner.mjs";

const root = resolve(import.meta.dirname, "..");
const draftService = readFileSync(resolve(root, "electron/services/youtube-draft-service.mjs"), "utf8");
const renderer = readFileSync(resolve(root, "electron/renderer/app.js"), "utf8");

const sentence = "역사의 작은 소문은 왕궁의 복도에서 시작됐고, 사람들은 그 소문이 전쟁의 방향까지 바꿀 줄 몰랐습니다.";
const script = Array.from({ length: 40 }, (_, index) => `${index + 1}번째 단서는 권력자들이 두려움을 감추기 위해 만든 장면을 보여줍니다.`).join(" ");

assert.equal(targetSceneCount({ sentenceCount: 28, targetSeconds: 240 }), 40, "240s should target about forty scenes at six seconds per scene");
assert.match(draftService, /Math\.ceil\(seconds \/ 6\)/, "draft prompt target scenes should use six-second scene density");
assert.doesNotMatch(draftService, /Math\.min\(10,\s*Math\.round\(seconds \/ 12\)\)/, "draft prompt must not cap medium videos to ten scenes");
assert.match(renderer, /Math\.ceil\(seconds \/ 6\)/, "Studio duration preview should use six-second scene density");

const directScenes = planScenesFromScript({
  title: "권력 뒤의 숨은 진실",
  script,
  targetSeconds: 240,
  customDurationSeconds: 240,
  flowOutputMode: "auto",
  aspectRatio: "16:9",
  stylePreset: { id: "stickmanplus", aesthetic: "stickmanplus history explainer" },
});

assert.ok(directScenes.length >= 35 && directScenes.length <= 45, `240s direct script should create 35-45 scenes, got ${directScenes.length}`);
assert.ok(directScenes.every((scene) => Number(scene.duration_seconds) <= 8), "direct script scenes should stay at or below 8 seconds");
assert.equal(directScenes.reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0), 240, "direct script scene durations should sum to target");

const hpslScenes = planScenesFromHpsl({
  title: "권력 뒤의 숨은 진실",
  targetSeconds: 240,
  flowOutputMode: "auto",
  aspectRatio: "16:9",
  stylePreset: { id: "stickmanplus", aesthetic: "stickmanplus history explainer" },
  hpsl: {
    hook: { goal: "Hook", narration: sentence.repeat(2), target_seconds: 7 },
    point: { goal: "Point", narration: sentence.repeat(3), target_seconds: 13 },
    story: { goal: "Story", narration: sentence.repeat(9), target_seconds: 30 },
    lesson: { goal: "Lesson", narration: sentence.repeat(3), target_seconds: 10 },
  },
});

assert.ok(hpslScenes.length >= 35 && hpslScenes.length <= 45, `240s HPSL should create 35-45 scenes, got ${hpslScenes.length}`);
assert.ok(hpslScenes.every((scene) => Number(scene.duration_seconds) <= 8), "HPSL scenes should stay at or below 8 seconds");
assert.equal(hpslScenes.reduce((sum, scene) => sum + Number(scene.duration_seconds || 0), 0), 240, "HPSL scene durations should sum to target");

console.log(JSON.stringify({
  ok: true,
  checked: "medium-duration-scene-density",
  directSceneCount: directScenes.length,
  hpslSceneCount: hpslScenes.length,
}));
