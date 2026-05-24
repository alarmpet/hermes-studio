import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("hermes", {
  getConfig: () => ipcRenderer.invoke("app:getConfig"),
  selectDirectory: () => ipcRenderer.invoke("app:selectDirectory"),
  openPath: (targetPath) => ipcRenderer.invoke("app:openPath", targetPath),
  youtubeCreateJob: (input) => ipcRenderer.invoke("youtube:createJob", input),
  onYouTubeEvent: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("youtube:event", listener);
    return () => ipcRenderer.removeListener("youtube:event", listener);
  },
});
