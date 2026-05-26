import { spawnSync } from "node:child_process";

function isFailureEvent(event = {}) {
  return event.type === "desktop-job-failed"
    || event.details?.eventType === "flow-mode-mismatch"
    || event.status === "failed"
    || /failed|failure|Gpu Cache Creation failed|disk_cache|Unable to move the cache/i.test(String(event.message || ""));
}

export function mirrorWorkflowEventToDb(event = {}, context = {}) {
  const dbHelper = context.dbHelper || "C:/Users/amd/hermes/bot_db_helper.py";
  const pythonBin = context.pythonBin || "python";
  const jobId = event.jobId || context.jobId || "";
  const taskName = event.taskName || context.taskName || "youtube-workflow";
  const chatId = String(context.chatId || event.chatId || "desktop");
  const messageId = String(context.messageId || event.messageId || "0");
  const eventType = event.type || event.phase || "workflow-event";
  const payload = JSON.stringify({
    phase: event.phase || "",
    status: event.status || "",
    message: event.message || "",
    details: event.details,
    renderEffectPreset: event.details?.renderEffectPreset || event.job?.options?.renderEffectPreset || event.input?.renderEffectPreset || "",
    transitionPreset: event.details?.transitionPreset || event.job?.options?.transitionPreset || event.input?.transitionPreset || "",
    transitionSeconds: event.details?.transitionSeconds ?? event.job?.options?.transitionSeconds ?? event.input?.transitionSeconds ?? null,
    updatedAt: event.updatedAt || new Date().toISOString(),
  });

  const result = spawnSync(pythonBin, [
    dbHelper,
    "log-event",
    eventType,
    taskName,
    chatId,
    messageId,
    payload,
    "--job-id",
    jobId,
  ], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });

  let failureResult = null;
  if (isFailureEvent(event)) {
    const failurePayload = JSON.stringify({
      type: event.type || "",
      phase: event.phase || "",
      status: event.status || "",
      message: event.message || "",
      details: event.details || {},
      renderRunnerMode: event.details?.renderRunnerMode || event.details?.runnerMode || "",
      updatedAt: event.updatedAt || new Date().toISOString(),
    });
    failureResult = spawnSync(pythonBin, [
      dbHelper,
      "log-failure",
      taskName,
      chatId,
      messageId,
      failurePayload,
      "0",
    ], {
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
    });
  }

  return {
    ok: result.status === 0 && (!failureResult || failureResult.status === 0),
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    failureStatus: failureResult?.status ?? null,
    failureStdout: failureResult?.stdout ?? "",
    failureStderr: failureResult?.stderr ?? "",
  };
}
