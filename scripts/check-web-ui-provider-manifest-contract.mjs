#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const flowAutomation = readFileSync(resolve(root, "automation/google-flow-media.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");
const workflow = readFileSync(resolve(root, "youtube-workflow.mjs"), "utf8");
const packageJson = readFileSync(resolve(root, "package.json"), "utf8");

assert.match(flowAutomation, /createWebUiProviderContext/, "Google Flow should launch through the shared Web UI harness");
assert.match(flowAutomation, /jobOptions\s*=\s*\{\}/, "Google Flow should accept jobOptions for tracing and provider behavior");
assert.match(flowAutomation, /startWebUiTrace/, "Google Flow should start conditional Web UI traces");
assert.match(flowAutomation, /stopWebUiTrace/, "Google Flow should stop Web UI traces on success and failure");
assert.match(flowAutomation, /writeWebUiEvidence/, "Google Flow should persist failure evidence through the shared helper");
assert.match(flowAutomation, /provider:\s*"google-flow"/, "Google Flow results should identify the provider");
assert.match(flowAutomation, /providerOrigin:\s*"web-ui"/, "Google Flow results should identify web-ui origin");
assert.match(flowAutomation, /evidence/, "Google Flow results should carry evidence paths");
assert.doesNotMatch(flowAutomation, /releaseAppManagedAuthWindow\(profileDir\)/, "Google Flow should not bypass the shared Web UI harness");
assert.doesNotMatch(flowAutomation, /const context = await chromium\.launchPersistentContext/, "Google Flow should not launch Playwright directly");

assert.match(stages, /jobOptions:\s*job\?\.options\s*\|\|\s*\{\}/, "stages should pass job options into Google Flow automation");
assert.match(stages, /providerOrigin:\s*imageMedia\.providerOrigin\s*\|\|\s*"web-ui"/, "Flow image fallback should preserve provider origin");
assert.match(stages, /providerOrigin:\s*media\.providerOrigin\s*\|\|\s*"web-ui"/, "Flow media render results should preserve provider origin");
assert.match(stages, /evidence:\s*media\.evidence\s*\|\|\s*\{\}/, "Flow media render results should preserve evidence");

assert.match(workflow, /providerOrigin:\s*media\.providerOrigin\s*\|\|\s*""/, "scene media manifest should store success provider origin");
assert.match(workflow, /providerOrigin:\s*error\.details\?\.providerOrigin\s*\|\|\s*error\.providerOrigin/, "scene media manifest should store failure provider origin");
assert.match(workflow, /evidence:\s*media\.evidence\s*\|\|\s*\{\}/, "scene media manifest should store success evidence");
assert.match(workflow, /evidence:\s*error\.details\?\.evidence\s*\|\|\s*error\.evidence/, "scene media manifest should store failure evidence");
assert.match(workflow, /retryable:\s*Boolean/, "scene media manifest should preserve retryable failures");
assert.match(packageJson, /check-web-ui-provider-manifest-contract\.mjs/, "package checks should include the Web UI provider manifest contract");

console.log(JSON.stringify({ ok: true, checked: "web-ui-provider-manifest-contract" }));
