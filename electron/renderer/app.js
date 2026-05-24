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
    scriptLengthPreset: document.querySelector("#scriptLengthPreset").value,
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
