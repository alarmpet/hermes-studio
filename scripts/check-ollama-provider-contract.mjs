#!/usr/bin/env node
import assert from "node:assert/strict";
import {
  classifyOllamaFailure,
  checkOllamaHealth,
  isPrivateOllamaUrl,
  normalizeOllamaConfig,
  requestOllamaJson,
} from "../electron/services/ollama-provider.mjs";

assert.equal(isPrivateOllamaUrl("http://127.0.0.1:11434"), true);
assert.equal(isPrivateOllamaUrl("http://localhost:11434"), true);
assert.equal(isPrivateOllamaUrl("http://192.168.1.10:11434"), true);
assert.equal(isPrivateOllamaUrl("http://10.0.0.2:11434"), true);
assert.equal(isPrivateOllamaUrl("http://172.16.0.2:11434"), true);
assert.equal(isPrivateOllamaUrl("http://8.8.8.8:11434"), false);
assert.equal(isPrivateOllamaUrl("https://example.com"), false);

const config = normalizeOllamaConfig({
  ollamaAssistEnabled: true,
  ollamaBaseUrl: "http://192.168.1.10:11434/",
  ollamaModel: "batiai/gemma4-12b:latest",
});
assert.equal(config.enabled, true);
assert.equal(config.baseUrl, "http://192.168.1.10:11434");
assert.equal(config.model, "batiai/gemma4-12b:latest");
assert.equal(config.allowed, true);

assert.equal(classifyOllamaFailure(new Error("fetch failed")).failureCode, "OLLAMA_NETWORK_UNREACHABLE");
assert.equal(classifyOllamaFailure(new Error("AbortError timeout")).failureCode, "OLLAMA_TIMEOUT");
assert.equal(classifyOllamaFailure(new Error("Unexpected token <")).failureCode, "OLLAMA_JSON_PARSE_FAILED");
assert.equal(classifyOllamaFailure(new Error("model not found")).failureCode, "OLLAMA_MODEL_UNAVAILABLE");

const disabled = await requestOllamaJson({
  config: { enabled: false, allowed: true, baseUrl: "http://127.0.0.1:11434", model: "gemma4:12b" },
});
assert.equal(disabled.ok, false);
assert.equal(disabled.skipped, true);
assert.equal(disabled.failure.failureCode, "OLLAMA_DISABLED");

const blocked = await requestOllamaJson({
  taskName: "provider-contract",
  config: { enabled: true, allowed: false, baseUrl: "http://8.8.8.8:11434", model: "gemma4:12b" },
});
assert.equal(blocked.ok, false);
assert.equal(blocked.failure.failureCode, "OLLAMA_URL_NOT_PRIVATE_LAN");
assert.equal(blocked.diagnostics.provider, "ollama");
assert.equal(blocked.diagnostics.taskName, "provider-contract");

const disabledHealth = await checkOllamaHealth({
  config: { enabled: false, allowed: true, baseUrl: "http://127.0.0.1:11434", model: "gemma4:12b" },
});
assert.equal(disabledHealth.ok, false);
assert.equal(disabledHealth.status, "disabled");
assert.equal(disabledHealth.failureCode, "OLLAMA_DISABLED");

const blockedHealth = await checkOllamaHealth({
  config: { enabled: true, allowed: false, baseUrl: "http://8.8.8.8:11434", model: "gemma4:12b" },
});
assert.equal(blockedHealth.ok, false);
assert.equal(blockedHealth.status, "blocked");
assert.equal(blockedHealth.failureCode, "OLLAMA_URL_NOT_PRIVATE_LAN");

const connectedHealth = await checkOllamaHealth({
  config: { enabled: true, allowed: true, baseUrl: "http://127.0.0.1:11434", model: "gemma4:12b" },
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({
      models: [
        { name: "llama3.1:8b" },
        { name: "gemma4:12b" },
      ],
    }),
  }),
});
assert.equal(connectedHealth.ok, true);
assert.equal(connectedHealth.status, "connected");
assert.equal(connectedHealth.modelAvailable, true);

const missingModelHealth = await checkOllamaHealth({
  config: { enabled: true, allowed: true, baseUrl: "http://127.0.0.1:11434", model: "gemma4:12b" },
  fetchImpl: async () => ({
    ok: true,
    json: async () => ({ models: [{ name: "llama3.1:8b" }] }),
  }),
});
assert.equal(missingModelHealth.ok, false);
assert.equal(missingModelHealth.status, "model-missing");
assert.equal(missingModelHealth.failureCode, "OLLAMA_MODEL_UNAVAILABLE");

console.log(JSON.stringify({ ok: true, checked: "ollama-provider-contract" }));
