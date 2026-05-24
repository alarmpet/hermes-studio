import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hermes", {
  getConfig: () => ipcRenderer.invoke("app:getConfig"),
  configGet: () => ipcRenderer.invoke("config:get"),
  configSave: (config) => ipcRenderer.invoke("config:save", config),
  voicePresets: () => ipcRenderer.invoke("presets:voices"),
  authStatus: () => ipcRenderer.invoke("auth:status"),
  authStart: (target) => ipcRenderer.invoke("auth:start", target),
  jobsList: () => ipcRenderer.invoke("jobs:list"),
  jobsRead: (jobId) => ipcRenderer.invoke("jobs:read", jobId),
  selectDirectory: () => ipcRenderer.invoke("app:selectDirectory"),
  openPath: (targetPath) => ipcRenderer.invoke("app:openPath", targetPath),
  youtubeCreateJob: (input) => ipcRenderer.invoke("youtube:createJob", input),
  onYouTubeEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("youtube:event", listener);
    return () => ipcRenderer.removeListener("youtube:event", listener);
  },
});
