import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getExternalProvider } from "./external-provider-registry.mjs";
import { callMcpToolOverStdio } from "./mcp-stdio-client.mjs";

export const NOTEBOOKLM_TIMEOUT_MS = 30_000;

export function buildNotebookLmResearchPrompt(job = {}) {
  const sourceLabel = job.sourceType === "url" ? "URL" : "KEYWORD";
  return [
    "Hermes NotebookLM research request.",
    `${sourceLabel}: ${job.sourceValue || ""}`,
    "Return concise Korean research notes for a YouTube Shorts HPSL script.",
    "Include verified facts, source-grounded context, useful cautions, and citations when available.",
    "Do not write the final script. Do not copy article sentences.",
  ].join("\n");
}

export function classifyNotebookLmFailure(error = {}) {
  const message = String(error.message || error || "");
  if (error.name === "AbortError" || error.code === "NOTEBOOKLM_TIMEOUT" || /timeout|timed out/i.test(message)) return "timeout";
  if (/login|auth|session|credential|profile/i.test(message)) return "auth-session";
  if (/not found|selector|ui changed|navigation/i.test(message)) return "ui-changed";
  return "provider-error";
}

export async function requestNotebookLmResearch(job = {}, context = {}) {
  const provider = getExternalProvider("notebooklm-mcp");
  if (!provider) throw new Error("NotebookLM MCP provider is not registered.");
  const timeoutMs = Number(context.timeoutMs || provider.timeoutMs || NOTEBOOKLM_TIMEOUT_MS);
  const prompt = buildNotebookLmResearchPrompt(job);
  if (context.jobDir) {
    await writeFile(join(context.jobDir, "notebooklm-research-request.txt"), prompt, "utf8").catch(() => {});
  }

  return withTimeout(async () => {
    if (typeof context.requestMcp === "function") {
      return normalizeNotebookLmResearch(await context.requestMcp({
        providerId: "notebooklm-mcp",
        toolName: "ask_question",
        toolArgs: {
          question: prompt,
          source_format: "json",
        },
        prompt,
        job,
        timeoutMs,
      }));
    }
    if (context.enableLiveMcp === true) {
      return normalizeNotebookLmResearch(await callMcpToolOverStdio({
        command: provider.command,
        args: provider.args,
        env: { NOTEBOOKLM_PROFILE: "minimal", ...(context.env || {}) },
        toolName: "ask_question",
        toolArgs: {
          question: prompt,
          source_format: "json",
        },
        timeoutMs,
      }));
    }
    if (context.allowNotebookLmMock === true) {
      return normalizeNotebookLmResearch({
        provider: "notebooklm-mcp",
        notes: [
          `NotebookLM mock research for ${job.sourceType || "source"}: ${job.sourceValue || ""}`,
          "Use these notes only as source grounding before Gemini HPSL drafting.",
        ],
        citations: [],
      });
    }
    const error = new Error("NotebookLM MCP adapter is not connected. Falling back to Gemini Gems.");
    error.code = "NOTEBOOKLM_NOT_CONNECTED";
    throw error;
  }, timeoutMs);
}

export function normalizeNotebookLmResearch(result = {}) {
  const contentText = Array.isArray(result.content)
    ? result.content.map((item) => item.text || "").filter(Boolean).join("\n")
    : "";
  const structured = result.structuredContent || result;
  const notes = Array.isArray(result.notes)
    ? result.notes.map((item) => String(item || "").trim()).filter(Boolean)
    : String(structured.notes || structured.answer || result.text || contentText || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const rawSources = structured.sources || structured.citations || result.citations || [];
  const citations = Array.isArray(rawSources)
    ? rawSources.map((item) => typeof item === "string" ? item : [item.title, item.url, item.excerpt].filter(Boolean).join(" - ")).map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  return {
    provider: "notebooklm-mcp",
    status: "ok",
    notes,
    citations,
    text: notes.join("\n"),
    updatedAt: new Date().toISOString(),
  };
}

export function withTimeout(fn, timeoutMs = NOTEBOOKLM_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(`NotebookLM MCP request timed out after ${timeoutMs}ms.`);
      error.code = "NOTEBOOKLM_TIMEOUT";
      reject(error);
    }, timeoutMs);
    Promise.resolve()
      .then(fn)
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
