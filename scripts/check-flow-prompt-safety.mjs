#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeFlowPrompt, isFlowPolicyWarningText } from "../electron/services/flow-prompt-safety.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const thisFile = readFileSync(fileURLToPath(import.meta.url), "utf8");
assert.doesNotMatch(thisFile, /C:[/\\]Users[/\\]amd[/\\]hermes/i, "check script must not hardcode the local repo path");

const risky = [
  "9:16 cinematic scene of Elon Musk presenting a new robot on stage.",
  "A realistic video of BTS Jungkook walking through Seoul.",
  "Donald Trump speaking at a podium, close-up face, photorealistic.",
  "Son Heung-min scoring a goal in a stadium.",
].join("\n");

const result = sanitizeFlowPrompt(risky, {
  title: "AI news",
  sceneOrder: 1,
  visualCategory: "news-context",
});

assert.equal(result.changed, true, "known public figure prompts must be changed");
assert.doesNotMatch(result.prompt, /Elon Musk|Jungkook|Donald Trump|Son Heung-min/i);
assert.match(result.prompt, /tech company CEO|K-pop singer|former US president|professional football player/i);
assert.match(result.prompt, /Do not depict any identifiable real public figure/i);
assert.ok(result.flags.includes("PUBLIC_FIGURE_REFERENCE"));

const dynamic = sanitizeFlowPrompt(
  "9:16 cinematic scene of Sam Altman walking into a conference hall while reporters gather.",
  {
    title: "OpenAI CEO Sam Altman news",
    sceneOrder: 2,
    visualCategory: "news-context",
  },
);

assert.doesNotMatch(dynamic.prompt, /Sam Altman/i);
assert.match(dynamic.prompt, /technology company executive|anonymous|symbolic|public figure/i);
assert.ok(dynamic.flags.includes("DYNAMIC_PUBLIC_FIGURE_CANDIDATE"));

assert.equal(isFlowPolicyWarningText("이 프롬프트는 유명인의 동영상 생성에 관한 Google 정책을 위반할 가능성이 있습니다."), true);
assert.equal(isFlowPolicyWarningText("This prompt may violate Google policy for celebrity video generation."), true);
assert.equal(isFlowPolicyWarningText("Flow did not expose a new video URL."), false);

const stickmanHistorySafe = sanitizeFlowPrompt(
  "Draw Napoleon Bonaparte with a Korean sign saying 진짜 키. Microsoft logo appears on the map.",
  { title: "나폴레옹 키 조작", sceneOrder: 1, visualCategory: "history-stickmanplus" },
);
assert.doesNotMatch(stickmanHistorySafe.prompt, /Napoleon Bonaparte|Microsoft|진짜 키/i);
assert.match(stickmanHistorySafe.prompt, /anonymous historical ruler|generic historical figure|no readable text|no logos/i);

console.log(JSON.stringify({ ok: true, checked: "flow-prompt-safety", root }));
