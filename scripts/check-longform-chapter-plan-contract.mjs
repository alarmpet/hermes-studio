#!/usr/bin/env node
import assert from "node:assert/strict";
import { buildLongformChapterPlan } from "../electron/services/longform-chapter-planner.mjs";

const scenes = Array.from({ length: 28 }, (_, index) => ({
  order: index + 1,
  narration: `Longform chapter test sentence ${index + 1}. The public chooses a comforting myth over cold facts.`,
  duration_seconds: index < 6 ? 7 : 18,
  outputMode: index < 6 ? "video" : "image",
  flowOutputMode: index < 6 ? "video" : "image",
}));

const plan = buildLongformChapterPlan({
  job: {
    id: "youtube-chapter-test",
    options: {
      videoFormat: "longform",
      longformChapteredRenderEnabled: true,
      longformTargetSeconds: 600,
      chapterTargetSeconds: 90,
      speechSpeed: 1,
    },
  },
  draft: {
    title: "Chaptered longform test",
    duration_seconds: 600,
    scenes,
  },
});

assert.equal(plan.ok, true);
assert.equal(plan.version, 1);
assert.equal(plan.targetSeconds, 600);
assert.ok(plan.chapters.length >= 4, "long scene list should split into multiple chapter jobs");
assert.ok(plan.chapters.length <= 8, "90 second target should not create too many chapters");
assert.equal(plan.chapters[0].chapterIndex, 1);
assert.equal(plan.chapters[0].chapterId, "chapter_001");
assert.ok(plan.chapters.every((chapter) => Number.isFinite(chapter.targetSeconds)), "chapter target seconds must never be NaN");
assert.ok(plan.chapters.every((chapter) => chapter.targetSeconds >= 30 && chapter.targetSeconds <= 180));
assert.ok(plan.chapters.every((chapter) => chapter.narration.trim().length > 0));
assert.ok(plan.chapters.every((chapter) => chapter.sceneOrders.length > 0), "sceneOrders must map planned scenes into chapters");
assert.equal(new Set(plan.chapters.flatMap((chapter) => chapter.sceneOrders)).size, scenes.length, "all scenes should appear exactly once");
assert.ok(plan.chapters.every((chapter) => chapter.status === "pending"));
assert.ok(plan.chapters.every((chapter) => chapter.jobDir.includes("chapters/chapter_")));

console.log(JSON.stringify({ ok: true, checked: "longform-chapter-plan-contract", chapterCount: plan.chapters.length }));
