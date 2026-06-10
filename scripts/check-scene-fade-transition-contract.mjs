#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getTransitionConfig } from "../electron/services/render-effect-presets.mjs";

const transition = getTransitionConfig({ transitionPreset: "scene-fade", transitionSeconds: 0.3 });
assert.equal(transition.filter, "fade", "scene-fade should resolve to a fade transition mode");
assert.equal(transition.seconds, 0.3, "scene-fade should preserve the configured transition duration");

const renderer = readFileSync(new URL("./render-youtube-with-tts.mjs", import.meta.url), "utf8");
assert.match(renderer, /shouldApplySceneFade/, "final renderer should have a dedicated scene-fade path");
assert.match(renderer, /scene-fade-local/, "scene-fade path should report an explicit applied transition mode");
assert.match(renderer, /fade=t=in:st=0/, "scene-fade path should apply a real video fade-in filter");
assert.match(renderer, /fade=t=out:st=/, "scene-fade path should apply a real video fade-out filter");
assert.match(renderer, /LONGFORM_SCENE_FADE_SKIPPED/, "long or many-scene renders should skip slow per-scene fade re-encoding");

console.log(JSON.stringify({ ok: true, checked: "scene-fade-transition-contract" }));
