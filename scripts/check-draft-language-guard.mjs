#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateDraftQuality } from "./youtube-draft-quality.mjs";

const corruptedText = "\uf9cf\uafe8\ub800\u0080????\ube7a\ud0f5??\u63f6\uc3c6\ubbc6\u800c?????\uc0bd??\uae46\ubc7d ?\u2464\ubc00\u800c??\ub418\ubba4??\ub378\ubf04. ?????\uc0bd??? AI????\ubef0\ub4a0????\ub066??\u7652?\uc9d7?\u907a? \u7b4c\uc655\u0080?\u7652\uaceb\ub098???\ub378\ubf04.";

const corruptedDraft = {
  title: corruptedText.slice(0, 34),
  structure: "HPSL",
  hpsl: {
    hook: { narration: corruptedText.slice(0, 28), target_seconds: 7 },
    point: { narration: corruptedText.slice(29, 58), target_seconds: 13 },
    story: { narration: corruptedText.slice(59, 90), target_seconds: 30 },
    lesson: { narration: corruptedText.slice(91, 120), target_seconds: 10 },
  },
  script: corruptedText,
  scenes: [
    { order: 1, narration: corruptedText.slice(0, 42), image_prompt: "AI tools on a desk" },
  ],
};

const result = validateDraftQuality({ draft: corruptedDraft, stage: "unit" });
assert.equal(result.ok, false, "mojibake Korean draft must fail");
assert.equal(result.failureCode, "CORRUPTED_KOREAN_DRAFT");

const normalQuestionDraft = {
  title: "\u0041\u0049 \uac1c\ubc1c \ub3c4\uad6c\ub294 \uc0ac\ub78c\uc744 \ub300\uccb4\ud560\uae4c\uc694?",
  structure: "HPSL",
  hpsl: {
    hook: { narration: "\u0041\u0049 \uac1c\ubc1c \ub3c4\uad6c\ub294 \uc0ac\ub78c\uc744 \ub300\uccb4\ud560\uae4c\uc694?", target_seconds: 7 },
    point: { narration: "\ud575\uc2ec\uc740 \ub300\uccb4\uac00 \uc544\ub2c8\ub77c \ubc18\ubcf5 \uc5c5\ubb34\ub97c \uc904\uc774\ub294 \uac83\uc785\ub2c8\ub2e4.", target_seconds: 13 },
    story: { narration: "\uac1c\ubc1c\uc790\ub294 \ucf54\ub4dc \uc791\uc131\uacfc \uac80\ud1a0\ub97c \ub354 \ube60\ub974\uac8c \ubc18\ubcf5\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4.", target_seconds: 30 },
    lesson: { narration: "\ub3c4\uad6c\uc758 \uac15\uc810\uacfc \ud55c\uacc4\ub97c \ud568\uaed8 \ubcf4\ub294 \ud0dc\ub3c4\uac00 \uc911\uc694\ud569\ub2c8\ub2e4.", target_seconds: 10 },
  },
  script: "\u0041\u0049 \uac1c\ubc1c \ub3c4\uad6c\ub294 \uc0ac\ub78c\uc744 \ub300\uccb4\ud560\uae4c\uc694? \ud575\uc2ec\uc740 \ub300\uccb4\uac00 \uc544\ub2c8\ub77c \ubc18\ubcf5 \uc5c5\ubb34\ub97c \uc904\uc774\ub294 \uac83\uc785\ub2c8\ub2e4. \uac1c\ubc1c\uc790\ub294 \ucf54\ub4dc \uc791\uc131\uacfc \uac80\ud1a0\ub97c \ub354 \ube60\ub974\uac8c \ubc18\ubcf5\ud560 \uc218 \uc788\uc2b5\ub2c8\ub2e4. \ub3c4\uad6c\uc758 \uac15\uc810\uacfc \ud55c\uacc4\ub97c \ud568\uaed8 \ubcf4\ub294 \ud0dc\ub3c4\uac00 \uc911\uc694\ud569\ub2c8\ub2e4.",
  scenes: [
    { order: 1, narration: "\u0041\u0049 \uac1c\ubc1c \ub3c4\uad6c\ub294 \uc0ac\ub78c\uc744 \ub300\uccb4\ud560\uae4c\uc694?", image_prompt: "developer looking at AI coding assistant" },
    { order: 2, narration: "\ud575\uc2ec\uc740 \ub300\uccb4\uac00 \uc544\ub2c8\ub77c \ubc18\ubcf5 \uc5c5\ubb34\ub97c \uc904\uc774\ub294 \uac83\uc785\ub2c8\ub2e4.", image_prompt: "automation dashboard without readable text" },
  ],
};

assert.equal(validateDraftQuality({ draft: normalQuestionDraft, stage: "unit" }).ok, true);
console.log(JSON.stringify({ ok: true, checked: "draft-language-guard" }));
