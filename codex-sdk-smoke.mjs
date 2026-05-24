#!/usr/bin/env node

import { Codex } from "@openai/codex-sdk";

const model = process.argv[2] || "gpt-5.3-codex-spark";
const prompt = process.argv.slice(3).join(" ") || "한국어로 한 문장만 답해: Hermes 연결 테스트 OK";

const started = Date.now();
const codex = new Codex();
const thread = codex.startThread({
  model,
  workingDirectory: "C:/Users/amd/hermes",
  skipGitRepoCheck: true,
  sandboxMode: "read-only",
  approvalPolicy: "never",
  modelReasoningEffort: "low",
  webSearchMode: "disabled",
});

try {
  const turn = await thread.run(prompt);
  console.log(JSON.stringify({
    ok: true,
    model,
    latencyMs: Date.now() - started,
    finalResponse: turn.finalResponse,
    usage: turn.usage,
  }, null, 2));
} catch (error) {
  console.log(JSON.stringify({
    ok: false,
    model,
    latencyMs: Date.now() - started,
    error: error?.message || String(error),
  }, null, 2));
  process.exitCode = 1;
}
