import { statSync } from "node:fs";

export function createWebUiProviderSuccess({
  provider,
  sceneOrder,
  outputMode,
  path,
  contentType,
  bytes = 0,
  width = 0,
  height = 0,
  durationSeconds = 0,
  sourceUrl = "",
  evidence = {},
  extra = {},
} = {}) {
  return {
    ok: true,
    provider,
    providerOrigin: "web-ui",
    sceneOrder,
    outputMode,
    path,
    contentType,
    bytes,
    width,
    height,
    durationSeconds,
    sourceUrl,
    evidence,
    ...extra,
  };
}

export function createWebUiProviderFailure({
  provider,
  sceneOrder,
  failureCode,
  message,
  retryable = true,
  actionRequired = true,
  evidence = {},
  details = {},
} = {}) {
  return {
    ok: false,
    provider,
    providerOrigin: "web-ui",
    sceneOrder,
    failureCode,
    message,
    retryable,
    actionRequired,
    evidence,
    details,
  };
}

export function assertProviderMediaResult(result = {}) {
  if (!result.ok) {
    throw new Error(result.message || `${result.provider || "Provider"} did not return usable media.`);
  }
  if (result.providerOrigin !== "web-ui") {
    throw new Error(`WEB_UI_PROVIDER_ORIGIN_REQUIRED: providerOrigin=${result.providerOrigin || ""}`);
  }
  if (!result.path) {
    throw new Error("WEB_UI_PROVIDER_MEDIA_PATH_REQUIRED");
  }
  const stat = statSync(result.path);
  if (!stat.size || stat.size <= 0 || Number(result.bytes || stat.size) <= 0) {
    throw new Error(`WEB_UI_PROVIDER_EMPTY_MEDIA: ${result.path}`);
  }
  if (!String(result.contentType || "").includes("/")) {
    throw new Error(`WEB_UI_PROVIDER_CONTENT_TYPE_REQUIRED: ${result.path}`);
  }
  return { ...result, bytes: Number(result.bytes || stat.size) };
}
