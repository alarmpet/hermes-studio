import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const renderer = readFileSync(new URL("../electron/renderer/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../electron/renderer/index.html", import.meta.url), "utf8");
const service = readFileSync(new URL("../electron/services/youtube-job-service.mjs", import.meta.url), "utf8");
const draftService = readFileSync(new URL("../electron/services/youtube-draft-service.mjs", import.meta.url), "utf8");
const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
const progress = readFileSync(new URL("../electron/services/job-progress-events.mjs", import.meta.url), "utf8");
const flowAutomation = readFileSync(new URL("../automation/google-flow-media.mjs", import.meta.url), "utf8");

assert.match(progress, /JOB_PROGRESS_PHASES/, "progress contract should define phases");
assert.match(html, /id="progressSteps"/, "renderer should contain progress steps");
assert.match(html, /id="currentProgressMessage"/, "renderer should contain current progress message");
assert.match(html, /id="progressActionRequired"/, "renderer should contain action-required message area");
assert.match(renderer, /function updateProgressUi/, "renderer should update progress UI from events");
assert.match(renderer, /event\?\.type === "job-progress"/, "renderer should consume job-progress events");
assert.match(renderer, /Generating\.\.\./, "generate button should change label while running");
assert.match(service, /progressContext = \{ \.\.\.context, job \}/, "job service should pass job into progress context");
assert.match(service, /emitJobProgress/, "job service should emit structured progress events");
assert.match(service, /status:\s*"action-required"/, "Flow failures should emit action-required state");
assert.match(service, /renderFinalVideoWithProgress/, "render stage should emit progress before final render");
assert.match(service, /generateGoogleFlowVideoFromPrompt/, "desktop service should call the real Google Flow automation module");
assert.match(service, /buildDraft:\s*buildDraftWithProgress/, "desktop service should generate a real draft before Flow media generation");
assert.doesNotMatch(service, /not wired yet/, "desktop Flow media generation must not remain a not-wired stub");
assert.match(draftService, /OpenRouter/, "desktop draft service should use OpenRouter for script generation");
assert.match(draftService, /response_format:\s*\{\s*type:\s*"json_object"\s*\}/, "desktop draft generation should request JSON output");
assert.match(draftService, /fetchArticleSource/, "desktop draft service should support URL article sources");
assert.match(flowAutomation, /launchPersistentContext/, "Flow automation should use the authenticated persistent profile");
assert.match(flowAutomation, /Flow did not expose a new video URL/, "Flow automation should save diagnostic evidence when no video is exposed");
assert.match(flowAutomation, /scene_\$\{sceneOrder\}_flow_submitted\.png/, "Flow automation should save a post-submit screenshot");
assert.match(flowAutomation, /scene_\$\{sceneOrder\}_flow_waiting\.png/, "Flow automation should save a waiting screenshot");
assert.match(service, /onProgress:\s*\(\{ message, details \}\)/, "desktop service should forward Flow internal progress to the UI");
assert.match(main, /desktop-job-failed/, "main process should emit desktop-job-failed events");

console.log("Desktop progress feedback contract OK");
