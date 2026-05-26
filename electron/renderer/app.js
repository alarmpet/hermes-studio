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
const durationSummary = document.querySelector("#durationSummary");
const qaSummary = document.querySelector("#qaSummary");
const sourceValueLabel = document.querySelector("#sourceValueLabel");
const sceneSplitPreview = document.querySelector("#sceneSplitPreview");
const scriptDurationValidation = document.querySelector("#scriptDurationValidation");
const stylePresetId = document.querySelector("#stylePresetId");
const stylePresetPreview = document.querySelector("#stylePresetPreview");
const renderEffectPreset = document.querySelector("#renderEffectPreset");
const transitionPreset = document.querySelector("#transitionPreset");
const transitionSeconds = document.querySelector("#transitionSeconds");
const renderEffectPreview = document.querySelector("#renderEffectPreview");
const flowOutputModeHint = document.querySelector("#flowOutputModeHint");
const hybridFlowControls = document.querySelector("#hybridFlowControls");
const hybridIntroVideoSceneCount = document.querySelector("#hybridIntroVideoSceneCount");
const hybridFlowPreview = document.querySelector("#hybridFlowPreview");
const characterSheetText = document.querySelector("#characterSheetText");
const characterSheetImages = document.querySelector("#characterSheetImages");
const characterSheetSummary = document.querySelector("#characterSheetSummary");
const artifactPanel = document.querySelector("#artifactPanel");
const copyJobSummaryBtn = document.querySelector("#copyJobSummaryBtn");
const thumbnailProviderName = "ChatGPT";

const presetSeconds = { micro: 30, short: 45, standard: 60, extended: 90 };
const presetScenes = { micro: 3, short: 4, standard: 5, extended: 6 };

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
  "flow-prompt-safety": 48,
  "flow-policy-warning": 52,
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
  const rendered = typeof message === "object" ? renderConsoleEvent(message) : { title: message, severity: "info", message: "", detail };
  row.className = `log-row is-${rendered.severity}`;
  row.dataset.severity = rendered.severity;
  const time = new Date().toLocaleTimeString("ko-KR", { hour12: false });
  row.innerHTML = `<span>${time}</span><strong>${rendered.title}</strong>`;
  if (rendered.message) {
    const messageNode = document.createElement("div");
    messageNode.className = "log-message";
    messageNode.textContent = rendered.message;
    row.appendChild(messageNode);
  }
  const payload = rendered.detail ?? detail;
  if (payload) {
    const code = document.createElement("pre");
    code.textContent = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
    row.appendChild(code);
  }
  consoleLog.prepend(row);
}

function eventSeverity(event = {}) {
  if (/failed|error/i.test(event.type || event.message || "")) return "error";
  if (event.type === "workflow-warning" || event.status === "action-required") return "warning";
  if (event.details?.finalPath || event.details?.thumbnailPath || event.details?.jobDir) return "artifact";
  return "info";
}

function renderConsoleEvent(event = {}) {
  const modeHint = event.details?.flowOutputMode ? `mode=${event.details.flowOutputMode}` : "";
  if (event.details?.eventType === "flow-mode-mismatch") {
    return {
      title: "flow-mode-mismatch",
      severity: "error",
      message: `Google Flow가 요청한 이미지/영상 모드로 전환되지 않았습니다. requested=${event.details.requestedOutputMode || "-"}, selected=${event.details.selectedOutputMode || "unknown"}. mode_mismatch 스크린샷을 확인하세요. output mode mismatch`,
      detail: event.details || null,
    };
  }
  return {
    title: event.phase || event.type || "event",
    severity: eventSeverity(event),
    message: [event.message || event.label || "", modeHint].filter(Boolean).join(" "),
    detail: event.details || event.input || null,
  };
}

function getSourceType() {
  return document.querySelector("input[name='sourceType']:checked")?.value || "keyword";
}

function getFlowOutputMode() {
  return document.querySelector("input[name='flowOutputMode']:checked")?.value || "video";
}

function getHybridIntroVideoSceneCount() {
  return Math.max(0, Math.min(6, Math.round(Number(hybridIntroVideoSceneCount?.value || 2))));
}

function updateHybridFlowControls() {
  const mode = getFlowOutputMode();
  if (hybridFlowControls) hybridFlowControls.hidden = mode !== "hybrid";
  if (hybridFlowPreview) {
    const count = getHybridIntroVideoSceneCount();
    hybridFlowPreview.textContent = `First ${count} scene${count === 1 ? "" : "s"}: video / remaining scenes: image`;
  }
}

function readJobInput() {
  return {
    sourceType: getSourceType(),
    sourceValue: sourceValue.value.trim(),
    scriptLengthMode: document.querySelector("#scriptLengthMode").value,
    scriptLengthPreset: document.querySelector("#scriptLengthPreset").value,
    customDurationSeconds: Number(document.querySelector("#customDurationSeconds").value || 60),
    scriptStructure: getSourceType() === "script" ? "direct-script" : "hpsl",
    sceneStrategy: "sentence-proportional",
    flowOutputMode: getFlowOutputMode(),
    hybridIntroVideoSceneCount: getHybridIntroVideoSceneCount(),
    renderEffectPreset: renderEffectPreset?.value || "cinematic",
    transitionPreset: transitionPreset?.value || "scene-fade",
    transitionSeconds: Number(transitionSeconds?.value || 0.3),
    stylePresetId: stylePresetId?.value || "cinematic-tech-news",
    characterSheet: {
      mode: characterSheetImages?.files?.length && characterSheetText?.value.trim()
        ? "text-and-image"
        : characterSheetImages?.files?.length
          ? "image"
          : characterSheetText?.value.trim()
            ? "text"
            : "none",
      profileText: characterSheetText?.value.trim() || "",
      referenceImagePaths: Array.from(characterSheetImages?.files || []).map((file) => file.path).filter(Boolean),
    },
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
  await populateStylePresets();
  updateSubtitlePreview();
  updateDurationPreview();
  updateSourceModeUi();
  updateFlowOutputModeHint();
  updateRenderEffectPreview();
  appendLog("App ready", config);
  await renderAuthStatus();
  await renderJobs();
}

function effectiveTargetSeconds() {
  const mode = document.querySelector("#scriptLengthMode").value;
  if (mode === "custom") {
    return Math.max(15, Math.min(600, Number(document.querySelector("#customDurationSeconds").value || 60)));
  }
  return presetSeconds[document.querySelector("#scriptLengthPreset").value] || 60;
}

function updateDurationPreview() {
  const seconds = effectiveTargetSeconds();
  const mode = document.querySelector("#scriptLengthMode").value;
  const preset = document.querySelector("#scriptLengthPreset").value;
  const customInput = document.querySelector("#customDurationSeconds");
  customInput.disabled = mode !== "custom";
  const scenes = mode === "custom" ? Math.max(3, Math.ceil(seconds / 10)) : (presetScenes[preset] || 5);
  durationSummary.textContent = `실제 적용 길이: ${seconds}초 · 예상 장면 ${scenes}개 · ${getSourceType() === "script" ? "직접 대본" : "HPSL"}`;
  updateScriptDurationValidation();
}

for (const selector of ["#scriptLengthMode", "#scriptLengthPreset", "#customDurationSeconds"]) {
  document.querySelector(selector)?.addEventListener("input", updateDurationPreview);
  document.querySelector(selector)?.addEventListener("change", updateDurationPreview);
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

async function populateStylePresets() {
  if (!stylePresetId) return;
  const presets = await window.hermes.stylePresets();
  stylePresetId.replaceChildren(...presets.map((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = preset.label;
    option.dataset.description = preset.description || "";
    option.dataset.promptSuffix = preset.promptSuffix || "";
    return option;
  }));
  updateStylePresetPreview();
}

function updateStylePresetPreview() {
  if (!stylePresetPreview || !stylePresetId) return;
  const selected = stylePresetId.selectedOptions[0];
  stylePresetPreview.textContent = selected?.dataset.description || "장면 스타일 프리셋을 선택하세요.";
}

function updateFlowOutputModeHint() {
  if (!flowOutputModeHint) return;
  if (getFlowOutputMode() === "hybrid") {
    flowOutputModeHint.textContent = "Hybrid: opening scenes use Flow video for motion and attention; later scenes use Nano Banana Pro images rendered as smooth motion clips.";
  } else if (getFlowOutputMode() === "image") {
    flowOutputModeHint.textContent = "Image: Google Flow creates Nano Banana Pro images and Hermes renders them into moving clips.";
  } else {
    flowOutputModeHint.textContent = "Video: Google Flow creates Veo video clips for every scene.";
  }
  updateHybridFlowControls();
}

function updateRenderEffectPreview() {
  if (!renderEffectPreview || !renderEffectPreset || !transitionPreset || !transitionSeconds) return;
  const effectLabels = {
    clean: "Clean: 안정적인 저속 줌/팬을 적용합니다.",
    cinematic: "Cinematic: 부드러운 줌/팬과 고급스러운 장면 흐름을 적용합니다.",
    "dynamic-shorts": "Dynamic Shorts: 초반 집중도를 위한 빠른 훅 모션을 적용합니다.",
  };
  const transitionLabel = transitionPreset.value === "none"
    ? "전환 없음"
    : `${transitionPreset.selectedOptions[0]?.textContent || transitionPreset.value} ${Number(transitionSeconds.value || 0.3).toFixed(2)}초`;
  renderEffectPreview.textContent = `${effectLabels[renderEffectPreset.value] || effectLabels.cinematic} ${transitionLabel}`;
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

stylePresetId?.addEventListener("change", updateStylePresetPreview);
renderEffectPreset?.addEventListener("change", updateRenderEffectPreview);
transitionPreset?.addEventListener("change", updateRenderEffectPreview);
transitionSeconds?.addEventListener("input", updateRenderEffectPreview);

for (const input of document.querySelectorAll("input[name='flowOutputMode']")) {
  input.addEventListener("change", updateFlowOutputModeHint);
}
hybridIntroVideoSceneCount?.addEventListener("input", updateHybridFlowControls);

for (const input of document.querySelectorAll("input[name='sourceType']")) {
  input.addEventListener("change", updateSourceModeUi);
}

sourceValue.addEventListener("input", () => {
  updateSceneSplitPreview();
  updateScriptDurationValidation();
});

characterSheetImages?.addEventListener("change", updateCharacterSheetSummary);
characterSheetText?.addEventListener("input", updateCharacterSheetSummary);
copyJobSummaryBtn?.addEventListener("click", copyJobSummary);

for (const button of document.querySelectorAll("#consoleFilters [data-filter]")) {
  button.addEventListener("click", () => {
    for (const sibling of document.querySelectorAll("#consoleFilters [data-filter]")) {
      sibling.classList.toggle("is-active", sibling === button);
    }
    const filter = button.dataset.filter;
    for (const row of consoleLog.querySelectorAll(".log-row")) {
      row.hidden = filter !== "all" && row.dataset.severity !== filter;
    }
  });
}

function updateSourceModeUi() {
  const sourceType = getSourceType();
  if (sourceValueLabel) {
    sourceValueLabel.textContent = sourceType === "url"
      ? "URL"
      : sourceType === "script"
        ? "직접 대본"
        : "키워드";
  }
  sourceValue.placeholder = sourceType === "script"
    ? "완성된 대본을 붙여넣으면 문장 단위로 장면 프롬프트를 생성합니다."
    : sourceType === "url"
      ? "분석할 기사 URL을 입력하세요."
      : "예: 구글 글래스, 최신 AI 뉴스";
  updateDurationPreview();
  updateSceneSplitPreview();
  updateScriptDurationValidation();
}

function updateSceneSplitPreview() {
  if (!sceneSplitPreview) return;
  if (getSourceType() !== "script") {
    sceneSplitPreview.textContent = "키워드/URL 입력은 Gemini 자료 수집 뒤 HPSL 구조로 장면을 구성합니다.";
    return;
  }
  const sentences = sourceValue.value
    .split(/(?<=[.!?。！？]|[가-힣]\.)\s+|[\r\n]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
  const preview = sentences.slice(0, 5).map((sentence, index) => `${index + 1}. ${sentence}`).join("\n");
  sceneSplitPreview.textContent = preview || "대본을 입력하면 문장 단위 장면 분할 미리보기가 표시됩니다.";
}

function estimateScriptSeconds(text) {
  return Math.max(0, Math.round((text || "").replace(/\s+/g, "").length / 5.5));
}

function updateScriptDurationValidation() {
  if (!scriptDurationValidation) return;
  if (getSourceType() !== "script") {
    scriptDurationValidation.textContent = "";
    scriptDurationValidation.hidden = true;
    return;
  }
  const targetSeconds = effectiveTargetSeconds();
  const estimatedSeconds = estimateScriptSeconds(sourceValue.value);
  const ratio = targetSeconds ? estimatedSeconds / targetSeconds : 1;
  scriptDurationValidation.hidden = false;
  scriptDurationValidation.classList.toggle("is-warning", ratio < 0.55 || ratio > 1.35);
  scriptDurationValidation.textContent = `예상 낭독 길이 ${estimatedSeconds}초 / 목표 ${targetSeconds}초`;
}

function updateCharacterSheetSummary() {
  if (!characterSheetSummary) return;
  const imageCount = characterSheetImages?.files?.length || 0;
  const hasText = Boolean(characterSheetText?.value.trim());
  if (!imageCount && !hasText) {
    characterSheetSummary.textContent = "캐릭터 시트 없음";
    return;
  }
  characterSheetSummary.textContent = `${hasText ? "텍스트 프로필" : ""}${hasText && imageCount ? " + " : ""}${imageCount ? `참조 이미지 ${imageCount}개` : ""}`;
}

function updateArtifactPanel(details = {}) {
  if (!artifactPanel) return;
  const entries = [
    ["최종 영상", details.finalPath || details.finalVideo],
    ["썸네일", details.thumbnailPath],
    ["작업 폴더", details.jobDir],
  ].filter(([, value]) => Boolean(value));
  if (!entries.length) return;
  artifactPanel.replaceChildren(...entries.map(([label, value]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${label}: ${value}`;
    button.addEventListener("click", () => window.hermes.openPath(value));
    return button;
  }));
}

async function restoreConsoleHistory(jobId) {
  if (!jobId || !window.hermes.workflowRecentEvents) return;
  const events = await window.hermes.workflowRecentEvents(jobId);
  if (!events.length) {
    appendLog("No saved workflow history", { jobId });
    return;
  }
  appendLog("Restored workflow history", { jobId, events: events.length });
  for (const event of events.reverse()) appendLog(event);
}

async function copyJobSummary() {
  const text = [
    `State: ${jobState.textContent}`,
    `Progress: ${jobProgressPercent.textContent}`,
    `Message: ${currentProgressMessage.textContent}`,
    `Latest output: ${latestOutputPath || "none"}`,
  ].join("\n");
  await navigator.clipboard?.writeText(text);
  appendLog("Copied job summary", text);
}

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
    item.addEventListener("click", async () => {
      latestOutputPath = job.finalVideo || job.jobDir || "";
      latestOutput.disabled = !latestOutputPath;
      latestOutput.textContent = latestOutputPath || "No output";
      jobState.textContent = job.status || "Selected";
      updateArtifactPanel({ finalPath: job.finalVideo, jobDir: job.jobDir, thumbnailPath: job.thumbnailPath });
      await restoreConsoleHistory(job.id);
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
  if (qaSummary) qaSummary.textContent = "QA 대기 중";
  if (artifactPanel) artifactPanel.replaceChildren();
  for (const step of progressSteps) {
    step.classList.remove("is-current", "is-complete", "is-failed", "is-action-required");
  }
}

function updateProgressUi(event) {
  if (!event || event.type !== "job-progress") return;
  const percent = Number(event.percent || 0);
  jobProgressPercent.textContent = `${percent}%`;
  currentProgressMessage.textContent = event.message || event.label || "진행 중입니다.";

  if (event.phase === "flow-prompt-safety") {
    appendLog("Flow Prompt Safety", {
      message: event.message,
      flags: event.details?.flow_prompt_safety?.flags || [],
      replacements: event.details?.flow_prompt_safety?.replacements || [],
      recovered: Boolean(event.details?.recovered),
    });
  }

  if (event.phase === "flow-policy-warning") {
    appendLog("Flow Prompt Safety", {
      message: event.message,
      warning: event.details?.warning || "policy-warning",
      sceneOrder: event.details?.sceneOrder,
      retryCount: event.details?.retryCount,
      recovered: Boolean(event.details?.recovered),
    });
  }

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
  updateQaSummary(event.details || {});
  updateArtifactPanel(event.details || {});
}

function updateQaSummary(details = {}) {
  if (!qaSummary) return;
  const warnings = details.qualityWarnings || details.renderWarnings || [];
  if (details.requiresRegeneration) {
    qaSummary.textContent = "QA: 재생성 필요";
    qaSummary.classList.add("is-warning");
    return;
  }
  if (details.freezeRisk || warnings.length) {
    qaSummary.textContent = `QA: 확인 필요 ${warnings.length ? `(${warnings.length}건)` : ""}`;
    qaSummary.classList.add("is-warning");
    return;
  }
  if (details.scriptStructure || details.sceneSectionMap) {
    qaSummary.textContent = "QA: HPSL 장면 구성 확인 완료";
    qaSummary.classList.remove("is-warning");
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
  appendLog(event || "youtube:event");
});

loadConfig().catch((error) => {
  jobState.textContent = "Config Error";
  appendLog("Failed to load config", error?.message || String(error));
});
