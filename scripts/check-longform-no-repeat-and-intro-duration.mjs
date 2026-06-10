#!/usr/bin/env node
import assert from "node:assert/strict";
import { planLongformScenesFromDraft } from "../electron/services/longform-planner.mjs";
import { estimateNarrationSeconds } from "../electron/services/direct-script-duration.mjs";
import { validateDraftQuality } from "./youtube-draft-quality.mjs";

const baseSentences = [
  "우리는 이렇게 배웠죠?",
  "거친 바다를 누비던 바이킹 전사들은 뿔 달린 투구를 쓰고 싸웠다고요.",
  "하지만 실제 유물은 전혀 다른 이야기를 들려줍니다.",
  "전장에서 그런 투구는 멋진 장식이 아니라 치명적인 약점이었습니다.",
  "이 이미지는 19세기 오페라 무대에서 흥행용 소품으로 커졌습니다.",
  "그 뒤 그림과 영화가 이 착각을 진짜 역사처럼 퍼뜨렸습니다.",
  "역사는 외울수록 딱딱해지는 게 아니라 확인할수록 더 재밌어집니다.",
];
const script = baseSentences.join(" ");
const hpsl = {
  hook: { narration: baseSentences.slice(0, 2).join(" "), target_seconds: 20 },
  point: { narration: baseSentences.slice(2, 4).join(" "), target_seconds: 40 },
  story: { narration: baseSentences.slice(4, 6).join(" "), target_seconds: 120 },
  lesson: { narration: baseSentences.slice(6).join(" "), target_seconds: 20 },
};

const scenes = planLongformScenesFromDraft({
  job: {
    options: {
      videoFormat: "longform",
      flowOutputMode: "auto",
      longformTargetSeconds: 200,
      introVideoClipCount: 6,
      bodyImageSeconds: 12,
      speechSpeed: 1,
      aspectRatio: "16:9",
    },
  },
  draft: {
    title: "바이킹 투구의 진실",
    script,
    hpsl,
    duration_seconds: 200,
  },
});

const joined = scenes.map((scene) => scene.narration).join(" ");
const firstOccurrence = joined.indexOf(baseSentences[0]);
const secondOccurrence = joined.indexOf(baseSentences[0], firstOccurrence + baseSentences[0].length);
assert.equal(secondOccurrence, -1, "longform planner must not concatenate script and HPSL into a repeated narration sequence");

const qa = validateDraftQuality({
  draft: {
    title: "반복 QA",
    script,
    scenes: [
      ...baseSentences.map((narration, index) => ({ order: index + 1, narration, image_prompt: `visual ${index + 1}` })),
      ...baseSentences.map((narration, index) => ({ order: index + 1 + baseSentences.length, narration: `${narration} `, image_prompt: `visual repeat ${index + 1}` })),
    ],
  },
  stage: "unit",
});
assert.equal(qa.ok, false, "draft QA must reject near-identical repeated scene halves");
assert.equal(qa.failureCode, "DUPLICATE_SCENE_SEQUENCE");

const openingVideoScenes = scenes.filter((scene) => scene.outputMode === "video").slice(0, 6);
assert.ok(openingVideoScenes.length >= 1, "auto longform should keep at least one opening video scene");
assert.ok(
  openingVideoScenes.every((scene) => estimateNarrationSeconds({ text: scene.narration, speechSpeed: 1 }) >= 3.8),
  "opening video scenes should carry enough narration to avoid 1-2 second clipped intro videos",
);

console.log(JSON.stringify({
  ok: true,
  checked: "longform-no-repeat-and-intro-duration",
  sceneCount: scenes.length,
  openingVideoCount: openingVideoScenes.length,
}));
