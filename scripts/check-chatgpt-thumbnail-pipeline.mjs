#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = readFileSync(resolve(root, "automation/chatgpt-thumbnail-source.mjs"), "utf8");
const thumbnail = readFileSync(resolve(root, "pipeline/youtube-thumbnail.mjs"), "utf8");
const stages = readFileSync(resolve(root, "youtube-workflow-stages.mjs"), "utf8");

assert.match(source, /launchPersistentContext/, "ChatGPT thumbnail generator should use the authenticated persistent browser profile");
assert.match(source, /chatgpt\.com/i, "ChatGPT thumbnail generator should open ChatGPT web");
assert.match(source, /keyboard\.insertText|keyboard\.type|pressSequentially/i, "ChatGPT thumbnail generator should use keystroke-style prompt input");
assert.match(source, /\\uC774\\uBBF8\\uC9C0\\\\s\*\\uB9CC\\uB4E4\\uAE30|이미지\\\\s\*만들기|create\\\\s\*image|image\\\\s\*generation/i, "ChatGPT thumbnail generator should select the image creation tool");
assert.match(source, /collectGeneratedImageCandidates/, "ChatGPT thumbnail generator should wait for generated image candidates");
assert.match(source, /thumbnail-chatgpt-source/, "ChatGPT thumbnail generator should persist the raw ChatGPT image");
assert.match(source, /thumbnail-chatgpt\.png/, "ChatGPT thumbnail generator should persist the final normalized thumbnail");
assert.match(source, /outputWidth\s*=\s*aspectRatio\s*===\s*"16:9"\s*\?\s*1280\s*:\s*1080/, "ChatGPT thumbnail should choose width by output aspect");
assert.match(source, /outputHeight\s*=\s*aspectRatio\s*===\s*"16:9"\s*\?\s*720\s*:\s*1920/, "ChatGPT thumbnail should choose height by output aspect");
assert.match(source, /resize\(outputWidth,\s*outputHeight/, "ChatGPT thumbnail should normalize to the selected aspect");
assert.match(source, /CHATGPT_HUMAN_VERIFICATION_REQUIRED/, "ChatGPT thumbnail should classify human verification failures");
assert.match(source, /chatgpt-empty-access-gate/, "ChatGPT thumbnail should classify empty ChatGPT access gates");
assert.match(source, /chatgpt-thumbnail-auth-or-access-failure\.png/, "ChatGPT thumbnail should save auth/access failure screenshots");
assert.match(source, /chatgpt-authenticated-browser/, "ChatGPT thumbnail result should expose its provider");
assert.match(thumbnail, /generateChatGptThumbnail/, "thumbnail pipeline should call ChatGPT first");
assert.match(thumbnail, /createLocalCompositedThumbnail/, "thumbnail pipeline should keep local fallback");
assert.match(thumbnail, /chromePath/, "thumbnail pipeline should forward Chrome path into ChatGPT automation");
assert.match(stages, /generateThumbnail[\s\S]*chromePath:\s*context\.chromePath/, "workflow stages should pass Chrome path into thumbnail generation");

console.log(JSON.stringify({ ok: true, checked: "chatgpt-thumbnail-pipeline", root }));
