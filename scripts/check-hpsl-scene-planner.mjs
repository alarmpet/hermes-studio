#!/usr/bin/env node
import assert from "node:assert/strict";
import { planScenesFromHpsl } from "../electron/services/script-planner.mjs";

const hpsl = {
  hook: { narration: "구글 글래스가 다시 주목받는 이유, 생각보다 현실적입니다.", target_seconds: 7 },
  point: { narration: "핵심은 손을 쓰지 않고 정보를 확인하는 생산성입니다.", target_seconds: 13 },
  story: { narration: "공장에서는 작업자가 매뉴얼을 보며 장비를 고치고, 병원에서는 의사가 환자 정보를 즉시 확인합니다. 하지만 카메라가 켜져 있다는 사실을 주변 사람이 알아야 합니다.", target_seconds: 30 },
  lesson: { narration: "결국 성공 조건은 멋진 기기보다 신뢰를 주는 사용 경험입니다.", target_seconds: 10 },
};

const scenes = planScenesFromHpsl({
  title: "구글 글래스의 귀환",
  hpsl,
  targetSeconds: 60,
  characterProfile: "same Korean tech reporter in her early 30s",
});

assert.ok(scenes.length >= 5, "60s HPSL should create enough visual beats");
assert.deepEqual([...new Set(scenes.map((scene) => scene.section))], ["hook", "point", "story", "lesson"]);
assert.ok(scenes.every((scene) => !scene.narration.includes(hpsl.hook.narration + " " + hpsl.point.narration + " " + hpsl.story.narration)), "no scene should repeat the full script");
assert.ok(scenes.every((scene) => scene.duration_seconds <= 10), "single Flow scene should stay under 10 seconds target");
assert.ok(scenes.every((scene) => /Visual goal:|Action:|Camera:/.test(scene.image_prompt)), "each scene needs concrete visual prompt fields");
assert.equal(scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0), 60, "scaled HPSL scene durations must sum to targetSeconds");

const scaledScenes = planScenesFromHpsl({
  title: "구글 글래스의 귀환",
  hpsl: {
    hook: { narration: "짧은 훅입니다.", target_seconds: 7 },
    point: { narration: "핵심 포인트입니다.", target_seconds: 12 },
    story: { narration: "첫 문장입니다. 두 번째 문장은 훨씬 길어서 더 많은 설명과 화면 시간이 필요합니다.", target_seconds: 28 },
    lesson: { narration: "마무리 교훈입니다.", target_seconds: 10 },
  },
  targetSeconds: 90,
  characterProfile: "same Korean tech reporter in her early 30s",
});
assert.equal(scaledScenes.reduce((sum, scene) => sum + scene.duration_seconds, 0), 90, "HPSL raw section seconds must scale to custom target");
const storyScenes = scaledScenes.filter((scene) => scene.section === "story");
assert.ok(storyScenes.length >= 2, "story section should split into sentence beats");
assert.ok(storyScenes[1].duration_seconds >= storyScenes[0].duration_seconds, "longer story sentence should receive at least as much duration as shorter sentence");

console.log(JSON.stringify({ ok: true, checked: "hpsl-scene-planner", sceneCount: scenes.length }));
