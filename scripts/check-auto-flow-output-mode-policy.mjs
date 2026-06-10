#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  assignSceneOutputModes,
  outputModeForScene,
  resolveAutoVideoSceneOrders,
} from "../electron/services/scene-output-mode-policy.mjs";

const scenes = Array.from({ length: 12 }, (_, index) => ({
  order: index + 1,
  narration: [
    "People believed it was an ordinary historical incident.",
    "But the truth was completely different.",
    "A royal record quietly disappeared.",
    "Merchants opened the tax ledger again.",
    "However, an unexpected clue was discovered on the battlefield.",
    "One small line on the map changed every suspicion.",
    "Citizens began to realize who had lied.",
    "At last, the hidden document was revealed.",
    "This reversal shook the entire kingdom.",
    "History does not only leave the winner's record.",
    "What we need to see is the blank space between records.",
    "That is why this case still gives us a lesson.",
  ][index],
  section: index < 2 ? "hook" : index < 9 ? "story" : "lesson",
  duration_seconds: 10,
}));

assert.equal(outputModeForScene({ sceneOrder: 1, flowOutputMode: "auto", scenes, targetSeconds: 60 }), "video");

const shortAuto = assignSceneOutputModes({
  scenes: scenes.slice(0, 6),
  flowOutputMode: "auto",
  targetSeconds: 60,
}).map((scene) => scene.outputMode);
assert.equal(shortAuto[0], "video", "first scene should be video for the hook");
assert.equal(shortAuto[1], "video", "second scene should be video for the opening beat");
assert.ok(shortAuto.filter((mode) => mode === "video").length <= 3, "short auto should cap video count");
assert.ok(shortAuto.filter((mode) => mode === "image").length >= 3, "short auto should keep image scenes as the majority");

const mediumAuto = assignSceneOutputModes({
  scenes,
  flowOutputMode: "auto",
  targetSeconds: 150,
}).map((scene) => scene.outputMode);
assert.equal(mediumAuto[0], "video");
assert.equal(mediumAuto[1], "video");
assert.equal(mediumAuto[4], "video", "middle reversal should become video");
assert.equal(mediumAuto[8], "video", "climax/reversal scene should become video");
assert.ok(mediumAuto.filter((mode) => mode === "video").length >= 4);
assert.ok(mediumAuto.filter((mode) => mode === "image").length >= 6);

const longformOrders = resolveAutoVideoSceneOrders({
  scenes: Array.from({ length: 40 }, (_, index) => ({
    order: index + 1,
    chapter: index < 5 ? "cold_open" : index < 12 ? "context" : index < 28 ? "deep_dive" : index < 35 ? "examples" : "takeaway",
    narration: index === 20
      ? "But the hidden truth was revealed after one forgotten witness changed everything."
      : "The historical background is explained through one clear dramatic visual example.",
    duration_seconds: index < 8 ? 8 : 18,
  })),
  flowOutputMode: "auto",
  targetSeconds: 720,
  videoFormat: "longform",
  introVideoClipCount: 8,
});
assert.ok(longformOrders.has(1));
assert.ok(longformOrders.has(8), "longform intro should allow dense opening video beats");
assert.ok(longformOrders.has(13), "chapter start should become a body video beat");
assert.ok(longformOrders.has(21), "strong reversal should become a body video beat");
assert.ok(longformOrders.size < 18, "auto should cap longform video ratio to avoid Flow cost and failures");

const longOpeningAuto = assignSceneOutputModes({
  scenes: Array.from({ length: 12 }, (_, index) => ({
    order: index + 1,
    chapter: index < 8 ? "cold_open" : "context",
    narration: index < 8
      ? "이 장면은 긴 설명을 포함해서 하나의 Google Flow 비디오 클립으로 만들기에는 너무 길고, 반복이나 정지 화면 위험이 커지는 오프닝 문장입니다."
      : "짧은 배경 설명입니다.",
    duration_seconds: index < 8 ? 8 : 18,
  })),
  flowOutputMode: "auto",
  targetSeconds: 720,
  videoFormat: "longform",
  introVideoClipCount: 8,
});
assert.ok(longOpeningAuto.slice(0, 8).some((scene) => scene.outputMode === "image"), "longform auto should not force long opening narration into video");
assert.ok(longOpeningAuto.slice(0, 8).some((scene) => /too long/i.test(scene.autoRejectedReason || "")), "longform auto should explain rejected opening video candidates");

const resolvedLongform = assignSceneOutputModes({
  scenes: Array.from({ length: 12 }, (_, index) => ({
    order: index + 1,
    chapter: index < 4 ? "cold_open" : "context",
    narration: index === 7
      ? "But a new witness changed the case with one quiet sentence."
      : "The background is explained through one clear dramatic visual example.",
    duration_seconds: index < 4 ? 8 : 18,
  })),
  flowOutputMode: "auto",
  targetSeconds: 240,
  videoFormat: "longform",
  introVideoClipCount: 4,
});
assert.ok(resolvedLongform.some((scene) => scene.autoReason), "auto decisions should persist an autoReason for debugging and resume");

console.log(JSON.stringify({ ok: true, checked: "auto-flow-output-mode-policy" }));
