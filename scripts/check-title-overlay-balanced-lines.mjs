#!/usr/bin/env node
import assert from "node:assert/strict";
import { wrapBalancedTitle } from "../electron/services/title-overlay-layout.mjs";

const compact = wrapBalancedTitle("구글글래스의 숨은 반전", { maxChars: 10, maxLines: 2 });
assert.deepEqual(compact, ["구글글래스의", "숨은 반전"], "compact Korean titles should split into visually balanced lines");

const spaced = wrapBalancedTitle("구글 글래스의 숨은 반전", { maxChars: 10, maxLines: 2 });
assert.deepEqual(spaced, ["구글 글래스의", "숨은 반전"], "spaced Korean titles should avoid a tiny second line");

const oneLine = wrapBalancedTitle("짧은 제목", { maxChars: 10, maxLines: 2 });
assert.deepEqual(oneLine, ["짧은 제목"], "short titles should stay on one line");

const longToken = wrapBalancedTitle("초장문키워드테스트입니다", { maxChars: 7, maxLines: 2 });
assert.ok(longToken.every((line) => Array.from(line).length <= 7), "long unspaced titles should respect maxChars");
assert.ok(Math.abs(Array.from(longToken[0]).length - Array.from(longToken[1]).length) <= 2, "long unspaced titles should split near the midpoint");

console.log(JSON.stringify({ ok: true, checked: "title-overlay-balanced-lines" }));
