import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hermes", {
  getConfig: () => ipcRenderer.invoke("app:getConfig"),
  configGet: () => ipcRenderer.invoke("config:get"),
  configSave: (config) => ipcRenderer.invoke("config:save", config),
  ollamaHealth: (options) => ipcRenderer.invoke("ollama:health", options),
  voicePresets: () => ipcRenderer.invoke("presets:voices"),
  stylePresets: () => ipcRenderer.invoke("presets:styles"),
  authStatus: () => ipcRenderer.invoke("auth:status"),
  authStart: (target) => ipcRenderer.invoke("auth:start", target),
  authChangeAccount: (target) => ipcRenderer.invoke("auth:changeAccount", target),
  authClearSession: (target) => ipcRenderer.invoke("auth:clearSession", target),
  jobsList: () => ipcRenderer.invoke("jobs:list"),
  jobsRead: (jobId) => ipcRenderer.invoke("jobs:read", jobId),
  workflowRecentEvents: (jobId) => ipcRenderer.invoke("workflow:recentEvents", jobId),
  selectDirectory: () => ipcRenderer.invoke("app:selectDirectory"),
  openPath: (targetPath) => ipcRenderer.invoke("app:openPath", targetPath),
  youtubeCreateJob: (input) => ipcRenderer.invoke("youtube:createJob", input),
  youtubeRetryFailedScenes: (jobId) => ipcRenderer.invoke("youtube:retryFailedScenes", jobId),
  youtubeRenderExistingAssets: (jobId) => ipcRenderer.invoke("youtube:renderExistingAssets", jobId),
  youtubeRetryThumbnail: (jobId) => ipcRenderer.invoke("youtube:retryThumbnail", jobId),
  youtubeGetUploadDraft: (jobId) => ipcRenderer.invoke("youtube:getUploadDraft", jobId),
  youtubeSaveUploadDraft: (jobId, draft) => ipcRenderer.invoke("youtube:saveUploadDraft", jobId, draft),
  youtubeUploadJob: (jobId, draft) => ipcRenderer.invoke("youtube:uploadJob", jobId, draft),
  youtubeApproveUpload: (jobId) => ipcRenderer.invoke("youtube:approveUpload", jobId),
  onYouTubeEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("youtube:event", listener);
    return () => ipcRenderer.removeListener("youtube:event", listener);
  },
});
