#!/usr/bin/env node
import assert from "node:assert/strict";
import { planLongformScenesFromDraft } from "../electron/services/longform-planner.mjs";
import { estimateNarrationSeconds } from "../electron/services/direct-script-duration.mjs";

const longKoreanSentence = "이 장면은 너무 긴 설명을 한 번에 담고 있어서 구글 플로우의 짧은 영상 클립 하나로 처리하면 영상이 멈춘 것처럼 보일 수 있습니다.";
assert.ok(estimateNarrationSeconds(longKoreanSentence) > 8, "shared estimator should classify this Korean narration as too long for one Flow video clip");

const script = Array.from({ length: 20 }, (_, index) => `${longKoreanSentence} ${index + 1}번째 문장입니다.`).join(" ");
const scenes = planLongformScenesFromDraft({
  job: {
    options: {
      videoFormat: "longform",
      flowOutputMode: "auto",
      longformTargetSeconds: 720,
      introVideoClipCount: 10,
      bodyImageSeconds: 18,
      aspectRatio: "16:9",
    },
  },
  draft: {
    title: "duration guard behavior",
    script,
    duration_seconds: 720,
  },
});

const unsafeVideoScenes = scenes
  .filter((scene) => scene.outputMode === "video")
  .map((scene) => ({ order: scene.order, estimated: estimateNarrationSeconds(scene.narration), narration: scene.narration }))
  .filter((scene) => scene.estimated > 8.1);

assert.deepEqual(unsafeVideoScenes, [], "longform planner should not emit video scenes whose narration is longer than one safe Flow clip");
assert.ok(scenes.some((scene) => scene.autoRejectedReason), "planner should preserve rejected reasons for unsafe auto video candidates");

console.log("check-longform-video-scene-duration-guard contract OK");
