import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const renderer = readFileSync(new URL("../electron/renderer/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../electron/renderer/index.html", import.meta.url), "utf8");
const service = readFileSync(new URL("../electron/services/youtube-job-service.mjs", import.meta.url), "utf8");
const main = readFileSync(new URL("../electron/main.mjs", import.meta.url), "utf8");
const progress = readFileSync(new URL("../electron/services/job-progress-events.mjs", import.meta.url), "utf8");

assert.match(progress, /JOB_PROGRESS_PHASES/, "progress contract should define phases");
assert.match(html, /id="progressSteps"/, "renderer should contain progress steps");
assert.match(html, /id="currentProgressMessage"/, "renderer should contain current progress message");
assert.match(html, /id="progressActionRequired"/, "renderer should contain action-required message area");
assert.match(renderer, /function updateProgressUi/, "renderer should update progress UI from events");
assert.match(renderer, /event\?\.type === "job-progress"/, "renderer should consume job-progress events");
assert.match(renderer, /Generating\.\.\./, "generate button should change label while running");
assert.match(service, /progressContext = \{ \.\.\.context, job \}/, "job service should pass job into progress context");
assert.match(service, /emitJobProgress/, "job service should emit structured progress events");
assert.match(service, /status:\s*"action-required"/, "Flow stub should emit action-required state");
assert.match(service, /renderFinalVideoWithProgress/, "render stage should emit progress before final render");
assert.match(main, /desktop-job-failed/, "main process should emit desktop-job-failed events");

console.log("Desktop progress feedback contract OK");
