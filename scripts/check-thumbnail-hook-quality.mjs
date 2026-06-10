#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildThumbnailOverlayPlan } from "../pipeline/youtube-thumbnail-prompt.mjs";

const cases = [
  {
    name: "history",
    title: "우리는 이렇게 배웠죠",
    script: "1492년 콜럼버스 이야기는 지구가 둥글다는 증명이 아니라 거리 계산 착오와 항해 리스크가 핵심입니다.",
    expected: /콜럼버스|거리|계산|착오|항해|반전/,
  },
  {
    name: "technology",
    title: "요즘 이게 난리입니다",
    script: "AI 반도체 시장은 GPU 성능보다 생태계 전환 비용과 CUDA 락인이 더 큰 장벽입니다.",
    expected: /AI|반도체|GPU|생태계|CUDA|전환/,
  },
  {
    name: "finance",
    title: "왜 이렇게 됐을까요",
    script: "금리 인하 기대가 커질수록 시장이 흔들리는 이유는 채권 금리와 유동성 기대가 서로 다르게 움직이기 때문입니다.",
    expected: /금리|시장|채권|유동성|인하/,
  },
];

for (const item of cases) {
  const plan = buildThumbnailOverlayPlan({
    title: item.title,
    script: item.script,
    userOverlay: { enabled: true },
  });
  assert.equal(plan.enabled, true, `${item.name}: overlay should stay enabled`);
  assert.ok(plan.hookHeadline.length >= 6, `${item.name}: headline should be meaningful`);
  assert.ok(plan.hookHeadline.length <= 32, `${item.name}: headline should fit thumbnail overlay`);
  assert.notEqual(plan.hookHeadline, item.title, `${item.name}: generic title should be replaced`);
  assert.match(
    `${plan.hookHeadline} ${plan.highlightKeywords.join(" ")}`,
    item.expected,
    `${item.name}: headline or highlights should expose topic keywords`,
  );
  assert.match(
    plan.hookMood,
    /reveal|curiosity|warning|mysterious|educational|controversial|market/,
    `${item.name}: hook mood should be classified`,
  );
}

const stickmanPlan = buildThumbnailOverlayPlan({
  title: "콜럼버스의 계산 착오",
  script: "스틱맨 역사 설명 영상입니다.",
  stylePresetId: "stickmanplus",
  userOverlay: { enabled: true },
});
assert.equal(stickmanPlan.styleMode, "match-video");

const explicitContrastPlan = buildThumbnailOverlayPlan({
  title: "콜럼버스의 계산 착오",
  script: "스틱맨 역사 설명 영상입니다.",
  stylePresetId: "stickmanplus",
  userOverlay: { enabled: true, styleMode: "cinematic-contrast" },
});
assert.equal(explicitContrastPlan.styleMode, "cinematic-contrast", "explicit user styleMode should win");

console.log(JSON.stringify({ ok: true, checked: "thumbnail-hook-quality" }, null, 2));
