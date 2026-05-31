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

const malformedHybridDraft = {
  title: "AI 뉴스",
  structure: "Hybrid",
  hpsl: {
    hook: "문자열 후킹",
    point: "문자열 포인트",
    story: "문자열 스토리",
    lesson: "문자열 교훈",
  },
  script: "AI 뉴스 이야기입니다.",
  scenes: [{ order: 1, narration: "AI 뉴스 이야기입니다.", image_prompt: "aspect ratio 16:9" }],
};

const malformedResult = validateDraftQuality({
  draft: malformedHybridDraft,
  job: { options: { scriptStructure: "hpsl", aspectRatio: "9:16" } },
  stage: "unit-hpsl-malformed",
});
assert.equal(malformedResult.ok, false);
assert.equal(malformedResult.failureCode, "HPSL_STRUCTURE_MISMATCH");

console.log(JSON.stringify({ ok: true, checked: "hpsl-qa-gate" }));
