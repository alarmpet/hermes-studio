#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildGeminiPrompt } from "../automation/gemini-research-draft.mjs";
import { buildDirectScriptDraft } from "../electron/services/direct-script-draft-service.mjs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const geminiPrompt = buildGeminiPrompt(normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { flowOutputMode: "hybrid", hybridIntroVideoSceneCount: 2 },
}));
assert.match(geminiPrompt, /hybridIntroVideoSceneCount|opening video scenes/i, "Gemini prompt should explain hybrid opening video scenes");
assert.match(geminiPrompt, /35\uc790|35 characters|35 chars|35 Korean characters/i, "Gemini prompt should limit early video-scene narration length");
assert.match(geminiPrompt, /Flow video|Veo|opening video/i, "Gemini prompt should make the early video-scene constraint explicit");

const directDraftService = readFileSync(new URL("../electron/services/direct-script-draft-service.mjs", import.meta.url), "utf8");
assert.match(directDraftService, /hybrid_hook_narration_warning|hybridHookNarrationWarning/, "Direct script drafts should flag overlong hybrid hook narrations");

const directJob = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "첫 문장이 지나치게 길어서 초반 영상 훅으로 쓰기에는 한 화면에서 이해하기 어렵고 영상 생성 프롬프트도 산만해질 수 있습니다. 두 번째 문장도 핵심 장면을 빠르게 보여줘야 합니다. 나머지는 이미지 장면으로 안정적으로 설명합니다.",
  options: { flowOutputMode: "hybrid", hybridIntroVideoSceneCount: 1 },
});
const directDraft = buildDirectScriptDraft(directJob);
assert.equal(directDraft.scenes[0].outputMode, "video", "first hybrid scene should be video");
assert.ok(directDraft.scenes[0].hybrid_hook_narration_warning, "overlong opening video scene should carry a warning");
assert.equal(directDraft.scenes[1].outputMode, "image", "remaining hybrid scenes should be image when intro count is one");

console.log("Hybrid hook narration guard contract OK");
