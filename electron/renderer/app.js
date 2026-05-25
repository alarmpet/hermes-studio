const form = document.querySelector("#jobForm");
const sourceValue = document.querySelector("#sourceValue");
const speed = document.querySelector("#speechSpeed");
const speedValue = document.querySelector("#speedValue");
const voiceSelect = document.querySelector("#voiceId");
const consoleLog = document.querySelector("#consoleLog");
const jobState = document.querySelector("#jobState");
const latestOutput = document.querySelector("#latestOutput");
const refreshJobsBtn = document.querySelector("#refreshJobsBtn");
const jobsList = document.querySelector("#jobsList");
const rootPath = document.querySelector("#rootPath");
const openOutputBtn = document.querySelector("#openOutputBtn");
const clearLogBtn = document.querySelector("#clearLogBtn");
const generateBtn = document.querySelector("#generateBtn");
const approveUploadBtn = document.querySelector("#approveUploadBtn");
const authStatusBox = document.querySelector("#authStatusBox");
const authSummary = document.querySelector("#authSummary");
const subtitleStyleId = document.querySelector("#subtitleStyleId");
const subtitleFontSize = document.querySelector("#subtitleFontSize");
const subtitleOutline = document.querySelector("#subtitleOutline");
const subtitleShadow = document.querySelector("#subtitleShadow");
const subtitlePreviewText = document.querySelector("#subtitlePreviewText");
const mockMediaModeInput = document.querySelector("#mockMediaMode");
const jobProgressPercent = document.querySelector("#jobProgressPercent");
const currentProgressMessage = document.querySelector("#currentProgressMessage");
const progressSteps = Array.from(document.querySelectorAll("#progressSteps [data-phase]"));
const progressActionRequired = document.querySelector("#progressActionRequired");
const thumbnailProviderName = "ChatGPT";

const subtitlePresetDefaults = {
  "clean-news": { fontSize: 10, outline: 2, shadow: 1, marginV: 80, maxLineChars: 12, maxLines: 2 },
  "bold-shorts": { fontSize: 11, outline: 2, shadow: 1, marginV: 90, maxLineChars: 10, maxLines: 2 },
  minimal: { fontSize: 9, outline: 1, shadow: 0, marginV: 80, maxLineChars: 13, maxLines: 2 },
};

const PROGRESS_PERCENT_BY_PHASE = {
  "submitted": 5,
  "research": 12,
  "draft": 24,
  "scene-planning": 34,
  "flow-submit": 45,
  "flow-media": 62,
  "render": 82,
  "thumbnail": 92,
  "upload": 96,
  "completed": 100,
};

let latestOutputPath = "";
let outputDir = "";
let appIsPackaged = false;

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
    voiceId: voiceSelect.value,
    subtitleStyleId: subtitleStyleId.value,
    subtitleStyle: {
      fontSize: Number(subtitleFontSize.value || 24),
      outline: Number(subtitleOutline.value || 4),
      shadow: Number(subtitleShadow.value || 1),
      marginV: subtitlePresetDefaults[subtitleStyleId.value]?.marginV || 78,
      maxLineChars: subtitlePresetDefaults[subtitleStyleId.value]?.maxLineChars || 11,
      maxLines: subtitlePresetDefaults[subtitleStyleId.value]?.maxLines || 2,
    },
    speechSpeed: Number(speed.value),
    mockMediaMode: !appIsPackaged && mockMediaModeInput.checked,
    thumbnailMode: document.querySelector("#chatgptThumbnail").checked ? thumbnailProviderName.toLowerCase() : "auto",
    uploadEnabled: document.querySelector("#uploadEnabled").checked,
    privacyStatus: "private",
  };
}

async function loadConfig() {
  const config = await window.hermes.getConfig();
  outputDir = config.outputDir;
  appIsPackaged = Boolean(config.isPackaged);
  if (appIsPackaged) {
    mockMediaModeInput.checked = false;
    mockMediaModeInput.disabled = true;
  }
  rootPath.textContent = config.root;
  await populateVoicePresets();
  updateSubtitlePreview();
  appendLog("App ready", config);
  await renderAuthStatus();
  await renderJobs();
}

async function populateVoicePresets() {
  const voices = await window.hermes.voicePresets();
  voiceSelect.replaceChildren(...voices.map((voice) => {
    const option = document.createElement("option");
    option.value = voice.id;
    option.textContent = voice.label;
    option.dataset.speed = String(voice.speed || "");
    return option;
  }));
  const first = voices[0];
  if (first?.speed) {
    speed.value = String(first.speed);
    speedValue.textContent = `${Number(speed.value).toFixed(2)}x`;
  }
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

voiceSelect.addEventListener("change", () => {
  const presetSpeed = voiceSelect.selectedOptions[0]?.dataset.speed;
  if (!presetSpeed) return;
  speed.value = presetSpeed;
  speedValue.textContent = `${Number(speed.value).toFixed(2)}x`;
});

subtitleStyleId.addEventListener("change", () => {
  const preset = subtitlePresetDefaults[subtitleStyleId.value] || subtitlePresetDefaults["bold-shorts"];
  subtitleFontSize.value = preset.fontSize;
  subtitleOutline.value = preset.outline;
  subtitleShadow.value = preset.shadow;
  updateSubtitlePreview();
});

for (const input of [subtitleFontSize, subtitleOutline, subtitleShadow]) {
  input.addEventListener("input", updateSubtitlePreview);
}

function updateSubtitlePreview() {
  const outline = Math.max(0, Number(subtitleOutline.value || 0));
  const shadow = Math.max(0, Number(subtitleShadow.value || 0));
  subtitlePreviewText.style.fontSize = `${Number(subtitleFontSize.value || 24)}px`;
  subtitlePreviewText.style.textShadow = buildSubtitleShadow(outline, shadow);
}

function buildSubtitleShadow(outline, shadow) {
  const shadows = [];
  for (const x of [-outline, 0, outline]) {
    for (const y of [-outline, 0, outline]) {
      if (x || y) shadows.push(`${x}px ${y}px 0 #000`);
    }
  }
  if (shadow) shadows.push(`0 ${shadow}px ${shadow}px rgba(0,0,0,.75)`);
  return shadows.join(", ");
}

function renderRunnerRecoveryGuidance(message = "") {
  if (!/Chromium\/Electron mode|Gpu Cache Creation failed|Unable to move the cache|disk_cache|ELECTRON_RUN_AS_NODE/i.test(String(message || ""))) {
    return null;
  }
  return "렌더 실행기 문제입니다. 앱을 완전히 종료한 뒤 최신 설치본의 Hermes YouTube Studio.exe로 다시 실행하세요.";
}

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

approveUploadBtn.addEventListener("click", async () => {
  const result = await window.hermes.youtubeApproveUpload();
  appendLog("Upload approval", result);
});

refreshJobsBtn.addEventListener("click", renderJobs);

async function renderJobs() {
  const jobs = await window.hermes.jobsList();
  if (!jobs.length) {
    jobsList.textContent = "No jobs yet";
    return;
  }
  jobsList.replaceChildren(...jobs.map((job) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "job-item";
    item.innerHTML = `<small>${job.status}</small><span>${job.title || job.id}</span>`;
    item.addEventListener("click", () => {
      if (job.jobDir) window.hermes.openPath(job.jobDir);
    });
    return item;
  }));
}

for (const target of ["chatgpt", "gemini", "googleFlow", "youtube"]) {
  document.querySelector(`#auth-${target}`)?.addEventListener("click", async () => {
    appendLog(`Starting ${target} authentication`);
    try {
      const result = await window.hermes.authStart(target);
      appendLog(`${target} authentication`, result);
      if (target === "youtube") await handleYouTubeAuthResult(result);
      await renderAuthStatus();
    } catch (error) {
      appendLog(`${target} authentication failed`, error?.message || String(error));
    }
  });
}

async function handleYouTubeAuthResult(result) {
  if (result.status === "client-secrets-missing") {
    appendLog("YouTube 인증 준비 필요", `Google Cloud Console에서 받은 client_secrets.json 파일을 여기에 넣어주세요: ${result.clientSecretsPath}`);
    if (result.setupDir) await window.hermes.openPath(result.setupDir);
    return;
  }
  if (result.status === "oauth-not-configured") {
    appendLog("YouTube OAuth 준비됨", result.message || "client_secrets.json 파일을 확인했습니다.");
  }
}

function resetProgressUi() {
  jobProgressPercent.textContent = "0%";
  currentProgressMessage.textContent = "작업을 기다리는 중입니다.";
  progressActionRequired.hidden = true;
  progressActionRequired.textContent = "";
  for (const step of progressSteps) {
    step.classList.remove("is-current", "is-complete", "is-failed", "is-action-required");
  }
}

function updateProgressUi(event) {
  if (!event || event.type !== "job-progress") return;
  const percent = Number(event.percent || 0);
  jobProgressPercent.textContent = `${percent}%`;
  currentProgressMessage.textContent = event.message || event.label || "진행 중입니다.";

  for (const step of progressSteps) {
    const stepPercent = PROGRESS_PERCENT_BY_PHASE[step.dataset.phase] || 0;
    step.classList.toggle("is-complete", stepPercent > 0 && stepPercent < percent);
    step.classList.toggle("is-current", step.dataset.phase === event.phase && event.status === "running");
    step.classList.toggle("is-failed", step.dataset.phase === event.phase && event.status === "failed");
    step.classList.toggle("is-action-required", step.dataset.phase === event.phase && event.status === "action-required");
  }

  if (event.actionRequired) {
    progressActionRequired.hidden = false;
    progressActionRequired.textContent = `${event.actionRequired.title}: ${event.actionRequired.message}`;
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const input = readJobInput();
  if (!input.sourceValue) {
    appendLog("Source is required", "키워드 또는 URL을 입력하세요.");
    sourceValue.focus();
    return;
  }

  resetProgressUi();
  updateProgressUi({
    type: "job-progress",
    phase: "submitted",
    status: "running",
    percent: 5,
    message: "작업을 접수했습니다. 곧 자료 확인을 시작합니다.",
  });
  generateBtn.disabled = true;
  generateBtn.textContent = "Generating...";
  jobState.textContent = "Running";
  appendLog("Submitting YouTube job", input);
  try {
    const result = await window.hermes.youtubeCreateJob(input);
    latestOutputPath = result.assets?.jobDir || "";
    latestOutput.disabled = !latestOutputPath;
    latestOutput.textContent = latestOutputPath || "No output";
    jobState.textContent = "Preview Complete";
    appendLog("Job finished", result.finalVideo || result);
    await renderJobs();
  } catch (error) {
    jobState.textContent = "Failed";
    appendLog("Job failed", error?.message || String(error));
  } finally {
    generateBtn.textContent = "Generate Final Video";
    generateBtn.disabled = false;
  }
});

window.hermes.onYouTubeEvent((event) => {
  if (event?.type === "job-progress") updateProgressUi(event);
  if (event?.type === "desktop-job-failed") {
    jobState.textContent = "Failed";
    if (progressActionRequired.hidden) {
      currentProgressMessage.textContent = renderRunnerRecoveryGuidance(event.message) || event.message || "작업이 실패했습니다.";
    }
  }
  appendLog(event.type || "youtube:event", event);
});

loadConfig().catch((error) => {
  jobState.textContent = "Config Error";
  appendLog("Failed to load config", error?.message || String(error));
});
