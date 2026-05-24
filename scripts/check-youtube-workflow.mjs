#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const botPath = resolve(root, "telegram-flow-news-bot.mjs");

function classify(text) {
  const result = spawnSync(process.execPath, [botPath, "--test-classify", text], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      HERMES_STRATEGY_GATE_OFFLINE: "1",
    },
  });
  if (result.status !== 0) {
    throw new Error(`classification command failed:\n${result.stderr || result.stdout}`);
  }
  return JSON.parse(result.stdout).task;
}

assert.equal(classify("/yt AI 뉴스 쇼츠 만들어줘"), "youtube-workflow");
assert.equal(classify("/yturl https://example.com/news/article 영상 만들어줘"), "youtube-workflow");
assert.equal(classify("https://www.edaily.co.kr/News/Read?newsId=02010646645451872&mediaCodeNo=257&OutLnkChk=Y 이 기사로 쇼츠영상 만들어"), "youtube-workflow");
assert.equal(classify("최종확정"), "youtube-final-confirm");

const workflow = await import("../youtube-workflow.mjs");
const botSource = await import("node:fs").then((fs) => fs.readFileSync(botPath, "utf8"));

assert.match(botSource, /disableFlowAudio/i, "Flow video settings should explicitly disable audio for silent B-roll generation");
assert.match(botSource, /audio generation/i, "Flow media failures should surface audio generation errors");
assert.match(botSource, /sceneAttempt <= 2/i, "YouTube Flow scene generation should retry once before skipping a scene");
assert.match(botSource, /missingScenes/i, "Final confirmation should detect incomplete YouTube scene sets before rendering");
assert.doesNotMatch(botSource, /아래 영상들을 검토해주세요/, "YouTube workflow should not send scene videos one by one for review");
assert.doesNotMatch(botSource, /for\s*\(\s*const media of mediaFiles\s*\)[\s\S]*?sendVideo/, "YouTube workflow should not send each generated scene video");
assert.match(botSource, /renderAndSendYouTubeFinalVideo/, "YouTube workflow should render and send only the final video");
assert.match(botSource, /character_profile/, "YouTube draft prompt should request a stable character profile");
assert.match(botSource, /ytApplyConsistentCharacterProfile/, "Telegram workflow should enforce character consistency before Flow generation");

assert.equal(workflow.extractTargetUrl("/yturl https://example.com/a?b=1 영상"), "https://example.com/a?b=1");
assert.equal(workflow.normalizeYoutubeInput("/yt   반도체 뉴스 쇼츠"), "반도체 뉴스 쇼츠");

const draft = workflow.normalizeYouTubeDraft({
  title: "테스트 제목",
  duration_seconds: 90,
  script: "인트로\n본문",
  scenes: [
    { narration: "첫 장면", image_prompt: "cinematic first scene" },
    { narration: "둘째 장면", image_prompt: "cinematic second scene" },
    { narration: "셋째 장면", image_prompt: "cinematic third scene" },
  ],
});

assert.equal(draft.scenes.length, 3);
assert.equal(draft.scenes[0].order, 1);
assert.equal(draft.scenes[0].duration_seconds, 8);
assert.ok(draft.character_profile.includes("same recurring"), "normalized draft should include a reusable character profile");
for (const scene of draft.scenes) {
  assert.ok(scene.image_prompt.includes(draft.character_profile), "every scene prompt should include the same character profile");
}

const parsed = workflow.parseJsonMarkdown("```json\n{\"title\":\"A\",\"script\":\"B\",\"scenes\":[{\"narration\":\"n\",\"image_prompt\":\"p\"},{\"narration\":\"n2\",\"image_prompt\":\"p2\"},{\"narration\":\"n3\",\"image_prompt\":\"p3\"}]}\n```");
assert.equal(parsed.title, "A");

console.log(JSON.stringify({ ok: true, checked: "youtube-workflow" }));
