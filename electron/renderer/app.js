const form = document.querySelector("#jobForm");
const sourceValue = document.querySelector("#sourceValue");
const speed = document.querySelector("#speechSpeed");
const speedValue = document.querySelector("#speedValue");
const consoleLog = document.querySelector("#consoleLog");
const jobState = document.querySelector("#jobState");
const latestOutput = document.querySelector("#latestOutput");
const rootPath = document.querySelector("#rootPath");
const openOutputBtn = document.querySelector("#openOutputBtn");
const clearLogBtn = document.querySelector("#clearLogBtn");
const generateBtn = document.querySelector("#generateBtn");
const authStatusBox = document.querySelector("#authStatusBox");
const authSummary = document.querySelector("#authSummary");
const thumbnailProviderName = "ChatGPT";

let latestOutputPath = "";
let outputDir = "";

function appendLog(message, detail) {
  const row = document.createElement("div");
  row.className = "log-row";
  const time = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  row.innerHTML = `<span>${time}</span><strong>${message}</strong>`;
  if (detail) {
    const code = document.createElement("pre");
    code.textContent = typeof detail === "string" ? detail : JSON.stringify(detail, null, 2);
    row.appendChild(code);
  }
  consoleLog.prepend(row);
}

function getSourceType() {
  return document.querySelector("input[name='sourceType']:checked")?.value || "keyword";
}

function readJobInput() {
  return {
    sourceType: getSourceType(),
    sourceValue: sourceValue.value.trim(),
    scriptLengthMode: document.querySelector("#scriptLengthMode").value,
    scriptLengthPreset: document.querySelector("#scriptLengthPreset").value,
    customDurationSeconds: Number(document.querySelector("#customDurationSeconds").value || 90),
    sceneStrategy: "sentence-proportional",
    voiceId: document.querySelector("#voiceId").value,
    subtitleStyleId: document.querySelector("#subtitleStyleId").value,
    speechSpeed: Number(speed.value),
    thumbnailMode: document.querySelector("#chatgptThumbnail").checked ? thumbnailProviderName.toLowerCase() : "auto",
    uploadEnabled: document.querySelector("#uploadEnabled").checked,
    privacyStatus: "private",
  };
}

async function loadConfig() {
  const config = await window.hermes.getConfig();
  outputDir = config.outputDir;
  rootPath.textContent = config.root;
  appendLog("App ready", config);
  await renderAuthStatus();
}

async function renderAuthStatus() {
  const status = await window.hermes.authStatus();
  if (authStatusBox) authStatusBox.textContent = JSON.stringify(status, null, 2);
  if (authSummary) {
    const readyCount = Object.values(status).filter((item) => /opened|ready|authenticated/i.test(item.status || "")).length;
    authSummary.textContent = `${readyCount}/${Object.keys(status).length} ready`;
  }
  return status;
}

speed.addEventListener("input", () => {
  speedValue.textContent = `${Number(speed.value).toFixed(2)}x`;
});

clearLogBtn.addEventListener("click", () => {
  consoleLog.replaceChildren();
  appendLog("Console cleared");
});

openOutputBtn.addEventListener("click", async () => {
  if (!outputDir) return;
  await window.hermes.openPath(outputDir);
});

latestOutput.addEventListener("click", async () => {
  if (!latestOutputPath) return;
  await window.hermes.openPath(latestOutputPath);
});

for (const target of ["chatgpt", "gemini", "googleFlow", "youtube"]) {
  document.querySelector(`#auth-${target}`)?.addEventListener("click", async () => {
    appendLog(`Starting ${target} authentication`);
    try {
      const result = await window.hermes.authStart(target);
      appendLog(`${target} authentication`, result);
      await renderAuthStatus();
    } catch (error) {
      appendLog(`${target} authentication failed`, error?.message || String(error));
    }
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = readJobInput();
  if (!input.sourceValue) {
    appendLog("Source is required", "키워드 또는 URL을 입력하세요.");
    sourceValue.focus();
    return;
  }

  generateBtn.disabled = true;
  jobState.textContent = "Running";
  appendLog("Submitting YouTube job", input);
  try {
    const result = await window.hermes.youtubeCreateJob(input);
    latestOutputPath = result.assets?.jobDir || "";
    latestOutput.disabled = !latestOutputPath;
    latestOutput.textContent = latestOutputPath || "No output";
    jobState.textContent = "Preview Complete";
    appendLog("Job finished", result.finalVideo || result);
  } catch (error) {
    jobState.textContent = "Failed";
    appendLog("Job failed", error?.message || String(error));
  } finally {
    generateBtn.disabled = false;
  }
});

window.hermes.onYouTubeEvent((event) => {
  appendLog(event.type || "youtube:event", event);
});

loadConfig().catch((error) => {
  jobState.textContent = "Config Error";
  appendLog("Failed to load config", error?.message || String(error));
});
