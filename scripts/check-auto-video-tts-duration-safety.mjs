#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  SAFE_VIDEO_MAX_SECONDS,
  SAFE_VIDEO_MIN_SECONDS,
} from "../electron/services/direct-script-duration.mjs";
import { assignSceneOutputModes } from "../electron/services/scene-output-mode-policy.mjs";

const scenes = [
  {
    order: 1,
    narration: "우리는 이렇게 배웠죠. 1492년 콜럼버스가 지구가 둥글다는 것을 증명하기 위해 목숨을 걸고 바다로 나간 용감한 탐험가였다고요.",
    duration_seconds: 7,
  },
  { order: 2, narration: "하지만 사실은 전혀 달랐고, 기록 속 숫자가 단서를 남겼습니다.", duration_seconds: 4 },
  { order: 3, narration: "진짜 핵심은 거리 계산 착오였습니다.", duration_seconds: 5 },
];

const planned = assignSceneOutputModes({
  scenes,
  flowOutputMode: "auto",
  videoFormat: "longform",
  targetSeconds: 141,
  introVideoClipCount: 3,
  speechSpeed: 1.08,
});

const scene1 = planned.find((scene) => scene.order === 1);
assert.equal(scene1.outputMode, "image", "scene 1 should be rejected from video mode when predicted narration is too long");
assert.match(scene1.autoRejectedReason, /narration too long|unsafe/i);

const scene2 = planned.find((scene) => scene.order === 2);
assert.equal(scene2.outputMode, "video", "short opening beat can stay video");
assert.ok(SAFE_VIDEO_MIN_SECONDS > 0 && SAFE_VIDEO_MAX_SECONDS <= 8);

console.log(JSON.stringify({ ok: true, checked: "auto-video-tts-duration-safety", planned }, null, 2));
