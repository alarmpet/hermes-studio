#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateDraftQuality } from "./youtube-draft-quality.mjs";

const missingLesson = validateDraftQuality({
  draft: {
    structure: "HPSL",
    title: "테스트",
    script: "훅입니다. 포인트입니다. 스토리입니다.",
    hpsl: {
      hook: { narration: "훅입니다.", target_seconds: 7 },
      point: { narration: "포인트입니다.", target_seconds: 13 },
      story: { narration: "스토리입니다.", target_seconds: 30 },
    },
    scenes: [{ order: 1, narration: "훅입니다." }],
  },
  stage: "unit",
});
assert.equal(missingLesson.ok, false);
assert.equal(missingLesson.failureCode, "HPSL_SECTION_MISSING");

const repeatedHpsl = validateDraftQuality({
  draft: {
    structure: "HPSL",
    title: "테스트",
    script: "훅입니다. 포인트입니다. 스토리입니다. 교훈입니다.",
    hpsl: {
      hook: { narration: "훅입니다.", target_seconds: 7 },
      point: { narration: "포인트입니다.", target_seconds: 13 },
      story: { narration: "스토리입니다.", target_seconds: 30 },
      lesson: { narration: "교훈입니다.", target_seconds: 10 },
    },
    scenes: [
      { order: 1, narration: "훅입니다." },
      { order: 2, narration: "훅입니다. 포인트입니다. 스토리입니다. 교훈입니다." },
    ],
  },
  stage: "unit",
});
assert.equal(repeatedHpsl.ok, false);
assert.equal(repeatedHpsl.failureCode, "DUPLICATE_FULL_SCRIPT_SCENE");

console.log(JSON.stringify({ ok: true, checked: "hpsl-qa-gate" }));
