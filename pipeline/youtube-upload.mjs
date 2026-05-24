import { existsSync } from "node:fs";
import { google } from "googleapis";
import { loadYouTubeToken } from "./youtube-auth.mjs";

export async function uploadVideoToYouTube({ videoPath, thumbnailPath, metadata = {}, tokenPath }) {
  if (!videoPath) throw new Error("videoPath is required");
  if (!tokenPath) throw new Error("tokenPath is required");
  const token = await loadYouTubeToken(tokenPath);
  if (!token) {
    return {
      ok: false,
      videoPath,
      thumbnailPath,
      metadata,
      status: "oauth-token-missing",
      message: "YouTube upload execution is enabled after OAuth client_secrets.json is configured.",
    };
  }
  if (!existsSync(videoPath)) throw new Error(`videoPath does not exist: ${videoPath}`);

  return {
    ok: false,
    videoPath,
    thumbnailPath,
    metadata: sanitizeMetadata(metadata),
    tokenPath,
    status: "upload-not-executed",
    client: Boolean(google.youtube),
    message: "YouTube resumable upload execution is guarded until OAuth client credentials are configured and approved.",
  };
}

export function sanitizeMetadata(metadata = {}) {
  return {
    title: cleanText(metadata.title || "Hermes video").slice(0, 100),
    description: cleanText(metadata.description || ""),
    tags: Array.from(new Set((metadata.tags || []).map((tag) => cleanText(tag).replace(/^#/, "")).filter(Boolean))).slice(0, 30),
    privacyStatus: metadata.privacyStatus || "private",
    containsSyntheticMedia: metadata.containsSyntheticMedia !== false,
  };
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
