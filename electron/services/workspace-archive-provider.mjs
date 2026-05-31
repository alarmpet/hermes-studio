import { readAndDecryptToken } from "./secure-token-store.mjs";
import { getExternalProvider } from "./external-provider-registry.mjs";
import { callMcpToolOverStdio } from "./mcp-stdio-client.mjs";

export const GOOGLE_WORKSPACE_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
];

export function createWorkspaceArchiveProvider(options = {}) {
  const provider = getExternalProvider("google-workspace-mcp");
  if (!provider) throw new Error("Google Workspace MCP provider is not registered.");
  return {
    id: "google-workspace-mcp",
    archiveMode: options.archiveMode || "read-only",
    readOnly: options.archiveMode !== "write-archive",
    scopes: GOOGLE_WORKSPACE_SCOPES,
    tokenPath: options.tokenPath,
  };
}

export async function loadWorkspaceCredentials({ tokenPath } = {}) {
  if (!tokenPath) throw new Error("Google Workspace tokenPath is required.");
  return readAndDecryptToken(tokenPath);
}

export async function searchWorkspaceSources(query, context = {}) {
  const provider = createWorkspaceArchiveProvider(context);
  if (!query) throw new Error("Workspace source search query is required.");
  if (typeof context.requestMcp !== "function") {
    if (context.enableLiveMcp === true) {
      const credentials = context.tokenPath ? await loadWorkspaceCredentials({ tokenPath: provider.tokenPath }) : null;
      return callMcpToolOverStdio({
        command: getExternalProvider("google-workspace-mcp").command,
        args: getExternalProvider("google-workspace-mcp").args,
        env: {
          GOOGLE_CLIENT_ID: credentials?.client_id || context.googleClientId || "",
          GOOGLE_CLIENT_SECRET: credentials?.client_secret || context.googleClientSecret || "",
          ...(context.env || {}),
        },
        toolName: "manage_drive",
        toolArgs: {
          operation: "search",
          email: context.email,
          query,
        },
        timeoutMs: context.timeoutMs || 30_000,
      });
    }
    return {
      provider: provider.id,
      archiveMode: provider.archiveMode,
      status: "not-connected",
      results: [],
      message: "Google Workspace MCP adapter is not connected. Local files remain canonical.",
    };
  }
  const credentials = await loadWorkspaceCredentials({ tokenPath: provider.tokenPath });
  return context.requestMcp({
    providerId: "google-workspace-mcp",
    toolName: "manage_drive",
    operation: "search",
    toolArgs: {
      operation: "search",
      email: context.email,
      query,
    },
    query,
    credentials,
    scopes: provider.scopes,
    readOnly: provider.readOnly,
  });
}

export function buildWorkspaceArchiveRecord({ job, result } = {}) {
  return {
    provider: "google-workspace-mcp",
    archiveMode: "read-only",
    jobId: job?.id || "",
    title: result?.assets?.draft?.title || job?.sourceValue || "",
    finalPath: result?.finalVideo?.finalPath || "",
    thumbnailPath: result?.thumbnail?.path || "",
    localCanonical: true,
  };
}
