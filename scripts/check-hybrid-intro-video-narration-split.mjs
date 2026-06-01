#!/usr/bin/env node
import assert from "node:assert/strict";
import { planScenesFromHpsl } from "../electron/services/script-planner.mjs";

const hpsl = {
  hook: {
    narration: "환율이 1480원을 찍고 심리적 마지노선인 1500원마저 위협하자 정부는 급하게 국민연금 카드까지 꺼내 들며 방어막을 쳤습니다. 우리는 흔히 뉴스 기사를 보며 이번에도 일시적인 환율 불안이겠지 하고 대수롭지 않게 넘기곤 합니다. 하지만 진실은 완전히 달랐고, 지금 우리 눈앞의 상황은 생각보다 훨씬 이상합니다.",
    target_seconds: 7,
  },
  point: {
    narration: "미국과 한국의 금리 격차가 커지면서 원화 약세 압력이 계속되고 있습니다.",
    target_seconds: 13,
  },
  story: {
    narration: "돈은 더 높은 이자를 주는 곳으로 이동합니다. 그래서 환율 불안은 단순한 숫자가 아니라 내 구매력과 생활비에 직접 닿는 문제입니다.",
    target_seconds: 30,
  },
  lesson: {
    narration: "환율 뉴스는 겁먹기 위한 신호가 아니라 내 자산 구조를 점검하라는 알림입니다.",
    target_seconds: 10,
  },
};

const scenes = planScenesFromHpsl({
  title: "환율 1500원 경고",
  hpsl,
  targetSeconds: 60,
  characterProfile: "same Korean financial news narrator in her early 30s",
  flowOutputMode: "hybrid",
  hybridIntroVideoSceneCount: 1,
  aspectRatio: "9:16",
});

assert.equal(scenes[0].outputMode, "video", "first hybrid intro scene should remain video");
assert.ok(
  Array.from(scenes[0].narration.replace(/\s+/g, "")).length <= 35,
  "first Flow video scene narration must be short enough for one 8s Flow clip",
);
assert.ok(
  scenes.slice(1).some((scene) => scene.section === "hook" && scene.outputMode === "image"),
  "overflow hook narration should continue as image scenes instead of one long video scene",
);
assert.ok(
  scenes.every((scene) => !(scene.outputMode === "video" && Array.from(scene.narration.replace(/\s+/g, "")).length > 35)),
  "no hybrid video scene should carry long narration that will exceed one Flow clip",
);
assert.equal(scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0), 60, "scene durations should still sum to target");

console.log(JSON.stringify({ ok: true, checked: "hybrid-intro-video-narration-split", sceneCount: scenes.length }));
