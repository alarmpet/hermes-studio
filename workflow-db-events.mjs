import { spawnSync } from "node:child_process";

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
    details: event.details || {},
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

  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
