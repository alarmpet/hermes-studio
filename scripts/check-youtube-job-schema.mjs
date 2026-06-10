#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  DEFAULT_UPLOAD_OPTIONS,
  DEFAULT_YOUTUBE_JOB_OPTIONS,
  normalizeYouTubeJobRequest,
  SCRIPT_LENGTH_PRESETS,
  SUBTITLE_STYLE_PRESETS,
  VOICE_PRESETS,
} from "../youtube-job-schema.mjs";

assert.ok(SCRIPT_LENGTH_PRESETS.short.sceneCount >= 3, "short preset should create multiple scenes");
assert.ok(SCRIPT_LENGTH_PRESETS.standard.targetSeconds >= 60, "standard preset should support normal shorts length");
assert.ok(VOICE_PRESETS.some((voice) => voice.id === "M1"), "Supertonic M1 voice preset should exist");
assert.ok(VOICE_PRESETS.some((voice) => voice.id === "male_30_announcer"), "professional male announcer preset should exist");
assert.ok(VOICE_PRESETS.some((voice) => voice.id === "female_60_low"), "professional older low female preset should exist");
assert.ok(SUBTITLE_STYLE_PRESETS.some((style) => style.id === "bold-shorts"), "bold shorts subtitle preset should exist");

const keywordJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "최신 AI 뉴스",
  options: { scriptLengthPreset: "standard", voiceId: "M1", subtitleStyleId: "bold-shorts" },
});

assert.equal(keywordJob.sourceType, "keyword");
assert.equal(keywordJob.options.voiceId, "M1");
assert.equal(keywordJob.options.subtitleStyleId, "bold-shorts");
assert.equal(keywordJob.options.scriptLengthPreset, "standard");
assert.equal(keywordJob.options.sceneStrategy, "sentence-proportional");
assert.equal(keywordJob.options.customDurationSeconds, 60);
assert.equal(keywordJob.options.scriptStructure, "hpsl");
assert.equal(keywordJob.options.sendIntermediateMedia, false);
assert.equal(keywordJob.options.flowOutputMode, "hybrid");
assert.equal(keywordJob.options.stylePresetId, "stickmanplus", "default visual style should be StickmanPlus history");
assert.equal(keywordJob.options.titleOverlayEnabled, true);
assert.equal(keywordJob.options.titleOverlayMode, "auto", "title overlay should default to auto mode");
assert.equal(keywordJob.options.titleOverlayStyleId, "bold-black-accent");
assert.equal(keywordJob.upload.enabled, false);
assert.equal(keywordJob.upload.containsSyntheticMedia, true);

const manualTitleJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "구글 글래스",
  options: { titleOverlayText: "직접 쓴 상단 제목", titleOverlayMode: "manual" },
});
assert.equal(manualTitleJob.options.titleOverlayMode, "manual");
assert.equal(manualTitleJob.options.titleOverlayText, "직접 쓴 상단 제목");

assert.throws(
  () => normalizeYouTubeJobRequest({
    sourceType: "keyword",
    sourceValue: "구글 글래스",
    options: { titleOverlayMode: "bad-mode" },
  }),
  /Unknown titleOverlayMode/,
);

const urlJob = normalizeYouTubeJobRequest({
  sourceType: "url",
  sourceValue: "https://example.com/article",
  options: DEFAULT_YOUTUBE_JOB_OPTIONS,
  upload: DEFAULT_UPLOAD_OPTIONS,
});

assert.equal(urlJob.sourceType, "url");
assert.match(urlJob.sourceValue, /^https:\/\//);

const pastedUrlInKeywordTabJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "https://example.com/pasted-article",
  options: DEFAULT_YOUTUBE_JOB_OPTIONS,
});

assert.equal(pastedUrlInKeywordTabJob.sourceType, "url", "pasted URLs should be treated as URL jobs even when the Keyword tab is selected");

const customJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "custom length",
  options: { scriptLengthMode: "custom", customDurationSeconds: 180 },
});

assert.equal(customJob.options.scriptLengthMode, "custom");
assert.equal(customJob.options.customDurationSeconds, 180);
assert.equal(customJob.options.aspectRatio, "9:16", "default output aspect should remain vertical");

const landscapeJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "custom landscape",
  options: { scriptLengthMode: "custom", customDurationSeconds: 180, autoLandscapeLongform: true },
});
assert.equal(landscapeJob.options.aspectRatio, "16:9", "checked 3min+ jobs should switch to horizontal output");
assert.equal(landscapeJob.options.titleOverlayEnabled, false, "3min+ horizontal jobs should not render top title overlays");

const longformTitleDefaultJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "history longform",
  options: { videoFormat: "longform", scriptLengthMode: "custom", customDurationSeconds: 600 },
});
assert.equal(longformTitleDefaultJob.options.titleOverlayEnabled, false, "longform title overlay should be opt-in by default");

const longformTitleOptInJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "history longform",
  options: { videoFormat: "longform", scriptLengthMode: "custom", customDurationSeconds: 600, titleOverlayEnabled: true },
});
assert.equal(longformTitleOptInJob.options.titleOverlayEnabled, false, "longform should not preserve top-title opt-in");

const professionalVoiceJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "voice preset",
  options: { voiceId: "female_60_low" },
});

assert.equal(professionalVoiceJob.options.voiceId, "female_60_low");
assert.equal(professionalVoiceJob.options.speechSpeed, 0.94);

assert.throws(
  () => normalizeYouTubeJobRequest({ sourceType: "keyword", sourceValue: "", options: {} }),
  /sourceValue/,
);

assert.throws(
  () => normalizeYouTubeJobRequest({ sourceType: "url", sourceValue: "not-a-url", options: {} }),
  /http/,
);

assert.equal(normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "image mode",
  options: { flowOutputMode: "image" },
}).options.flowOutputMode, "image");

const hybridJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { flowOutputMode: "hybrid", hybridIntroVideoSceneCount: 2 },
});
assert.equal(hybridJob.options.flowOutputMode, "hybrid");
assert.equal(hybridJob.options.hybridIntroVideoSceneCount, 2);

assert.equal(normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "auto mode",
  options: { flowOutputMode: "auto" },
}).options.flowOutputMode, "auto");

assert.equal(normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "longform auto default",
  options: { videoFormat: "longform", customDurationSeconds: 600 },
}).options.flowOutputMode, "auto");

assert.equal(normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "longform explicit image",
  options: { videoFormat: "longform", customDurationSeconds: 600, flowOutputMode: "image" },
}).options.flowOutputMode, "image");

const chapteredLongformJob = normalizeYouTubeJobRequest({
  sourceType: "script",
  sourceValue: "긴 대본을 챕터 단위로 나누어 렌더링하는 검증입니다.",
  options: {
    videoFormat: "longform",
    scriptLengthMode: "custom",
    customDurationSeconds: 600,
    longformChapteredRenderEnabled: true,
    chapterTargetSeconds: 999,
  },
});
assert.equal(chapteredLongformJob.options.longformChapteredRenderEnabled, true);
assert.equal(chapteredLongformJob.options.chapterTargetSeconds, 120, "chapter target seconds should clamp to 60-120 seconds");

const chapteredShortsJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "shorts should not chapter render",
  options: { longformChapteredRenderEnabled: true, chapterTargetSeconds: 1 },
});
assert.equal(chapteredShortsJob.options.longformChapteredRenderEnabled, false);
assert.equal(chapteredShortsJob.options.chapterTargetSeconds, 60);

const clampedHybridJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { flowOutputMode: "hybrid", hybridIntroVideoSceneCount: 99 },
});
assert.equal(clampedHybridJob.options.hybridIntroVideoSceneCount, 10);

const effectsJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: {
    renderEffectPreset: "cinematic",
    transitionPreset: "smooth-crossfade",
    transitionSeconds: 0.35,
  },
});
assert.equal(effectsJob.options.renderEffectPreset, "cinematic");
assert.equal(effectsJob.options.transitionPreset, "smooth-crossfade");
assert.equal(effectsJob.options.transitionSeconds, 0.35);
assert.equal(effectsJob.options.motionIntensity, "strong");
assert.equal(effectsJob.options.smoothFrameInterpolation, false);

const strongEffectsJob = normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { motionIntensity: "high" },
});
assert.equal(strongEffectsJob.options.motionIntensity, "strong");

assert.throws(() => normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { renderEffectPreset: "chaos" },
}), /Unknown renderEffectPreset/);

assert.throws(() => normalizeYouTubeJobRequest({
  sourceType: "keyword",
  sourceValue: "google glass",
  options: { transitionPreset: "spinny" },
}), /Unknown transitionPreset/);

assert.throws(
  () => normalizeYouTubeJobRequest({
    sourceType: "keyword",
    sourceValue: "bad mode",
    options: { flowOutputMode: "gif" },
  }),
  /Unknown flowOutputMode/,
);

console.log(JSON.stringify({ ok: true, checked: "youtube-job-schema" }));
