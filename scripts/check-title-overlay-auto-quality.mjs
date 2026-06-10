#!/usr/bin/env node
import assert from "node:assert/strict";
import { resolveTitleOverlayText } from "../electron/services/title-overlay-text-resolver.mjs";
import { wrapBalancedTitle } from "../electron/services/title-overlay-layout.mjs";

const latest = resolveTitleOverlayText({
  job: {
    sourceType: "script",
    sourceValue: "나폴레옹 키 조작 역사",
    options: { titleOverlayMode: "auto", titleOverlayText: "", titleOverlayMaxLines: 2 },
  },
  draft: {
    title: "우리는 흔히 작은 체구에서 뿜어져 나오는 맹렬한 권력욕을 나폴레옹 콤플렉스라고 부릅니다.",
    hpsl: {
      hook: { narration: "나폴레옹은 정말 키가 작았을까요?" },
      point: { narration: "우리가 믿은 작은 황제 이미지는 조작된 선전일 수 있습니다." },
    },
    script: "우리는 흔히 작은 체구에서 뿜어져 나오는 맹렬한 권력욕을 나폴레옹 콤플렉스라고 부릅니다.",
  },
});

assert.ok(Array.from(latest.text.replace(/\s+/g, "")).length <= 18, "auto title must fit two-line Shorts band");
assert.doesNotMatch(latest.text, /우리\s*흔히|뿜어져\s*나오|부릅니다/, "auto title must not use narration filler fragments");
assert.match(latest.text, /나폴레옹|작은\s*황제|키|조작|진실/, "auto title should keep the core hook keyword");

const lines = wrapBalancedTitle(latest.text, { maxChars: 10, maxLines: 2 });
assert.ok(lines.length <= 2, "auto title should wrap to at most two lines");
assert.ok(lines.every((line) => Array.from(line.replace(/\s+/g, "")).length <= 10), "each line should fit");

console.log(JSON.stringify({ ok: true, checked: "title-overlay-auto-quality", title: latest.text, lines }));
