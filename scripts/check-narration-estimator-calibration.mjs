#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  SAFE_VIDEO_KOREAN_CHARS_PER_SECOND,
  SAFE_VIDEO_MAX_SECONDS,
  MAX_VIDEO_NARRATION_CHARS,
  MAX_IMAGE_NARRATION_CHARS,
  MAX_SENTENCE_PRESERVE_CHARS,
  estimateNarrationSeconds,
} from "../electron/services/direct-script-duration.mjs";

assert.equal(MAX_VIDEO_NARRATION_CHARS, 60, "active decision uses 60 chars for video narration planning");
assert.equal(MAX_IMAGE_NARRATION_CHARS, 70, "active decision uses 70 chars for image narration planning");
assert.equal(MAX_SENTENCE_PRESERVE_CHARS, 80, "short complete sentences under 80 chars are preserved");
assert.equal(SAFE_VIDEO_KOREAN_CHARS_PER_SECOND, 4.0, "safe video estimator should remain conservative unless recalibrated with real TTS data");
assert.ok(SAFE_VIDEO_MAX_SECONDS > 0 && SAFE_VIDEO_MAX_SECONDS <= 8, "safe video max should fit one Flow clip with margin");

const shortBeat = "하지만 사실은 다릅니다.";
const mediumBeat = "AI 반도체 시장은 GPU 성능보다 생태계 전환 비용과 CUDA 락인이 더 큰 장벽입니다.";
const longBeat = "우리는 이렇게 배웠죠. 1492년 콜럼버스가 지구가 둥글다는 것을 증명하기 위해 목숨을 걸고 바다로 나간 용감한 탐험가였다고요.";

assert.ok(estimateNarrationSeconds({ text: shortBeat, speechSpeed: 1.08 }) < 3.5, "very short beat should be classified as too short for auto video");
assert.ok(estimateNarrationSeconds({ text: mediumBeat, speechSpeed: 1.08 }) > SAFE_VIDEO_MAX_SECONDS, "medium Korean beat is too risky for one Flow clip under conservative guard");
assert.ok(estimateNarrationSeconds({ text: longBeat, speechSpeed: 1.08 }) > SAFE_VIDEO_MAX_SECONDS, "long opening beat must be rejected or split");

console.log(JSON.stringify({ ok: true, checked: "narration-estimator-calibration" }, null, 2));
