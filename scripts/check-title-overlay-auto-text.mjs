#!/usr/bin/env node
import assert from "node:assert/strict";
import { resolveTitleOverlayText } from "../electron/services/title-overlay-text-resolver.mjs";
import { wrapBalancedTitle } from "../electron/services/title-overlay-layout.mjs";

const baseJob = {
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: {
    titleOverlayMode: "auto",
    titleOverlayText: "",
    titleOverlayMaxLines: 2,
  },
};

const draft = {
  title: "구글 글래스가 다시 주목받는 이유",
  hpsl: {
    hook: { narration: "구글 글래스는 실패한 제품처럼 보였습니다." },
    point: { narration: "하지만 AI 시대에는 전혀 다른 의미를 가졌습니다." },
  },
  script: "구글 글래스는 실패한 제품처럼 보였습니다. 하지만 AI 시대에는 전혀 다른 의미를 가졌습니다.",
};

assert.equal(
  resolveTitleOverlayText({
    job: { ...baseJob, options: { ...baseJob.options, titleOverlayMode: "manual", titleOverlayText: "직접 입력 제목" } },
    draft,
  }).text,
  "직접 입력 제목",
  "manual text must have highest priority",
);

assert.deepEqual(
  resolveTitleOverlayText({ job: baseJob, draft }),
  {
    text: "구글 글래스가 다시 주목받는 이유",
    source: "draft-title",
  },
  "auto mode should use draft.title first when it already fits",
);

assert.equal(
  resolveTitleOverlayText({
    job: baseJob,
    draft: { ...draft, title: "", hpsl: { hook: draft.hpsl.hook } },
  }).source,
  "hpsl-hook",
  "auto mode should fall back to HPSL hook",
);

assert.deepEqual(
  resolveTitleOverlayText({
    job: baseJob,
    draft: { title: "", hpsl: {}, script: "" },
  }),
  {
    text: "구글 글래스",
    source: "source-value",
  },
  "auto mode should fall back to source keyword",
);

const scriptFallback = resolveTitleOverlayText({
  job: { ...baseJob, sourceValue: "" },
  draft: { title: "", hpsl: {}, script: "첫 문장만 상단 제목으로 씁니다. 두 번째 문장은 제외합니다." },
});
assert.equal(scriptFallback.text, "첫 문장만 상단 제목으로 씁니다");
assert.equal(scriptFallback.source, "script-first-sentence");

const longTitle = "이것은 너무 길어서 상단 타이틀로 올리면 화면을 덮어버릴 가능성이 매우 높은 제목입니다";
const resolved = resolveTitleOverlayText({
  job: baseJob,
  draft: { title: longTitle, hpsl: {}, script: "" },
});
assert.ok(
  Array.from(resolved.text.replace(/\s+/g, "")).length <= 18,
  "auto title should be short enough for a visually clean two-line Shorts title",
);
assert.doesNotMatch(resolved.text, /[{}\[\]<>]/, "auto title should strip noisy bracket punctuation");

const latestOutputTitle = resolveTitleOverlayText({
  job: baseJob,
  draft: { title: "가벼워지는 통신비, 내 스마트폰 요금도 줄어들까?", hpsl: {}, script: "" },
});
assert.ok(
  Array.from(latestOutputTitle.text.replace(/\s+/g, "")).length <= 18,
  "latest long article title should be rewritten into a compact two-line-safe title",
);
assert.notEqual(latestOutputTitle.text, "가벼워지는 통신비, 내 스마트폰 요금도 줄어들까?");

const wrapped = wrapBalancedTitle(latestOutputTitle.text, { maxChars: 10, maxLines: 2 });
assert.ok(wrapped.length <= 2, "auto title should wrap to at most two lines");
assert.ok(
  wrapped.every((line) => Array.from(line.replace(/\s+/g, "")).length <= 10),
  "auto title lines should fit the shortform top title band",
);

console.log(JSON.stringify({ ok: true, checked: "title-overlay-auto-text" }));
