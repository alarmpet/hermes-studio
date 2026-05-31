#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildGeminiPrompt, buildGemsPrompt } from "../automation/gemini-research-draft.mjs";
import { normalizeYouTubeJobRequest } from "../youtube-job-schema.mjs";

const job = normalizeYouTubeJobRequest({
  sourceType: "url",
  sourceValue: "https://n.news.naver.com/mnews/article/025/0003525830",
  options: {
    flowOutputMode: "hybrid",
    hybridIntroVideoSceneCount: 1,
    scriptLengthPreset: "standard",
  },
});

const gemsPrompt = buildGemsPrompt(job);
assert.match(gemsPrompt, /^URL:\s*https:\/\/n\.news\.naver\.com\/mnews\/article\/025\/0003525830/m);
assert.match(gemsPrompt, /Return ONE raw JSON object/i);
assert.match(gemsPrompt, /title.*structure.*hpsl.*script.*scenes/is, "Gems prompt should name the Hermes schema keys");
assert.match(gemsPrompt, /HPSL.*Hook.*Point.*Story.*Lesson/is, "Gems prompt should keep the simplified HPSL contract");
assert.match(gemsPrompt, /Target duration:\s*60 seconds/i);
assert.match(gemsPrompt, /image_prompt/i, "Gems prompt should require scene prompts in Hermes format");
assert.match(gemsPrompt, /cinematic.*storytelling/i, "Gems prompt should keep the user's cinematic storytelling intent");
assert.doesNotMatch(gemsPrompt, /썸네일|비디오 프롬프트\(EN\)|나레이션\(KR\)/, "Gems prompt should not request the user's alternate Korean schema");
assert.ok(gemsPrompt.length < 1950, "Gems prompt should stay compact because the Gem already has instructions");

const normalPrompt = buildGeminiPrompt(job);
assert.match(normalPrompt, /OUTPUT FORMAT/i, "normal Gemini fallback should keep full schema instructions");

console.log(JSON.stringify({ ok: true, checked: "gemini-gems-compact-prompt" }));
