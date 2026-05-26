#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeYouTubeDraft } from "../youtube-workflow.mjs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const job = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: { scriptStructure: "hpsl" },
});
assert.equal(job.options.scriptStructure, "hpsl");

const draft = normalizeYouTubeDraft({
  title: "구글 글래스의 귀환",
  structure: "HPSL",
  hpsl: {
    hook: { narration: "구글 글래스가 다시 주목받는 이유, 생각보다 현실적입니다.", target_seconds: 7 },
    point: { narration: "핵심은 손을 쓰지 않고 정보를 확인하는 생산성입니다.", target_seconds: 13 },
    story: { narration: "공장, 병원, 여행 현장에서 사용자는 화면을 보지 않고도 다음 행동을 안내받습니다.", target_seconds: 30 },
    lesson: { narration: "하지만 촬영 알림과 개인정보 보호가 함께 설계되어야 합니다.", target_seconds: 10 },
  },
  script: "구글 글래스가 다시 주목받는 이유, 생각보다 현실적입니다. 핵심은 손을 쓰지 않고 정보를 확인하는 생산성입니다. 공장, 병원, 여행 현장에서 사용자는 화면을 보지 않고도 다음 행동을 안내받습니다. 하지만 촬영 알림과 개인정보 보호가 함께 설계되어야 합니다.",
  scenes: [],
});

assert.equal(draft.structure, "HPSL");
assert.ok(draft.hpsl.hook.narration);
assert.ok(draft.hpsl.point.narration);
assert.ok(draft.hpsl.story.narration);
assert.ok(draft.hpsl.lesson.narration);
assert.match(draft.script, /구글 글래스/);

const gemini = readFileSync(resolve(root, "automation/gemini-research-draft.mjs"), "utf8");
const openrouter = readFileSync(resolve(root, "electron/services/youtube-draft-service.mjs"), "utf8");

for (const source of [gemini, openrouter]) {
  assert.match(source, /HPSL|hook|point|story|lesson/i, "draft prompts must require HPSL");
  assert.match(source, /후킹|포인트|스토리|교훈|Hook|Point|Story|Lesson/i, "prompts must explain the HPSL roles");
}

console.log(JSON.stringify({ ok: true, checked: "hpsl-draft-structure" }));
