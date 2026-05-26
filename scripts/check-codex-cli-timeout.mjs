#!/usr/bin/env node

import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = "C:/Users/amd/hermes";
const botPath = resolve(root, "telegram-flow-news-bot.mjs");
const fakeCliPath = resolve(root, "scripts/fake-codex-cli-timeout.mjs");

const started = Date.now();
const child = spawn(process.execPath, [
  botPath,
  "--test-generic",
  "CLI timeout regression check",
], {
  cwd: root,
  env: {
    ...process.env,
    HERMES_CODEX_MODELS: " ",
    HERMES_ENABLE_OPENROUTER: "0",
    HERMES_CODEX_CLI_JS: fakeCliPath,
    HERMES_CODEX_TIMEOUT_MS: "1000",
  },
  stdio: ["ignore", "pipe", "pipe"],
});

let stdout = "";
let stderr = "";
child.stdout.on("data", (chunk) => {
  stdout += chunk.toString();
});
child.stderr.on("data", (chunk) => {
  stderr += chunk.toString();
});

const result = await new Promise((resolvePromise) => {
  const timer = setTimeout(() => {
    child.kill("SIGTERM");
    resolvePromise({ timedOut: true, code: null });
  }, 8000);

  child.on("close", (code) => {
    clearTimeout(timer);
    resolvePromise({ timedOut: false, code });
  });
});

const elapsedMs = Date.now() - started;

if (result.timedOut) {
  console.error(`Hermes did not stop the fake Codex CLI quickly enough. elapsedMs=${elapsedMs}`);
  process.exit(1);
}

if (!/(Process timed out after 1000ms|Codex backends failed and OpenRouter fallback is disabled)/i.test(stdout + stderr)) {
  console.error("Hermes exited, but not through the expected bounded CLI fallback failure path.");
  console.error(stdout);
  console.error(stderr);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, elapsedMs, code: result.code }));
