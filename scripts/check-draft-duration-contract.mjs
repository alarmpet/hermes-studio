#!/usr/bin/env node
import assert from "node:assert/strict";
import { validateDraftDurationContract } from "./youtube-draft-duration.mjs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";
import { generateYouTubeWorkflowAssets } from "../youtube-workflow.mjs";

const job = normalizeYouTubeJobRequest({
  sourceType: "url",
  sourceValue: "https://example.com/news",
  options: {
    scriptLengthMode: "preset",
    scriptLengthPreset: "standard",
    speechSpeed: 1.08,
  },
});

const shortDraft = {
  title: "미국 인종별 평균 소득 통계의 진실",
  duration_seconds: 60,
  structure: "HPSL",
  hpsl: {
    hook: { narration: "미국 인종별 평균 소득, 과연 통계는 무엇을 말하고 있을까요?", target_seconds: 7 },
    point: { narration: "미국 인구조사국 데이터에 따르면 아시아계 미국인의 가구당 중간 소득이 가장 높습니다.", target_seconds: 13 },
    story: { narration: "실제로 최신 통계에서 아시아계 가구 중간 소득은 약 10만 달러를 웃돌며, 백인과 히스패닉, 흑인 가구보다 높은 수치를 기록했습니다.", target_seconds: 30 },
    lesson: { narration: "단순한 숫자 뒤의 문화적, 구조적 맥락을 함께 보는 태도가 중요합니다.", target_seconds: 10 },
  },
  script: "미국 인종별 평균 소득, 과연 통계는 무엇을 말하고 있을까요? 미국 인구조사국 데이터에 따르면 아시아계 미국인의 가구당 중간 소득이 가장 높습니다. 실제로 최신 통계에서 아시아계 가구 중간 소득은 약 10만 달러를 웃돌며, 백인과 히스패닉, 흑인 가구보다 높은 수치를 기록했습니다. 단순한 숫자 뒤의 문화적, 구조적 맥락을 함께 보는 태도가 중요합니다.",
  scenes: [
    { order: 1, narration: "미국 인종별 평균 소득, 과연 통계는 무엇을 말하고 있을까요?" },
    { order: 2, narration: "아시아계 미국인의 가구당 중간 소득이 가장 높다는 통계가 있습니다." },
    { order: 3, narration: "하지만 숫자 뒤의 문화적, 구조적 맥락을 함께 봐야 합니다." },
  ],
};

const shortResult = validateDraftDurationContract({ draft: shortDraft, job, stage: "unit" });
assert.equal(shortResult.ok, false, "short draft must fail before Flow generation");
assert.equal(shortResult.failureCode, "DRAFT_DURATION_TOO_SHORT");
assert.equal(shortResult.targetSeconds, 60);
assert.ok(shortResult.estimatedSeconds < 54, "short draft should estimate below the 60s tolerance floor");

const rightSizedDraft = {
  ...shortDraft,
  script: [
    shortDraft.script,
    "이 수치는 단순히 어느 집단이 더 낫다는 뜻이 아니라, 어떤 지역에 살고 어떤 교육과 직업 구조를 갖는지에 따라 결과가 크게 달라진다는 점을 보여줍니다.",
    "그래서 통계를 볼 때는 숫자 하나보다 표본, 지역, 교육, 이민 배경, 직업 분포를 함께 확인해야 합니다.",
    "이 관점을 가지면 자극적인 비교 대신 실제 삶의 조건과 정책적 의미를 더 차분하게 판단할 수 있습니다.",
  ].join(" "),
  scenes: [
    { order: 1, narration: "미국 인종별 평균 소득, 과연 통계는 무엇을 말하고 있을까요?" },
    { order: 2, narration: "이 수치는 단순한 순위가 아니라 지역과 교육, 직업 구조가 함께 만든 결과입니다." },
    { order: 3, narration: "대도시의 생활비와 전문직 분포 같은 요인이 평균값을 크게 흔들 수 있습니다." },
  ],
};

const okResult = validateDraftDurationContract({ draft: rightSizedDraft, job, stage: "unit" });
assert.equal(okResult.ok, true, "right-sized draft should pass duration contract");
assert.ok(okResult.estimatedSeconds >= 54);

const nearLongDraft = {
  ...rightSizedDraft,
  script: [
    rightSizedDraft.script,
    "이 이야기는 단순한 요약이 아니라 시장의 방향을 흔드는 장면입니다.",
  ].join(" "),
};
const nearLongResult = validateDraftDurationContract({ draft: nearLongDraft, job, stage: "gemini-gems" });
assert.equal(nearLongResult.ok, true, "near-long provider drafts should pass so the workflow can render instead of stalling before Flow");
assert.equal(nearLongResult.toleranceMode, "provider-soft");

const nearShortDraft = {
  ...shortDraft,
  script: "짧지만 사용 가능한 뉴스 대본입니다. 핵심 사건을 빠르게 열고, 중요한 포인트를 설명한 뒤, 시청자가 기억할 교훈으로 마무리합니다. ".repeat(6),
};
const providerShortResult = validateDraftDurationContract({ draft: nearShortDraft, job, stage: "openrouter:unit" });
assert.equal(providerShortResult.ok, true, "near-short provider drafts should pass so fallback can still produce a final video");
assert.equal(providerShortResult.toleranceMode, "provider-soft");

let mediaCalled = false;
const repairedProviderDraft = {
  ...rightSizedDraft,
  script: `${rightSizedDraft.script} ${"이 대본은 기사 문장을 그대로 복사하지 않고 사건의 흐름과 의미를 시청자가 이해할 수 있게 다시 구성합니다. ".repeat(1)}`,
};
const repairedProviderResult = validateDraftDurationContract({ draft: repairedProviderDraft, job, stage: "gemini:repair" });
assert.equal(repairedProviderResult.ok, true, "repaired provider drafts around 1.14x target should render instead of failing before Flow");
assert.equal(repairedProviderResult.toleranceMode, "provider-soft");

await assert.rejects(
  () => generateYouTubeWorkflowAssets(job, {
    jobDir: "C:/Users/amd/hermes/outputs/test-draft-duration-contract",
    draft: shortDraft,
    generateSceneMedia: async () => {
      mediaCalled = true;
      throw new Error("media generation should not be called");
    },
  }),
  /Draft duration QA failed/,
  "workflow should reject short draft before Flow/media generation",
);
assert.equal(mediaCalled, false, "short draft must stop before Flow/media generation");

console.log(JSON.stringify({ ok: true, checked: "draft-duration-contract" }));
