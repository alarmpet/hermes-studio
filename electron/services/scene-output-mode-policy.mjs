import {
  SAFE_VIDEO_MAX_SECONDS,
  SAFE_VIDEO_MIN_SECONDS,
  estimateNarrationSeconds,
} from "./direct-script-duration.mjs";

const REVERSAL_PATTERN = /but|however|reversal|truth|shock|nobody knew|revealed|discovered|exposed|collapsed|vanished|battle|escape|chase|betrayal|ambush|collapse|execution|exile|coup|\uD558\uC9C0\uB9CC|\uADF8\uB7F0\uB370|\uBC18\uC804|\uC9C4\uC2E4|\uCDA9\uACA9|\uC544\uBB34\uB3C4 \uBAB0\uB790|\uB4DC\uB7EC\uB0AC|\uBC1C\uACAC|\uD3ED\uB85C|\uBB34\uB108\uC84C|\uC0AC\uB77C\uC84C|\uC804\uC7C1|\uB3C4\uB9DD|\uCD94\uACA9|\uBD95\uAD34|\uBC30\uC2E0|\uB9E4\uBCF5|\uD568\uC815|\uCFE0\uB370\uD0C0|\uC720\uBC30|\uCC98\uD615|\uD0C8\uCD9C|\uCE68\uB77D|\uBAB0\uB77D/i;

export function outputModeForScene({
  sceneOrder,
  flowOutputMode = "hybrid",
  hybridIntroVideoSceneCount = 2,
  scenes = [],
  targetSeconds = 60,
  videoFormat = "shorts",
  introVideoClipCount = 10,
  speechSpeed = 1,
} = {}) {
  const mode = String(flowOutputMode || "hybrid").toLowerCase();
  const order = Math.max(1, Number(sceneOrder || 1));
  const introCount = Math.max(0, Math.min(10, Math.round(Number(hybridIntroVideoSceneCount ?? 2))));
  if (mode === "auto") {
    return resolveAutoVideoSceneDecisions({
      scenes,
      targetSeconds,
      videoFormat,
      introVideoClipCount,
      hybridIntroVideoSceneCount,
      speechSpeed,
    }).has(order) ? "video" : "image";
  }
  if (mode === "hybrid") return order <= introCount ? "video" : "image";
  if (mode === "image") return "image";
  return "video";
}

export function assignSceneOutputModes({
  scenes = [],
  flowOutputMode = "hybrid",
  hybridIntroVideoSceneCount = 2,
  targetSeconds = 60,
  videoFormat = "shorts",
  introVideoClipCount = 10,
  speechSpeed = 1,
} = {}) {
  const autoDecisions = String(flowOutputMode || "").toLowerCase() === "auto"
    ? resolveAutoVideoSceneDecisions({ scenes, targetSeconds, videoFormat, introVideoClipCount, hybridIntroVideoSceneCount, speechSpeed })
    : null;
  return scenes.map((scene, index) => {
    const order = Number(scene.order || index + 1);
    const autoReason = autoDecisions?.get(order) || "";
    const autoRejectedReason = autoDecisions?.rejected?.get(order) || "";
    const outputMode = autoDecisions
      ? (autoDecisions.has(order) ? "video" : "image")
      : outputModeForScene({ sceneOrder: order, flowOutputMode, hybridIntroVideoSceneCount, speechSpeed });
    return { ...scene, outputMode, flowOutputMode: outputMode, autoReason, autoRejectedReason };
  });
}

export function resolveAutoVideoSceneOrders(options = {}) {
  return new Set(resolveAutoVideoSceneDecisions(options).keys());
}

export function resolveAutoVideoSceneDecisions({
  scenes = [],
  targetSeconds = 60,
  videoFormat = "shorts",
  introVideoClipCount = 10,
  hybridIntroVideoSceneCount = 2,
  speechSpeed = 1,
} = {}) {
  const normalized = scenes.map((scene, index) => ({
    ...scene,
    order: Number(scene.order || index + 1),
  }));
  if (!normalized.length) return new Map();
  return String(videoFormat || "shorts") === "longform"
    ? resolveLongformAutoOrders({ scenes: normalized, targetSeconds, introVideoClipCount, speechSpeed })
    : resolveShortformAutoOrders({ scenes: normalized, targetSeconds, hybridIntroVideoSceneCount });
}

function resolveShortformAutoOrders({ scenes, targetSeconds, hybridIntroVideoSceneCount }) {
  const seconds = Number(targetSeconds || 60);
  const decisions = new Map();
  const introCount = seconds <= 90
    ? Math.max(1, Math.min(2, Number(hybridIntroVideoSceneCount || 2)))
    : 2;
  for (const scene of scenes.slice(0, introCount)) decisions.set(scene.order, "hook");
  if (seconds <= 90) return decisions;

  const climaxIndex = Math.max(introCount, Math.floor(scenes.length * 0.72));
  const reversal = strongestStoryBeat(scenes.slice(introCount, climaxIndex));
  if (reversal) decisions.set(reversal.order, "reversal");

  const climax = strongestStoryBeat(scenes.slice(climaxIndex)) || scenes[Math.min(scenes.length - 1, climaxIndex)];
  if (climax) decisions.set(climax.order, "climax");

  if (seconds > 180) {
    const interval = seconds <= 300 ? 55 : 75;
    const cumulative = cumulativeSceneTimes(scenes);
    let lastVideoTime = cumulative.find((item) => item.order === introCount)?.time || 0;
    for (const item of cumulative) {
      if (item.order <= introCount || decisions.has(item.order)) continue;
      if (item.time - lastVideoTime >= interval) {
        decisions.set(item.order, "periodic-beat");
        lastVideoTime = item.time;
      }
    }
  }
  return capDecisionsByRatio(decisions, scenes, seconds <= 180 ? 0.34 : 0.28);
}

function resolveLongformAutoOrders({ scenes, targetSeconds, introVideoClipCount, speechSpeed = 1 }) {
  const decisions = new Map();
  const rejected = new Map();

  const introCount = Math.max(4, Math.min(10, Math.round(Number(introVideoClipCount || 8))));
  for (const scene of scenes.slice(0, introCount)) {
    const est = estimateNarrationSeconds({ text: scene.narration, speechSpeed });
    if (est >= SAFE_VIDEO_MIN_SECONDS && est <= SAFE_VIDEO_MAX_SECONDS) {
      decisions.set(scene.order, "hook");
    } else if (est < SAFE_VIDEO_MIN_SECONDS) {
      rejected.set(scene.order, `opening narration too short (estimated ${est.toFixed(2)}s)`);
    } else {
      rejected.set(scene.order, `opening narration too long (estimated ${est.toFixed(2)}s > ${SAFE_VIDEO_MAX_SECONDS}s)`);
    }
  }

  const seenChapters = new Set();
  let lastBodyVideoSecond = cumulativeSceneTimes(scenes).find((item) => item.order === introCount)?.time || 0;
  for (const item of cumulativeSceneTimes(scenes).slice(introCount)) {
    const chapter = item.chapter || item.section || "";
    const isChapterStart = chapter && !seenChapters.has(chapter);
    if (chapter) seenChapters.add(chapter);
    const isReversal = REVERSAL_PATTERN.test(String(item.narration || ""));
    if (isChapterStart || isReversal) {
      const est = estimateNarrationSeconds({ text: item.narration, speechSpeed });
      const isTooShort = est < SAFE_VIDEO_MIN_SECONDS;
      const isTooLong = est > SAFE_VIDEO_MAX_SECONDS;
      const hasSpacing = item.time - lastBodyVideoSecond >= 45;

      if (isTooLong) {
        rejected.set(item.order, `narration too long (estimated ${est.toFixed(2)}s > ${SAFE_VIDEO_MAX_SECONDS}s)`);
      } else if (isTooShort) {
        rejected.set(item.order, `narration too short (estimated ${est.toFixed(2)}s < ${SAFE_VIDEO_MIN_SECONDS}s)`);
      } else if (!hasSpacing) {
        rejected.set(item.order, `too close to last body video (spacing ${Math.round(item.time - lastBodyVideoSecond)}s < 45s)`);
      } else {
        decisions.set(item.order, isChapterStart ? "chapter-start" : "reversal");
        lastBodyVideoSecond = item.time;
      }
    }
  }

  const capped = capDecisionsByRatio(decisions, scenes, Number(targetSeconds || 720) >= 600 ? 0.25 : 0.3);
  for (const [order, reason] of decisions.entries()) {
    if (!capped.has(order)) {
      rejected.set(order, `capped by ratio limit (${reason})`);
    }
  }
  capped.rejected = rejected;
  return capped;
}

function strongestStoryBeat(candidates = []) {
  const best = candidates
    .map((scene) => ({ scene, score: storyBeatScore(scene) }))
    .sort((a, b) => b.score - a.score)[0];
  return best && best.score > 0 ? best.scene : undefined;
}

function storyBeatScore(scene = {}) {
  const text = `${scene.section || ""} ${scene.chapter || ""} ${scene.visual_category || ""} ${scene.narration || ""}`;
  let score = 0;
  if (/hook|cold_open/i.test(text)) score += 5;
  if (/story|deep_dive|examples/i.test(text)) score += 2;
  if (REVERSAL_PATTERN.test(text)) score += 6;
  if (/lesson|takeaway/i.test(text)) score += 1;
  return score;
}

function cumulativeSceneTimes(scenes = []) {
  let time = 0;
  return scenes.map((scene) => {
    const duration = Math.max(1, Number(scene.duration_seconds || 8));
    time += duration;
    return { ...scene, time, duration_seconds: duration };
  });
}

function capDecisionsByRatio(decisions, scenes, ratio) {
  const cap = Math.max(1, Math.ceil(scenes.length * ratio));
  if (decisions.size <= cap) return decisions;
  const priority = { hook: 100, climax: 90, reversal: 80, "chapter-start": 70, "periodic-beat": 40 };
  const keep = Array.from(decisions.entries())
    .sort(([orderA, reasonA], [orderB, reasonB]) => {
      const priorityDiff = (priority[reasonB] || 0) - (priority[reasonA] || 0);
      return priorityDiff || orderA - orderB;
    })
    .slice(0, cap)
    .sort(([orderA], [orderB]) => orderA - orderB);
  return new Map(keep);
}
