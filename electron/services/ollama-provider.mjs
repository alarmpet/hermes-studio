export function normalizeOllamaConfig(options = {}) {
  const timeout = Number(options.ollamaTimeoutMs || 20_000);
  return {
    enabled: Boolean(options.ollamaAssistEnabled),
    baseUrl: String(options.ollamaBaseUrl || "http://127.0.0.1:11434").trim().replace(/\/+$/u, ""),
    model: String(options.ollamaModel || "gemma4:12b").trim() || "gemma4:12b",
    timeoutMs: Number.isFinite(timeout) ? Math.max(3_000, Math.min(60_000, timeout)) : 20_000,
    allowed: isPrivateOllamaUrl(String(options.ollamaBaseUrl || "http://127.0.0.1:11434").trim().replace(/\/+$/u, "")),
  };
}

export function isPrivateOllamaUrl(value = "") {
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/u.test(host)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/u.test(host)) return true;
    const match172 = host.match(/^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/u);
    if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return true;
    return false;
  } catch {
    return false;
  }
}

export function classifyOllamaFailure(error) {
  const message = String(error?.message || error || "");
  if (/abort|timeout/i.test(message) || error?.name === "AbortError") {
    return { failureCode: "OLLAMA_TIMEOUT", message };
  }
  if (/model|not found|pull/i.test(message)) {
    return { failureCode: "OLLAMA_MODEL_UNAVAILABLE", message };
  }
  if (/json|parse|unexpected token|schema/i.test(message)) {
    return { failureCode: "OLLAMA_JSON_PARSE_FAILED", message };
  }
  if (/fetch|network|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ECONNRESET|proxy|socket/i.test(message)) {
    return { failureCode: "OLLAMA_NETWORK_UNREACHABLE", message };
  }
  return { failureCode: "OLLAMA_UNKNOWN_FAILURE", message };
}

export async function checkOllamaHealth({ config = {}, fetchImpl = fetch } = {}) {
  const base = {
    provider: "ollama",
    baseUrl: config.baseUrl,
    model: config.model,
    enabled: Boolean(config.enabled),
    allowed: Boolean(config.allowed),
  };
  if (!config?.enabled) {
    return { ...base, ok: false, status: "disabled", failureCode: "OLLAMA_DISABLED" };
  }
  if (!config?.allowed) {
    return { ...base, ok: false, status: "blocked", failureCode: "OLLAMA_URL_NOT_PRIVATE_LAN" };
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutMs = Number.isFinite(Number(config.timeoutMs)) ? Number(config.timeoutMs) : 20_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${config.baseUrl}/api/tags`, {
      method: "GET",
      signal: controller.signal,
      headers: { accept: "application/json" },
    });
    if (!response.ok) throw new Error(`Ollama HTTP ${response.status} ${response.statusText}`);
    const body = await response.json();
    const models = Array.isArray(body?.models)
      ? body.models.map((item) => String(item?.name || item?.model || "").trim()).filter(Boolean)
      : [];
    const requestedModel = String(config.model || "").trim();
    const modelAvailable = !requestedModel || models.some((name) => name === requestedModel || name.startsWith(`${requestedModel}:`));
    if (!modelAvailable) {
      return {
        ...base,
        ok: false,
        status: "model-missing",
        failureCode: "OLLAMA_MODEL_UNAVAILABLE",
        modelAvailable: false,
        models,
        elapsedMs: Date.now() - startedAt,
      };
    }
    return {
      ...base,
      ok: true,
      status: "connected",
      modelAvailable: true,
      models,
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    const failure = classifyOllamaFailure(error);
    return {
      ...base,
      ok: false,
      status: failure.failureCode === "OLLAMA_TIMEOUT" ? "timeout" : "unreachable",
      failureCode: failure.failureCode,
      message: failure.message,
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function requestOllamaJson({ config = {}, taskName = "", schema, system, prompt } = {}) {
  if (!config?.enabled) {
    return {
      ok: false,
      skipped: true,
      failure: { failureCode: "OLLAMA_DISABLED" },
      diagnostics: {
        provider: "ollama",
        taskName,
        baseUrl: config.baseUrl,
        model: config.model,
      },
    };
  }

  if (!config?.allowed) {
    return {
      ok: false,
      failure: { failureCode: "OLLAMA_URL_NOT_PRIVATE_LAN" },
      diagnostics: {
        provider: "ollama",
        taskName,
        baseUrl: config.baseUrl,
        model: config.model,
      },
    };
  }

  const controller = new AbortController();
  const startedAt = Date.now();
  const timeoutMs = Number.isFinite(Number(config.timeoutMs)) ? Number(config.timeoutMs) : 20_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.model,
        stream: false,
        format: schema || "json",
        options: { temperature: 0 },
        messages: [
          { role: "system", content: system || "Return valid JSON only." },
          { role: "user", content: prompt || "" },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama HTTP ${response.status} ${response.statusText}`);
    }

    const envelope = await response.json();
    const content = envelope?.message?.content || envelope?.response || "";
    return {
      ok: true,
      parsed: JSON.parse(content),
      diagnostics: {
        provider: "ollama",
        taskName,
        baseUrl: config.baseUrl,
        model: config.model,
        elapsedMs: Date.now() - startedAt,
        total_duration: envelope.total_duration,
        prompt_eval_count: envelope.prompt_eval_count,
        eval_count: envelope.eval_count,
      },
    };
  } catch (error) {
    return {
      ok: false,
      failure: classifyOllamaFailure(error),
      diagnostics: {
        provider: "ollama",
        taskName,
        baseUrl: config.baseUrl,
        model: config.model,
        elapsedMs: Date.now() - startedAt,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}
