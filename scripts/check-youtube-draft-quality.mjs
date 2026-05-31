#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateDraftQuality } from "./youtube-draft-quality.mjs";
import { normalizeYouTubeDraft } from "../youtube-workflow.mjs";

const repeatedScript = "첫 문장입니다. 두 번째 문장입니다. 세 번째 문장입니다. 네 번째 문장입니다.";
const badDraft = {
  title: "반복 대본 테스트",
  script: repeatedScript,
  scenes: [
    { order: 1, narration: "첫 문장입니다." },
    { order: 2, narration: "두 번째 문장입니다." },
    { order: 3, narration: repeatedScript },
  ],
};

const badResult = validateDraftQuality({ draft: badDraft, stage: "unit" });
assert.equal(badResult.ok, false, "full-script scene repetition must fail draft QA");
assert.equal(badResult.failureCode, "DUPLICATE_FULL_SCRIPT_SCENE");
assert.equal(badResult.failedSceneOrder, 3);

const placeholderResult = validateDraftQuality({
  draft: {
    title: "string",
    script: "Korean narration",
    character_profile: "English stable character profile or empty string",
    scenes: [{ order: 1, narration: "Korean sentence", image_prompt: "topic-specific object/person/place" }],
  },
  stage: "unit",
});
assert.equal(placeholderResult.ok, false, "schema placeholder text must fail draft QA");
assert.equal(placeholderResult.failureCode, "PLACEHOLDER_DRAFT");

const goodResult = validateDraftQuality({
  draft: {
    title: "구글 글래스가 다시 주목받는 이유",
    script: "구글 글래스가 산업 현장에서 다시 주목받고 있습니다. 작업자는 손을 쓰지 않고 안내를 확인할 수 있습니다. 다만 촬영 알림과 개인정보 보호 장치가 함께 필요합니다.",
    scenes: [
      { order: 1, narration: "구글 글래스가 산업 현장에서 다시 주목받고 있습니다." },
      { order: 2, narration: "작업자는 손을 쓰지 않고 안내를 확인할 수 있습니다." },
      { order: 3, narration: "다만 촬영 알림과 개인정보 보호 장치가 함께 필요합니다." },
    ],
  },
  stage: "unit",
});
assert.equal(goodResult.ok, true, "valid non-repeating draft should pass draft QA");

const celebrityDraft = normalizeYouTubeDraft({
  title: "Elon Musk robot news",
  structure: "HPSL",
  hpsl: {
    hook: { goal: "Hook", narration: "Elon Musk revealed a robot.", target_seconds: 7 },
    point: { goal: "Point", narration: "The core point is technology competition.", target_seconds: 13 },
    story: { goal: "Story", narration: "Investors are watching market changes.", target_seconds: 30 },
    lesson: { goal: "Lesson", narration: "Look at real use, not hype.", target_seconds: 10 },
  },
  script: "Elon Musk revealed a robot.",
  scenes: [{
    order: 1,
    narration: "Elon Musk presented a robot on stage.",
    image_prompt: "Photorealistic close-up of Elon Musk presenting a robot on stage.",
    duration_seconds: 8,
  }],
});

assert.doesNotMatch(celebrityDraft.scenes[0].image_prompt, /Elon Musk/i);
assert.match(celebrityDraft.scenes[0].image_prompt, /tech company CEO|anonymous|public figure|technology company executive/i);
assert.ok(celebrityDraft.scenes[0].flow_prompt_safety?.changed);

const geminiKeywordJob = {
  sourceType: "keyword",
  sourceValue: "최신 gemini 소식",
  options: { scriptStructure: "hpsl", aspectRatio: "9:16" },
};

const genericAiDraft = {
  title: "요즘 AI 뉴스가 갑자기 커진 진짜 이유",
  structure: "HPSL",
  hpsl: {
    hook: { narration: "요즘 AI 뉴스가 매일 쏟아지고 있습니다.", target_seconds: 7 },
    point: { narration: "핵심은 데이터센터와 전력 경쟁입니다.", target_seconds: 13 },
    story: { narration: "거대 기업들이 인프라를 확장하고 있습니다.", target_seconds: 30 },
    lesson: { narration: "기술 이름보다 구조를 봐야 합니다.", target_seconds: 10 },
  },
  script: "요즘 AI 뉴스가 매일 쏟아지고 있습니다. 핵심은 데이터센터와 전력 경쟁입니다. 거대 기업들이 인프라를 확장하고 있습니다. 기술 이름보다 구조를 봐야 합니다.",
  scenes: [
    { order: 1, narration: "요즘 AI 뉴스가 매일 쏟아지고 있습니다.", image_prompt: "9:16 cinematic data center scene" },
  ],
};

const groundingResult = validateDraftQuality({
  draft: genericAiDraft,
  job: geminiKeywordJob,
  stage: "unit-keyword-grounding",
});
assert.equal(groundingResult.ok, false, "draft must not pass when the required keyword subject Gemini is missing");
assert.equal(groundingResult.failureCode, "SOURCE_GROUNDING_MISMATCH");

const josaKeywordJob = {
  sourceType: "keyword",
  sourceValue: "gemini의 소식",
  options: { scriptStructure: "hpsl", aspectRatio: "9:16" },
};
const josaDraft = {
  ...genericAiDraft,
  title: "Gemini 최신 변화",
  script: "Gemini가 바꾸는 검색 경험을 쉽게 설명합니다.",
  hpsl: {
    hook: { narration: "Gemini가 검색을 바꾸고 있습니다.", target_seconds: 7 },
    point: { narration: "핵심은 답변 방식의 변화입니다.", target_seconds: 13 },
    story: { narration: "사용자는 긴 검색 대신 요약된 맥락을 먼저 봅니다.", target_seconds: 30 },
    lesson: { narration: "도구 변화는 습관 변화로 이어집니다.", target_seconds: 10 },
  },
  scenes: [{ order: 1, narration: "Gemini가 검색을 바꾸고 있습니다.", image_prompt: "9:16 cinematic browser search workflow" }],
};
assert.equal(validateDraftQuality({ draft: josaDraft, job: josaKeywordJob, stage: "unit-keyword-josa" }).ok, true);
assert.equal(validateDraftQuality({ draft: josaDraft, job: { ...josaKeywordJob, sourceValue: "제미나이를 분석" }, stage: "unit-korean-josa" }).ok, true);

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

const aspectResult = validateDraftQuality({
  draft: {
    ...josaDraft,
    scenes: [{ order: 1, narration: "Gemini가 검색을 바꾸고 있습니다.", image_prompt: "cinematic search workflow, aspect ratio 16:9" }],
  },
  job: { options: { scriptStructure: "hpsl", aspectRatio: "9:16" } },
  stage: "unit-aspect",
});
assert.equal(aspectResult.ok, false);
assert.equal(aspectResult.failureCode, "FLOW_PROMPT_ASPECT_MISMATCH");

if (process.argv[2]) {
  const jobDir = resolve(process.argv[2]);
  const draft = JSON.parse(readFileSync(join(jobDir, "draft.json"), "utf8"));
  const result = validateDraftQuality({ draft, stage: "cli", jobDir });
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
}

console.log(JSON.stringify({ ok: true, checked: "youtube-draft-quality" }));
