#!/usr/bin/env node
import assert from "node:assert/strict";
import { planScenesFromScript } from "../electron/services/script-planner.mjs";

// ──────────────────────────────────────────────────────────────────────
// 1. 나폴레옹 실제 장애 케이스: 문장이 중간에서 분할되면 안 됨
// ──────────────────────────────────────────────────────────────────────
const napoleonScript = [
  "우리는 흔히 작은 체구에서 뿜어져 나오는 맹렬한 권력욕을 나폴레옹 콤플렉스라고 부릅니다.",
  "수많은 영화와 그림 속에서 그는 항상 자기 몸집보다 훨씬 큰 모자를 쓰고 화를 내는 신경질적인 꼬마로 묘사되곤 하죠.",
  "그래서 우리 머릿속의 나폴레옹은 세계를 정복했지만 키 작은 단신의 사내로 영원히 박제되어 있습니다.",
  "위대한 정복자 나폴레옹이 작은 키 때문에 평생 열등감에 시달렸다는 이야기는 아주 치명적인 역사적 착각입니다.",
  "천팔백이십일년 그가 유배 생활을 하다 쓸쓸히 사망한 직후 작성된 비밀스러운 부검 기록을 살펴보면 놀라운 사실이 숨겨져 있습니다.",
].join(" ");

const napoleonResult = planScenesFromScript({
  script: napoleonScript,
  title: "나폴레옹은 정말 키가 작았을까요",
  targetSeconds: 60,
});

const allNarrations = napoleonResult.map((s) => s.narration);

// "부릅니다" 가 별도 씬이 되면 안 됨
assert.ok(
  !allNarrations.some((n) => n.replace(/\s/g, "") === "부릅니다."),
  "부릅니다. should NOT be a standalone scene"
);

// "콤플렉스라고 부릅니다." 가 한 씬에 포함되어야 함
assert.ok(
  allNarrations.some((n) => n.includes("콤플렉스라고 부릅니다")),
  "콤플렉스라고 부릅니다 should be in the same scene"
);

// "묘사되곤 하죠" 가 한 씬에 포함되어야 함
assert.ok(
  allNarrations.some((n) => n.includes("묘사되곤 하죠")),
  "묘사되곤 하죠 should be in the same scene"
);

// "역사적 착각입니다" 가 한 씬에 포함되어야 함
assert.ok(
  allNarrations.some((n) => n.includes("역사적 착각입니다")),
  "역사적 착각입니다 should be in the same scene"
);

// "놀라운 사실이 숨겨져 있습니다" 가 한 씬에 포함되어야 함
assert.ok(
  allNarrations.some((n) => n.includes("놀라운 사실이 숨겨져 있습니다")),
  "놀라운 사실이 숨겨져 있습니다 should be in the same scene"
);

// ──────────────────────────────────────────────────────────────────────
// 2. 파편 검증: 공백 제외 10자 이하의 독립 씬이 없어야 함
// ──────────────────────────────────────────────────────────────────────
for (const scene of napoleonResult) {
  const compactLen = scene.narration.replace(/\s/g, "").length;
  assert.ok(
    compactLen > 10,
    `Scene ${scene.order} has only ${compactLen} chars (fragment): "${scene.narration}"`
  );
}

// ──────────────────────────────────────────────────────────────────────
// 3. 완결 문장 보존: 마침표로 끝나는 80자 이하 문장은 분할 금지
// ──────────────────────────────────────────────────────────────────────
const longSentence = "이것은 테스트를 위한 비교적 긴 한국어 문장이며 마침표로 완결되어야 합니다.";
const longResult = planScenesFromScript({
  script: longSentence,
  title: "테스트",
  targetSeconds: 60,
});
// 한 문장이므로 씬이 1개여야 함
assert.equal(longResult.length, 1, "Single sentence under 80 chars should not be split");
assert.ok(
  longResult[0].narration.includes("완결되어야 합니다"),
  "Complete sentence must be preserved whole"
);

// ──────────────────────────────────────────────────────────────────────
// 4. 다중 문장이 각각 보존되는지 확인
// ──────────────────────────────────────────────────────────────────────
const multiSentence = "첫 번째 문장이 여기서 끝납니다. 두 번째 문장도 온전하게 보존되어야 하며 절대로 중간에서 잘리면 안 됩니다. 세 번째 문장입니다.";
const multiResult = planScenesFromScript({
  script: multiSentence,
  title: "다중 문장 테스트",
  targetSeconds: 60,
});
// "끝납니다" 와 "안 됩니다" 가 각각 별도 씬에 있을 수는 있지만, 문장 끝에서만 분할되어야 함
for (const scene of multiResult) {
  const narr = scene.narration.trim();
  // 문장 끝이 아닌 곳에서 끊기면 안 됨 (마지막 씬 제외)
  if (scene.order < multiResult.length) {
    assert.match(
      narr,
      /[.!?]\s*$/,
      `Scene ${scene.order} narration should end with punctuation: "${narr}"`
    );
  }
}

console.log(JSON.stringify({
  ok: true,
  checked: "narration-sentence-integrity",
  napoleonScenes: napoleonResult.length,
  multiScenes: multiResult.length,
}));
