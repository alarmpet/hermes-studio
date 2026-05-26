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
