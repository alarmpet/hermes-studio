import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BROWSER_FAILURE_CODES = new Set([
  "CHATGPT_AUTH_REQUIRED",
  "CHATGPT_HUMAN_VERIFICATION_REQUIRED",
  "CHATGPT_COMPOSER_NOT_FOUND",
  "CHATGPT_IMAGE_TOOL_NOT_FOUND",
  "CHATGPT_TEXT_RESPONSE_INSTEAD_OF_IMAGE",
  "CHATGPT_IMAGE_DOWNLOAD_FAILED",
  "CHATGPT_IMAGE_TIMEOUT",
  "FLOW_MODE_MISMATCH",
  "FLOW_MEDIA_URL_NOT_FOUND",
  "GEMINI_RESPONSE_TIMEOUT",
]);

function runCommand(command, args = [], { timeoutMs = 15000 } = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: true,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ status: 124, stdout, stderr: `${stderr}\nProcess timed out after ${timeoutMs}ms`.trim() });
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ status: 1, stdout, stderr: String(error?.message || error) });
    });
    child.on("close", (status) => {
      clearTimeout(timer);
      resolve({ status: status ?? 1, stdout, stderr });
    });
  });
}

export async function maybeRunWebwrightDiagnostics({ config = {}, jobDir, provider, failure = {}, sourceUrl = "" }) {
  if (!config.webwrightDiagnosticsEnabled) {
    return { ok: false, skipped: true, reason: "webwright-diagnostics-disabled" };
  }
  const code = failure.code || failure.failureCode || "";
  if (!BROWSER_FAILURE_CODES.has(code)) {
    return { ok: false, skipped: true, reason: "failure-code-not-browser-diagnostic", code };
  }

  const outDir = join(jobDir, "diagnostics-webwright");
  mkdirSync(outDir, { recursive: true });
  const taskPath = join(outDir, "task.md");
  const reportPath = join(outDir, "webwright-diagnostics-result.json");
  const task = [
    `Provider: ${provider}`,
    `Failure code: ${code}`,
    `Source URL: ${sourceUrl || ""}`,
    "",
    "Inspect the authenticated browser workflow failure.",
    "Do not submit forms or create paid resources.",
    "Capture screenshots, DOM summaries, and a reusable Playwright script suggestion.",
    "Do not bypass CAPTCHA or human verification.",
  ].join("\n");
  writeFileSync(taskPath, task, "utf8");

  const command = config.webwrightCommand || "webwright";
  const probe = await runCommand(command, ["--help"], { timeoutMs: 15000 });
  if (probe.status !== 0) {
    const result = {
      ok: false,
      code: "WEBWRIGHT_NOT_INSTALLED",
      message: "Webwright command is not available. Install microsoft/Webwright or keep diagnostics disabled.",
      taskPath,
      stdout: probe.stdout || "",
      stderr: probe.stderr || "",
      updatedAt: new Date().toISOString(),
    };
    writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");
    return { ...result, reportPath };
  }

  const result = {
    ok: false,
    code: "WEBWRIGHT_MANUAL_RUN_REQUIRED",
    message: "Webwright is installed. Hermes prepared a task file; run it manually until a safe non-interactive profile integration is added.",
    taskPath,
    suggestedCommand: `${command} run "${taskPath}"`,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(reportPath, JSON.stringify(result, null, 2), "utf8");
  return { ...result, reportPath };
}
