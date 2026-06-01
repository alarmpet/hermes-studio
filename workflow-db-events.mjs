import { spawnSync } from "node:child_process";

function isFailureEvent(event = {}) {
  return event.type === "desktop-job-failed"
    || event.type === "youtube-upload-failed"
    || event.details?.eventType === "flow-mode-mismatch"
    || event.details?.eventType === "flow-abnormal-activity"
    || event.details?.failureCode === "FLOW_ABNORMAL_ACTIVITY"
    || String(event.details?.failureCode || "").startsWith("FLOW_THUMBNAIL_")
    || String(event.details?.failureCode || "").startsWith("CHATGPT_")
    || String(event.details?.primaryProviderFailure?.code || event.details?.primaryProviderFailure?.failureCode || "").startsWith("FLOW_THUMBNAIL_")
    || String(event.details?.primaryProviderFailure?.code || event.details?.primaryProviderFailure?.failureCode || "").startsWith("CHATGPT_")
    || event.details?.actionRequired === true
    || event.status === "failed"
    || /failed|failure|Gpu Cache Creation failed|disk_cache|Unable to move the cache/i.test(String(event.message || ""));
}

function failureCodeOf(event = {}) {
  const directCode = event.details?.failureCode
    || event.details?.qa?.failureCode
    || event.details?.durationQa?.failureCode
    || event.details?.eventType
    || event.error?.code
    || "";
  if (directCode === "flow-mode-mismatch") return "FLOW_MODE_MISMATCH";
  if (directCode === "flow-abnormal-activity") return "FLOW_ABNORMAL_ACTIVITY";
  if (directCode) return String(directCode);

  if (Array.isArray(event.details?.failureCodes) && event.details.failureCodes.length > 0) {
    return String(event.details.failureCodes[0]);
  }
  if (Array.isArray(event.details?.finalOutputQa?.failureCodes) && event.details.finalOutputQa.failureCodes.length > 0) {
    return String(event.details.finalOutputQa.failureCodes[0]);
  }
  const primaryProviderFailureCode = event.details?.primaryProviderFailure?.code
    || event.details?.primaryProviderFailure?.failureCode
    || "";
  if (String(primaryProviderFailureCode).startsWith("CHATGPT_")) {
    return String(primaryProviderFailureCode);
  }
  if (String(primaryProviderFailureCode).startsWith("FLOW_THUMBNAIL_")) {
    return String(primaryProviderFailureCode);
  }

  const text = [
    event.message,
    event.error?.message,
    event.details?.reason,
  ].filter(Boolean).join(" ");

  if (/HARD_FREEZE_RISK/i.test(text)) return "HARD_FREEZE_RISK";
  if (/TARGET_DURATION_DRIFT/i.test(text)) return "TARGET_DURATION_DRIFT";
  if (/VISUAL_REPETITION_RISK/i.test(text)) return "VISUAL_REPETITION_RISK";
  if (/LEGACY_ZOOMPAN_IMAGE_RENDER/i.test(text)) return "LEGACY_ZOOMPAN_IMAGE_RENDER";
  if (/MISSING_IMAGE_SEQUENCE_MANIFEST/i.test(text)) return "MISSING_IMAGE_SEQUENCE_MANIFEST";
  if (/IMAGE_SEQUENCE_FRAME_COUNT_MISMATCH/i.test(text)) return "IMAGE_SEQUENCE_FRAME_COUNT_MISMATCH";
  if (/IMAGE_SEQUENCE_FRAME_TIME_MISMATCH/i.test(text)) return "IMAGE_SEQUENCE_FRAME_TIME_MISMATCH";
  if (/IMAGE_SEQUENCE_MOTION_COLLAPSED/i.test(text)) return "IMAGE_SEQUENCE_MOTION_COLLAPSED";
  if (/IMAGE_SEQUENCE_DELTA_SPIKE/i.test(text)) return "IMAGE_SEQUENCE_DELTA_SPIKE";
  if (/IMAGE_SEQUENCE_DIRECTION_REVERSAL/i.test(text)) return "IMAGE_SEQUENCE_DIRECTION_REVERSAL";
  if (/IMAGE_SEQUENCE_CACHE_CLEANUP_FAILED/i.test(text)) return "IMAGE_SEQUENCE_CACHE_CLEANUP_FAILED";
  if (/IMAGE_MODE_STILL_SOURCE_MISSING/i.test(text)) return "IMAGE_MODE_STILL_SOURCE_MISSING";
  if (/SOURCE_GROUNDING_MISMATCH/i.test(text)) return "SOURCE_GROUNDING_MISMATCH";
  if (/FLOW_PROMPT_ASPECT_MISMATCH|16:9.*9:16|aspect/i.test(text)) return "FLOW_PROMPT_ASPECT_MISMATCH";
  if (/HPSL_STRUCTURE_MISMATCH|Expected HPSL/i.test(text)) return "HPSL_STRUCTURE_MISMATCH";
  if (/output mode mismatch|flow-mode-mismatch/i.test(text)) return "FLOW_MODE_MISMATCH";
  if (/FLOW_ABNORMAL_ACTIVITY|flow-abnormal-activity|비정상적인\s*활동|abnormal activity|unusual activity|automated traffic|too many requests|rate limit|鍮꾩젙|媛먯|怨좉컼|쇳꽣/i.test(text)) return "FLOW_ABNORMAL_ACTIVITY";
  if (/FLOW_THUMBNAIL_GENERATION_FAILED|Google Flow thumbnail|flow thumbnail/i.test(text)) return "FLOW_THUMBNAIL_GENERATION_FAILED";
  if (/YOUTUBE_OAUTH_EXPIRED|invalid_grant|unauthorized/i.test(text)) return "YOUTUBE_OAUTH_EXPIRED";
  if (/YOUTUBE_TOKEN_MISSING|oauth-token-missing/i.test(text)) return "YOUTUBE_TOKEN_MISSING";
  if (/YOUTUBE_QUOTA_EXCEEDED|quotaExceeded|quota/i.test(text)) return "YOUTUBE_QUOTA_EXCEEDED";
  if (/YOUTUBE_NETWORK_INTERRUPTED|ECONNRESET|ETIMEDOUT|network/i.test(text)) return "YOUTUBE_NETWORK_INTERRUPTED";
  if (/YOUTUBE_THUMBNAIL_TOO_LARGE|2MB/i.test(text)) return "YOUTUBE_THUMBNAIL_TOO_LARGE";
  if (/YOUTUBE_THUMBNAIL_INVALID|thumbnail/i.test(text)) return "YOUTUBE_THUMBNAIL_INVALID";
  if (/YOUTUBE_DUPLICATE_UPLOAD_BLOCKED|duplicate-upload/i.test(text)) return "YOUTUBE_DUPLICATE_UPLOAD_BLOCKED";
  if (/duration.*too short/i.test(text)) return "DRAFT_DURATION_TOO_SHORT";
  if (/duration.*too long/i.test(text)) return "DRAFT_DURATION_TOO_LONG";
  return "";
}

function failureCodesOf(event = {}) {
  const codes = [];
  if (Array.isArray(event.details?.failureCodes)) codes.push(...event.details.failureCodes);
  if (Array.isArray(event.details?.finalOutputQa?.failureCodes)) codes.push(...event.details.finalOutputQa.failureCodes);
  if (event.details?.primaryProviderFailure?.code) codes.push(event.details.primaryProviderFailure.code);
  if (event.details?.primaryProviderFailure?.failureCode) codes.push(event.details.primaryProviderFailure.failureCode);
  const primary = failureCodeOf(event);
  if (primary) codes.unshift(primary);
  return Array.from(new Set(codes.map((code) => String(code || "").trim()).filter(Boolean)));
}

function prefixFailureCode(code, payload) {
  return code ? `[${code}] ${payload}` : payload;
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
    motionIntensity: event.details?.motionIntensity || event.job?.options?.motionIntensity || event.input?.motionIntensity || "",
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
    const failureCodes = failureCodesOf(event);
    const failureCode = failureCodes[0] || "";
    const failurePayload = JSON.stringify({
      type: event.type || "",
      phase: event.phase || "",
      status: event.status || "",
      message: event.message || "",
      failureCode,
      failureCodes,
      details: event.details || {},
      selectedChipLabel: event.details?.selectedChipLabel || "",
      rejectedChipReasons: event.details?.rejectedChipReasons || [],
      bottomButtons: event.details?.bottomButtons || [],
      renderRunnerMode: event.details?.renderRunnerMode || event.details?.runnerMode || "",
      updatedAt: event.updatedAt || new Date().toISOString(),
    });
    failureResult = spawnSync(pythonBin, [
      dbHelper,
      "log-failure",
      taskName,
      chatId,
      messageId,
      prefixFailureCode(failureCode, failurePayload),
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
