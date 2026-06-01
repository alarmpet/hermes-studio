import { existsSync } from "node:fs";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import { loadYouTubeToken, saveYouTubeToken } from "./youtube-auth.mjs";

export async function uploadVideoToYouTube({
  videoPath,
  thumbnailPath,
  metadata = {},
  tokenPath,
  clientSecretsPath,
  onProgress,
}) {
  if (!videoPath) throw new Error("videoPath is required");
  if (!tokenPath) throw new Error("tokenPath is required");
  if (!clientSecretsPath) throw new Error("clientSecretsPath is required");
  const tokens = await loadYouTubeToken(tokenPath);
  if (!tokens) {
    return {
      ok: false,
      code: "YOUTUBE_TOKEN_MISSING",
      videoPath,
      thumbnailPath,
      metadata: sanitizeMetadata(metadata),
      status: "oauth-token-missing",
      message: "YouTube OAuth token is missing. Authenticate YouTube Upload first.",
    };
  }
  if (!existsSync(videoPath)) throw new Error(`videoPath does not exist: ${videoPath}`);
  if (!existsSync(clientSecretsPath)) {
    return {
      ok: false,
      code: "YOUTUBE_CLIENT_SECRETS_MISSING",
      status: "client-secrets-missing",
      message: `client_secrets.json was not found: ${clientSecretsPath}`,
    };
  }

  const cleanMetadata = sanitizeMetadata(metadata);
  const oauth2Client = await createOAuthClient({ clientSecretsPath, tokenPath, tokens });
  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  try {
    onProgress?.({ phase: "upload", status: "running", message: "Uploading video to YouTube" });
    const insertResponse = await youtube.videos.insert({
      part: ["snippet", "status"],
      notifySubscribers: Boolean(cleanMetadata.notifySubscribers),
      requestBody: {
        snippet: {
          title: cleanMetadata.title,
          description: cleanMetadata.description,
          tags: cleanMetadata.tags,
          categoryId: cleanMetadata.categoryId,
        },
        status: {
          privacyStatus: cleanMetadata.privacyStatus,
          selfDeclaredMadeForKids: Boolean(cleanMetadata.madeForKids),
          containsSyntheticMedia: cleanMetadata.containsSyntheticMedia !== false,
        },
      },
      media: {
        body: createReadStream(videoPath),
      },
    }, {
      onUploadProgress: (event = {}) => onProgress?.({
        phase: "upload",
        status: "running",
        message: "Uploading video to YouTube",
        details: {
          bytesRead: event.bytesRead || event.loaded || 0,
        },
      }),
    });
    const videoId = insertResponse?.data?.id || "";
    if (!videoId) {
      return {
        ok: false,
        code: "YOUTUBE_UPLOAD_NO_VIDEO_ID",
        status: "upload-failed",
        message: "YouTube upload completed without returning a video id.",
      };
    }

    let thumbnailBound = false;
    if (thumbnailPath && existsSync(thumbnailPath)) {
      onProgress?.({ phase: "upload", status: "running", message: "Binding YouTube thumbnail" });
      await youtube.thumbnails.set({
        videoId,
        media: {
          body: createReadStream(thumbnailPath),
        },
      });
      thumbnailBound = true;
    }

    return {
      ok: true,
      status: "uploaded",
      videoId,
      youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
      thumbnailBound,
      metadata: cleanMetadata,
    };
  } catch (error) {
    return {
      ok: false,
      code: classifyYouTubeUploadError(error),
      status: "upload-failed",
      message: error?.message || String(error),
      metadata: cleanMetadata,
    };
  }
}

export function sanitizeMetadata(metadata = {}) {
  return {
    title: cleanText(metadata.title || "Hermes video").slice(0, 100),
    description: cleanText(metadata.description || ""),
    tags: Array.from(new Set((metadata.tags || []).map((tag) => cleanText(tag).replace(/^#/, "")).filter(Boolean))).slice(0, 30),
    privacyStatus: metadata.privacyStatus || "private",
    categoryId: cleanText(metadata.categoryId || "25"),
    madeForKids: Boolean(metadata.madeForKids),
    containsSyntheticMedia: metadata.containsSyntheticMedia !== false,
    notifySubscribers: Boolean(metadata.notifySubscribers),
  };
}

function cleanText(value = "") {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function createOAuthClient({ clientSecretsPath, tokenPath, tokens }) {
  const secrets = JSON.parse(await readFile(clientSecretsPath, "utf8"));
  const credentials = secrets.installed || secrets.web;
  if (!credentials?.client_id || !credentials?.client_secret) {
    throw new Error("client_secrets.json must contain installed or web OAuth credentials.");
  }
  const redirectUri = credentials.redirect_uris?.[0] || "http://127.0.0.1";
  const oauth2Client = new google.auth.OAuth2(
    credentials.client_id,
    credentials.client_secret,
    redirectUri,
  );
  oauth2Client.setCredentials(tokens);
  oauth2Client.on("tokens", async (newTokens) => {
    await saveYouTubeToken(tokenPath, { ...tokens, ...newTokens });
  });
  return oauth2Client;
}

function classifyYouTubeUploadError(error) {
  const text = [error?.code, error?.message, error?.response?.data?.error, error?.errors?.[0]?.reason]
    .filter(Boolean)
    .join(" ");
  if (/invalid_grant|unauthorized|401/i.test(text)) return "YOUTUBE_OAUTH_EXPIRED";
  if (/quotaExceeded|quota|403/i.test(text)) return "YOUTUBE_QUOTA_EXCEEDED";
  if (/network|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|500|502|503|504/i.test(text)) return "YOUTUBE_NETWORK_INTERRUPTED";
  if (/thumbnail/i.test(text)) return "YOUTUBE_THUMBNAIL_INVALID";
  return "YOUTUBE_UPLOAD_FAILED";
}
