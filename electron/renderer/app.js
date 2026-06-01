const form = document.querySelector("#jobForm");
const sourceValue = document.querySelector("#sourceValue");
const speed = document.querySelector("#speechSpeed");
const speedValue = document.querySelector("#speedValue");
const voiceSelect = document.querySelector("#voiceId");
const researchProvider = document.querySelector("#researchProvider");
const archiveProvider = document.querySelector("#archiveProvider");
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
const titleOverlayEnabled = document.querySelector("#titleOverlayEnabled");
const titleOverlayText = document.querySelector("#titleOverlayText");
const titleOverlayStyleId = document.querySelector("#titleOverlayStyleId");
const titleOverlayPreviewText = document.querySelector("#titleOverlayPreviewText");
const thumbnailTextEnabled = document.querySelector("#thumbnailTextEnabled");
const thumbnailHeadlineText = document.querySelector("#thumbnailHeadlineText");
const thumbnailSubheadlineText = document.querySelector("#thumbnailSubheadlineText");
const thumbnailFontFamily = document.querySelector("#thumbnailFontFamily");
const thumbnailFontWeight = document.querySelector("#thumbnailFontWeight");
const thumbnailTitleFontSize = document.querySelector("#thumbnailTitleFontSize");
const thumbnailSubFontSize = document.querySelector("#thumbnailSubFontSize");
const thumbnailTextColor = document.querySelector("#thumbnailTextColor");
const thumbnailHighlightColor = document.querySelector("#thumbnailHighlightColor");
const thumbnailBackgroundColor = document.querySelector("#thumbnailBackgroundColor");
const thumbnailBackgroundOpacity = document.querySelector("#thumbnailBackgroundOpacity");
const thumbnailPositionY = document.querySelector("#thumbnailPositionY");
const thumbnailBandHeight = document.querySelector("#thumbnailBandHeight");
const thumbnailPreview = document.querySelector("#thumbnailPreview");
const thumbnailPreviewText = document.querySelector("#thumbnailPreviewText");
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
const motionIntensity = document.querySelector("#motionIntensity");
const transitionPreset = document.querySelector("#transitionPreset");
const transitionSeconds = document.querySelector("#transitionSeconds");
const renderEffectPreview = document.querySelector("#renderEffectPreview");
const flowOutputModeHint = document.querySelector("#flowOutputModeHint");
const videoFormatHint = document.querySelector("#videoFormatHint");
const autoLandscapeLongform = document.querySelector("#autoLandscapeLongform");
const aspectRatioHint = document.querySelector("#aspectRatioHint");
const longformControls = document.querySelector("#longformControls");
const hybridFlowControls = document.querySelector("#hybridFlowControls");
const hybridIntroVideoSceneCount = document.querySelector("#hybridIntroVideoSceneCount");
const longformTargetSeconds = document.querySelector("#longformTargetSeconds");
const introVideoClipCount = document.querySelector("#introVideoClipCount");
const bodyImageSeconds = document.querySelector("#bodyImageSeconds");
const hybridFlowPreview = document.querySelector("#hybridFlowPreview");
const characterSheetText = document.querySelector("#characterSheetText");
const characterSheetImages = document.querySelector("#characterSheetImages");
const characterSheetSummary = document.querySelector("#characterSheetSummary");
const artifactPanel = document.querySelector("#artifactPanel");
const youtubeUploadPanel = document.querySelector("#youtubeUploadPanel");
const uploadVideoPath = document.querySelector("#uploadVideoPath");
const uploadThumbnailPreview = document.querySelector("#uploadThumbnailPreview");
const uploadTitleInput = document.querySelector("#uploadTitleInput");
const uploadTitleCount = document.querySelector("#uploadTitleCount");
const uploadDescriptionInput = document.querySelector("#uploadDescriptionInput");
const uploadTagsInput = document.querySelector("#uploadTagsInput");
const uploadPrivacySelect = document.querySelector("#uploadPrivacySelect");
const uploadCategorySelect = document.querySelector("#uploadCategorySelect");
const uploadCustomThumbnailInput = document.querySelector("#uploadCustomThumbnailInput");
const uploadMadeForKidsCheckbox = document.querySelector("#uploadMadeForKidsCheckbox");
const uploadSyntheticMediaCheckbox = document.querySelector("#uploadSyntheticMediaCheckbox");
const uploadNotifySubscribersCheckbox = document.querySelector("#uploadNotifySubscribersCheckbox");
const uploadSaveMetadataBtn = document.querySelector("#uploadSaveMetadataBtn");
const uploadToYouTubeBtn = document.querySelector("#uploadToYouTubeBtn");
const uploadStatusMessage = document.querySelector("#uploadStatusMessage");
const uploadResultLink = document.querySelector("#uploadResultLink");
const retryFailedScenesBtn = document.querySelector("#retryFailedScenesBtn");
const renderExistingAssetsBtn = document.querySelector("#renderExistingAssetsBtn");
const retryThumbnailBtn = document.querySelector("#retryThumbnailBtn");
const copyJobSummaryBtn = document.querySelector("#copyJobSummaryBtn");
const enableLiveMcp = document.querySelector("#enableLiveMcp");
const webwrightDiagnosticsEnabled = document.querySelector("#webwrightDiagnosticsEnabled");
const thumbnailProviderName = "Flow";

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
let selectedJobId = "";
let selectedUploadMetadata = null;
let selectedUploadState = null;

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
  if (event.type === "workflow-warning" || event.status === "action-required" || event.details?.primaryProviderFailure) return "warning";
  if (event.details?.finalPath || event.details?.thumbnailPath || event.details?.jobDir) return "artifact";
  return "info";
}

function explainThumbnailFailure(failure = {}) {
  const code = failure.code || failure.failureCode || "";
  if (code === "CHATGPT_IMAGE_TOOL_NOT_FOUND") {
    return "ChatGPT는 열렸지만 이미지 만들기 도구를 찾지 못했습니다. ChatGPT 화면에서 이미지 생성 기능이 사용 가능한 계정/모델인지 확인하세요.";
  }
  if (code === "CHATGPT_HUMAN_VERIFICATION_REQUIRED") {
    return "ChatGPT 사람 확인 또는 보안 확인이 필요합니다. Authenticate ChatGPT를 열고 확인을 완료한 뒤 다시 실행하세요.";
  }
  if (code === "CHATGPT_AUTH_REQUIRED") {
    return "ChatGPT 로그인이 필요합니다. Authenticate ChatGPT 버튼으로 로그인하세요.";
  }
  if (code === "CHATGPT_IMAGE_TIMEOUT") {
    return "ChatGPT가 제한 시간 안에 새 썸네일 이미지를 노출하지 않았습니다. 모델/도구 상태를 확인하세요.";
  }
  if (code === "CHATGPT_TEXT_RESPONSE_INSTEAD_OF_IMAGE") {
    return "ChatGPT가 이미지 생성 대신 텍스트 응답 상태로 동작했습니다. 이미지 만들기 도구가 선택됐는지 확인하세요.";
  }
  return failure.message || "ChatGPT 썸네일 생성 실패로 로컬 폴백 썸네일을 사용했습니다.";
}

function renderConsoleEvent(event = {}) {
  const modeHint = event.details?.flowOutputMode ? `mode=${event.details.flowOutputMode}` : "";
  if (event.details?.primaryProviderFailure) {
    return {
      title: "Google Flow thumbnail fallback",
      severity: "warning",
      message: explainThumbnailFailure(event.details.primaryProviderFailure),
      detail: event.details.primaryProviderFailure,
    };
  }
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

function getVideoFormat() {
  return document.querySelector("input[name='videoFormat']:checked")?.value || "shorts";
}

function getLongformTargetSeconds() {
  return Math.max(600, Math.min(1200, Number(longformTargetSeconds?.value || 720)));
}

function getRequestedAspectRatio() {
  const customDuration = Number(document.querySelector("#customDurationSeconds")?.value || 60);
  const longformLike = getVideoFormat() === "longform" || customDuration >= 180 || getLongformTargetSeconds() >= 180;
  return autoLandscapeLongform?.checked && longformLike ? "16:9" : "9:16";
}

function getHybridIntroVideoSceneCount() {
  if (getVideoFormat() === "longform") {
    return Math.max(1, Math.min(10, Math.round(Number(introVideoClipCount?.value || 10))));
  }
  return Math.max(0, Math.min(10, Math.round(Number(hybridIntroVideoSceneCount?.value || 2))));
}

function updateHybridFlowControls() {
  const mode = getVideoFormat() === "longform" ? "hybrid" : getFlowOutputMode();
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
    videoFormat: getVideoFormat(),
    longformTargetSeconds: getLongformTargetSeconds(),
    introVideoSeconds: 60,
    introVideoClipCount: Math.max(1, Math.min(10, Math.round(Number(introVideoClipCount?.value || 10)))),
    bodyVisualMode: "image",
    bodyImageSeconds: Math.max(10, Math.min(30, Number(bodyImageSeconds?.value || 18))),
    enableLiveMcp: Boolean(enableLiveMcp?.checked),
    scriptLengthMode: document.querySelector("#scriptLengthMode").value,
    scriptLengthPreset: document.querySelector("#scriptLengthPreset").value,
    customDurationSeconds: Number(document.querySelector("#customDurationSeconds").value || 60),
    scriptStructure: getSourceType() === "script" ? "direct-script" : "hpsl",
    sceneStrategy: "sentence-proportional",
    flowOutputMode: getVideoFormat() === "longform" ? "hybrid" : getFlowOutputMode(),
    hybridIntroVideoSceneCount: getHybridIntroVideoSceneCount(),
    renderEffectPreset: renderEffectPreset?.value || "cinematic",
    motionIntensity: motionIntensity?.value || "light",
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
    researchProvider: researchProvider?.value || "gemini-gems-browser",
    archiveProvider: archiveProvider?.value || "local-files",
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
    titleOverlayEnabled: Boolean(titleOverlayEnabled?.checked),
    titleOverlayMode: titleOverlayText?.value.trim() ? "manual" : "auto",
    titleOverlayText: titleOverlayText?.value.trim() || "",
    titleOverlayStyleId: titleOverlayStyleId?.value || "bold-black-accent",
    titleOverlayMaxLines: 2,
    titleOverlaySafeTop: getRequestedAspectRatio() === "16:9" ? 40 : 84,
    thumbnailOverlay: readThumbnailOverlayInput(),
    aspectRatio: getRequestedAspectRatio(),
    autoLandscapeLongform: Boolean(autoLandscapeLongform?.checked),
    speechSpeed: Number(speed.value),
    mockMediaMode: !appIsPackaged && mockMediaModeInput.checked,
    thumbnailMode: document.querySelector("#chatgptThumbnail").checked ? thumbnailProviderName.toLowerCase() : "auto",
    uploadEnabled: document.querySelector("#uploadEnabled").checked,
    privacyStatus: "private",
  };
}

async function loadConfig() {
  const config = await window.hermes.getConfig();
  const persistedConfig = await window.hermes.configGet?.().catch(() => null);
  outputDir = config.outputDir;
  appIsPackaged = Boolean(config.isPackaged);
  if (webwrightDiagnosticsEnabled) {
    webwrightDiagnosticsEnabled.checked = Boolean(persistedConfig?.webwrightDiagnosticsEnabled);
  }
  if (appIsPackaged) {
    mockMediaModeInput.checked = false;
    mockMediaModeInput.disabled = true;
  }
  rootPath.textContent = config.root;
  await populateVoicePresets();
  await populateStylePresets();
  updateSubtitlePreview();
  updateTitleOverlayPreview();
  updateThumbnailPreview();
  updateDurationPreview();
  updateSourceModeUi();
  updateFlowOutputModeHint();
  updateRenderEffectPreview();
  appendLog("App ready", config);
  await renderAuthStatus();
  await renderJobs();
  renderEmptyUploadPanel();
}

function effectiveTargetSeconds() {
  if (getVideoFormat() === "longform") return getLongformTargetSeconds();
  const mode = document.querySelector("#scriptLengthMode").value;
  if (mode === "custom") {
    return Math.max(15, Math.min(1200, Number(document.querySelector("#customDurationSeconds").value || 60)));
  }
  return presetSeconds[document.querySelector("#scriptLengthPreset").value] || 60;
}

function updateDurationPreview() {
  const seconds = effectiveTargetSeconds();
  const mode = document.querySelector("#scriptLengthMode").value;
  const preset = document.querySelector("#scriptLengthPreset").value;
  const customInput = document.querySelector("#customDurationSeconds");
  customInput.disabled = mode !== "custom";
  if (longformControls) longformControls.hidden = getVideoFormat() !== "longform";
  if (videoFormatHint) {
    videoFormatHint.textContent = getVideoFormat() === "longform"
      ? "Longform: 초반은 Flow 영상 클립, 이후는 Flow 이미지와 로컬 모션 렌더로 구성합니다."
      : "Shorts: 30-90초 중심의 빠른 영상입니다.";
  }
  const scenes = mode === "custom" ? Math.max(3, Math.ceil(seconds / 10)) : (presetScenes[preset] || 5);
  durationSummary.textContent = `실제 적용 길이: ${seconds}초 · 예상 장면 ${scenes}개 · ${getSourceType() === "script" ? "직접 대본" : "HPSL"}`;
  updateScriptDurationValidation();
  updateAspectRatioHint();
}

function updateAspectRatioHint() {
  if (!aspectRatioHint) return;
  const aspect = getRequestedAspectRatio();
  aspectRatioHint.textContent = aspect === "16:9"
    ? "Landscape 16:9: Flow prompts, final render, and thumbnail target horizontal longform output."
    : "Portrait 9:16: Flow prompts, final render, and thumbnail target vertical output.";
}

for (const selector of ["#scriptLengthMode", "#scriptLengthPreset", "#customDurationSeconds"]) {
  document.querySelector(selector)?.addEventListener("input", updateDurationPreview);
  document.querySelector(selector)?.addEventListener("change", updateDurationPreview);
}

for (const input of document.querySelectorAll("input[name='videoFormat']")) {
  input.addEventListener("change", () => {
    if (getVideoFormat() === "longform") {
      document.querySelector("#scriptLengthMode").value = "custom";
      document.querySelector("#customDurationSeconds").value = String(getLongformTargetSeconds());
      document.querySelector("input[name='flowOutputMode'][value='hybrid']").checked = true;
      if (researchProvider) researchProvider.value = "notebooklm-mcp";
      if (enableLiveMcp) enableLiveMcp.checked = true;
    }
    updateDurationPreview();
    updateFlowOutputModeHint();
    updateAspectRatioHint();
  });
}

autoLandscapeLongform?.addEventListener("change", updateAspectRatioHint);

for (const selector of ["#longformTargetSeconds", "#introVideoClipCount", "#bodyImageSeconds"]) {
  document.querySelector(selector)?.addEventListener("input", () => {
    if (getVideoFormat() === "longform") {
      document.querySelector("#customDurationSeconds").value = String(getLongformTargetSeconds());
    }
    updateDurationPreview();
    updateHybridFlowControls();
  });
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
  const defaultVoiceId = "female_30_announcer";
  const defaultPreset = voices.find((v) => v.id === defaultVoiceId) || voices[0];
  if (defaultPreset) {
    voiceSelect.value = defaultPreset.id;
    speed.value = String(defaultPreset.speed || 1.06);
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
  const mode = getVideoFormat() === "longform" ? "hybrid" : getFlowOutputMode();
  if (mode === "hybrid") {
    flowOutputModeHint.textContent = "Hybrid: opening scenes use Flow video for motion and attention; later scenes use Nano Banana Pro images rendered as smooth motion clips.";
  } else if (mode === "image") {
    flowOutputModeHint.textContent = "Image: Google Flow creates Nano Banana Pro images and Hermes renders them into moving clips.";
  } else {
    flowOutputModeHint.textContent = "Video: Google Flow creates Veo video clips for every scene.";
  }
  updateHybridFlowControls();
}

function updateRenderEffectPreview() {
  if (!renderEffectPreview || !renderEffectPreset || !motionIntensity || !transitionPreset || !transitionSeconds) return;
  const effectLabels = {
    clean: "Clean",
    cinematic: "Cinematic",
    "dynamic-shorts": "Dynamic Shorts",
  };
  const intensityLabels = {
    none: "효과없음: 정적인 장면 위주로 안정적으로 렌더합니다.",
    light: "약하게: 장면마다 은은한 줌/팬 효과를 랜덤 적용합니다.",
    strong: "강하게: 초반 집중도를 위해 더 역동적인 줌/팬 효과를 랜덤 적용합니다.",
  };
  const transitionLabel = transitionPreset.value === "none"
    ? "전환 없음"
    : `${transitionPreset.selectedOptions[0]?.textContent || transitionPreset.value} ${Number(transitionSeconds.value || 0.3).toFixed(2)}초`;
  renderEffectPreview.textContent = `${intensityLabels[motionIntensity.value] || intensityLabels.light} ${effectLabels[renderEffectPreset.value] || effectLabels.cinematic} · ${transitionLabel}`;
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

function updateTitleOverlayPreview() {
  if (!titleOverlayPreviewText) return;
  const fallback = sourceValue.value.trim().slice(0, 24) || "Auto: generated title";
  titleOverlayPreviewText.textContent = titleOverlayText?.value.trim() || fallback;
  titleOverlayPreviewText.parentElement.dataset.style = titleOverlayStyleId?.value || "bold-black-accent";
  titleOverlayPreviewText.parentElement.dataset.enabled = titleOverlayEnabled?.checked ? "true" : "false";
}

function readThumbnailOverlayInput() {
  return {
    enabled: thumbnailTextEnabled?.checked !== false,
    headlineText: thumbnailHeadlineText?.value.trim() || "",
    subheadlineText: thumbnailSubheadlineText?.value.trim() || "",
    fontFamily: thumbnailFontFamily?.value || "Malgun Gothic",
    fontWeight: Number(thumbnailFontWeight?.value || 900),
    titleFontSize: Number(thumbnailTitleFontSize?.value || 96),
    subFontSize: Number(thumbnailSubFontSize?.value || 52),
    textColor: thumbnailTextColor?.value || "#ffffff",
    highlightColor: thumbnailHighlightColor?.value || "#fde047",
    backgroundColor: thumbnailBackgroundColor?.value || "#050505",
    backgroundOpacity: Number(thumbnailBackgroundOpacity?.value ?? 0.72),
    positionYPercent: Number(thumbnailPositionY?.value ?? 5.5),
    bandHeightPercent: Number(thumbnailBandHeight?.value ?? 22),
    maxLines: 2,
  };
}

function updateThumbnailPreview() {
  if (!thumbnailPreview || !thumbnailPreviewText) return;
  const style = readThumbnailOverlayInput();
  const headline = style.headlineText || titleOverlayText?.value.trim() || sourceValue?.value.trim().slice(0, 18) || "후킹 썸네일 제목";
  const subline = style.subheadlineText || "지금 확인해야 할 핵심";
  thumbnailPreview.dataset.enabled = style.enabled ? "true" : "false";
  thumbnailPreview.style.setProperty("--thumb-bg", style.backgroundColor);
  thumbnailPreview.style.setProperty("--thumb-bg-opacity", String(style.backgroundOpacity));
  thumbnailPreview.style.setProperty("--thumb-y", `${style.positionYPercent}%`);
  thumbnailPreview.style.setProperty("--thumb-band-h", `${style.bandHeightPercent}%`);
  thumbnailPreview.style.setProperty("--thumb-font", style.fontFamily);
  thumbnailPreview.style.setProperty("--thumb-title-size", `${Math.round(style.titleFontSize / 3)}px`);
  thumbnailPreview.style.setProperty("--thumb-sub-size", `${Math.round(style.subFontSize / 3)}px`);
  thumbnailPreview.style.setProperty("--thumb-text", style.textColor);
  thumbnailPreview.style.setProperty("--thumb-highlight", style.highlightColor);
  thumbnailPreviewText.innerHTML = `<strong>${escapeHtml(headline)}</strong><span>${escapeHtml(subline)}</span>`;
}

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

for (const input of [titleOverlayEnabled, titleOverlayText, titleOverlayStyleId, sourceValue]) {
  input?.addEventListener("input", updateTitleOverlayPreview);
  input?.addEventListener("change", updateTitleOverlayPreview);
}

for (const input of [
  thumbnailTextEnabled,
  thumbnailHeadlineText,
  thumbnailSubheadlineText,
  thumbnailFontFamily,
  thumbnailFontWeight,
  thumbnailTitleFontSize,
  thumbnailSubFontSize,
  thumbnailTextColor,
  thumbnailHighlightColor,
  thumbnailBackgroundColor,
  thumbnailBackgroundOpacity,
  thumbnailPositionY,
  thumbnailBandHeight,
  sourceValue,
  titleOverlayText,
]) {
  input?.addEventListener("input", updateThumbnailPreview);
  input?.addEventListener("change", updateThumbnailPreview);
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
  const result = await window.hermes.youtubeApproveUpload(selectedJobId);
  appendLog("Upload approval", result);
  if (result?.ok || result?.status === "job-id-required") await loadUploadPanel(selectedJobId);
});

refreshJobsBtn.addEventListener("click", renderJobs);

stylePresetId?.addEventListener("change", updateStylePresetPreview);
renderEffectPreset?.addEventListener("change", updateRenderEffectPreview);
motionIntensity?.addEventListener("change", updateRenderEffectPreview);
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
  const value = sourceValue.value.trim();
  if (/^https?:\/\//i.test(value) && getSourceType() === "keyword") {
    const urlRadio = document.querySelector("input[name='sourceType'][value='url']");
    if (urlRadio) {
      urlRadio.checked = true;
      updateSourceModeUi();
    }
  }
  updateSceneSplitPreview();
  updateScriptDurationValidation();
});

characterSheetImages?.addEventListener("change", updateCharacterSheetSummary);
characterSheetText?.addEventListener("input", updateCharacterSheetSummary);
copyJobSummaryBtn?.addEventListener("click", copyJobSummary);
retryFailedScenesBtn?.addEventListener("click", retryFailedScenes);
renderExistingAssetsBtn?.addEventListener("click", renderExistingAssets);
retryThumbnailBtn?.addEventListener("click", retryThumbnail);
uploadTitleInput?.addEventListener("input", updateUploadTitleCount);
uploadVideoPath?.addEventListener("click", () => {
  if (selectedUploadMetadata?.videoPath) window.hermes.openPath(selectedUploadMetadata.videoPath);
});
uploadThumbnailPreview?.addEventListener("click", () => {
  if (selectedUploadMetadata?.thumbnailPath) window.hermes.openPath(selectedUploadMetadata.thumbnailPath);
});
uploadSaveMetadataBtn?.addEventListener("click", saveUploadMetadata);
uploadToYouTubeBtn?.addEventListener("click", uploadSelectedJob);
uploadResultLink?.addEventListener("click", () => {
  if (selectedUploadState?.youtubeUrl) window.open(selectedUploadState.youtubeUrl, "_blank", "noopener");
});

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
  const primaryFailure = details.primaryProviderFailure || {};
  const entries = [
    ["최종 영상", details.finalPath || details.finalVideo],
    ["썸네일", details.thumbnailPath],
    ["작업 폴더", details.jobDir],
    ["ChatGPT 썸네일 실패", primaryFailure.resultPath],
    ["ChatGPT 진단", primaryFailure.details?.diagnosticsPath],
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

async function loadUploadPanel(jobId) {
  if (!youtubeUploadPanel) return;
  if (!jobId) {
    renderEmptyUploadPanel();
    selectedUploadMetadata = null;
    selectedUploadState = null;
    return;
  }
  const result = await window.hermes.youtubeGetUploadDraft(jobId);
  if (!result?.ok) {
    renderEmptyUploadPanel(result.message || "완료된 영상을 선택하면 업로드 정보를 편집할 수 있습니다.");
    appendLog("Upload draft unavailable", result);
    return;
  }
  selectedUploadMetadata = result.metadata;
  selectedUploadState = result.uploadState || null;
  renderUploadPanel();
}

function renderEmptyUploadPanel(message = "최종 영상 생성이 완료되면 제목, 설명, 태그, 썸네일을 확인하고 YouTube에 업로드할 수 있습니다.") {
  if (!youtubeUploadPanel) return;
  youtubeUploadPanel.hidden = false;
  selectedUploadMetadata = null;
  selectedUploadState = null;
  uploadStatusMessage.textContent = "Waiting for final video";
  uploadTitleInput.value = "";
  uploadDescriptionInput.value = "";
  uploadTagsInput.value = "";
  uploadPrivacySelect.value = "private";
  uploadCategorySelect.value = "25";
  uploadMadeForKidsCheckbox.checked = false;
  uploadSyntheticMediaCheckbox.checked = true;
  uploadNotifySubscribersCheckbox.checked = false;
  uploadVideoPath.textContent = message;
  uploadVideoPath.disabled = true;
  uploadThumbnailPreview.textContent = "Thumbnail will appear after render";
  uploadThumbnailPreview.disabled = true;
  setUploadPanelEnabled(false);
  uploadToYouTubeBtn.textContent = "Upload to YouTube";
  uploadResultLink.hidden = true;
  updateUploadTitleCount();
}

function renderUploadPanel() {
  if (!youtubeUploadPanel || !selectedUploadMetadata) return;
  const metadata = selectedUploadMetadata;
  youtubeUploadPanel.hidden = false;
  setUploadPanelEnabled(true);
  uploadTitleInput.value = metadata.title || "";
  uploadDescriptionInput.value = metadata.description || "";
  uploadTagsInput.value = (metadata.tags || []).join(", ");
  uploadPrivacySelect.value = metadata.privacyStatus || "private";
  uploadCategorySelect.value = metadata.categoryId || "25";
  uploadMadeForKidsCheckbox.checked = Boolean(metadata.madeForKids);
  uploadSyntheticMediaCheckbox.checked = metadata.containsSyntheticMedia !== false;
  uploadNotifySubscribersCheckbox.checked = Boolean(metadata.notifySubscribers);
  updateUploadTitleCount();
  uploadVideoPath.textContent = metadata.videoPath ? `Video: ${metadata.videoPath}` : "Final video not selected";
  uploadVideoPath.disabled = !metadata.videoPath;
  uploadThumbnailPreview.textContent = metadata.thumbnailPath ? `Thumbnail: ${metadata.thumbnailPath}` : "Thumbnail not selected";
  uploadThumbnailPreview.disabled = !metadata.thumbnailPath;
  const uploaded = selectedUploadState?.status === "uploaded" && selectedUploadState?.youtubeUrl;
  uploadStatusMessage.textContent = uploaded ? "Uploaded" : selectedUploadState?.status || "Draft";
  uploadToYouTubeBtn.disabled = Boolean(uploaded);
  uploadToYouTubeBtn.textContent = uploaded ? "Already Uploaded" : "Upload to YouTube";
  uploadResultLink.hidden = !uploaded;
}

function setUploadPanelEnabled(enabled) {
  for (const input of [
    uploadTitleInput,
    uploadDescriptionInput,
    uploadTagsInput,
    uploadPrivacySelect,
    uploadCategorySelect,
    uploadCustomThumbnailInput,
    uploadMadeForKidsCheckbox,
    uploadSyntheticMediaCheckbox,
    uploadNotifySubscribersCheckbox,
    uploadSaveMetadataBtn,
  ]) {
    if (input) input.disabled = !enabled;
  }
  if (uploadToYouTubeBtn) uploadToYouTubeBtn.disabled = !enabled;
}

function readUploadDraftFromPanel() {
  const customThumbnailPath = uploadCustomThumbnailInput?.files?.[0]?.path || "";
  return {
    ...(selectedUploadMetadata || {}),
    title: uploadTitleInput.value.trim(),
    description: uploadDescriptionInput.value.trim(),
    tags: uploadTagsInput.value.split(",").map((tag) => tag.trim()).filter(Boolean),
    privacyStatus: uploadPrivacySelect.value,
    categoryId: uploadCategorySelect.value,
    thumbnailPath: customThumbnailPath || selectedUploadMetadata?.thumbnailPath || "",
    madeForKids: uploadMadeForKidsCheckbox.checked,
    containsSyntheticMedia: uploadSyntheticMediaCheckbox.checked,
    notifySubscribers: uploadNotifySubscribersCheckbox.checked,
  };
}

function updateUploadTitleCount() {
  if (!uploadTitleCount || !uploadTitleInput) return;
  uploadTitleCount.textContent = `${uploadTitleInput.value.length}/100`;
}

async function saveUploadMetadata() {
  if (!selectedJobId) return;
  const result = await window.hermes.youtubeSaveUploadDraft(selectedJobId, readUploadDraftFromPanel());
  if (!result?.ok) {
    uploadStatusMessage.textContent = "Validation failed";
    appendLog("Upload metadata validation failed", result);
    return;
  }
  selectedUploadMetadata = result.metadata;
  selectedUploadState = result.uploadState || selectedUploadState;
  renderUploadPanel();
  appendLog("Upload metadata saved", result.metadata);
}

async function uploadSelectedJob() {
  if (!selectedJobId || !uploadToYouTubeBtn) return;
  uploadToYouTubeBtn.disabled = true;
  uploadStatusMessage.textContent = "Uploading";
  appendLog("Starting YouTube upload", { jobId: selectedJobId });
  const result = await window.hermes.youtubeUploadJob(selectedJobId, readUploadDraftFromPanel());
  if (!result?.ok) {
    uploadStatusMessage.textContent = result?.status || "Upload failed";
    uploadToYouTubeBtn.disabled = false;
    appendLog("YouTube upload failed", result);
    return;
  }
  selectedUploadState = result.uploadState;
  uploadStatusMessage.textContent = "Uploaded";
  uploadResultLink.hidden = false;
  uploadToYouTubeBtn.textContent = "Already Uploaded";
  appendLog("YouTube upload completed", result);
  await renderJobs();
}

function updateRecoveryActions() {
  const disabled = !selectedJobId;
  if (retryFailedScenesBtn) retryFailedScenesBtn.disabled = disabled;
  if (renderExistingAssetsBtn) renderExistingAssetsBtn.disabled = disabled;
  if (retryThumbnailBtn) retryThumbnailBtn.disabled = disabled;
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

async function retryFailedScenes() {
  if (!selectedJobId) return;
  jobState.textContent = "Recovering";
  appendLog("Retrying failed scenes", { jobId: selectedJobId });
  retryFailedScenesBtn.disabled = true;
  try {
    const result = await window.hermes.youtubeRetryFailedScenes(selectedJobId);
    latestOutputPath = result.assets?.jobDir || result.finalVideo?.jobDir || latestOutputPath;
    latestOutput.disabled = !latestOutputPath;
    latestOutput.textContent = latestOutputPath || "No output";
    updateArtifactPanel({ finalPath: result.finalVideo?.finalPath, jobDir: result.assets?.jobDir });
    appendLog("Failed scene retry finished", result.finalVideo || result);
    await renderJobs();
  } catch (error) {
    jobState.textContent = "Recovery Failed";
    appendLog("Failed scene retry failed", error?.message || String(error));
  } finally {
    updateRecoveryActions();
  }
}

async function renderExistingAssets() {
  if (!selectedJobId) return;
  jobState.textContent = "Rendering";
  appendLog("Rendering existing assets", { jobId: selectedJobId });
  renderExistingAssetsBtn.disabled = true;
  try {
    const result = await window.hermes.youtubeRenderExistingAssets(selectedJobId);
    latestOutputPath = result.finalVideo?.finalPath || latestOutputPath;
    latestOutput.disabled = !latestOutputPath;
    latestOutput.textContent = latestOutputPath || "No output";
    updateArtifactPanel({ finalPath: result.finalVideo?.finalPath, jobDir: result.finalVideo?.jobDir });
    appendLog("Existing asset render finished", result.finalVideo || result);
    await renderJobs();
  } catch (error) {
    jobState.textContent = "Render Failed";
    appendLog("Existing asset render failed", error?.message || String(error));
  } finally {
    updateRecoveryActions();
  }
}

async function retryThumbnail() {
  if (!selectedJobId) return;
  jobState.textContent = "Thumbnail Retry";
  appendLog("Retrying thumbnail only", { jobId: selectedJobId });
  retryThumbnailBtn.disabled = true;
  try {
    const result = await window.hermes.youtubeRetryThumbnail(selectedJobId);
    latestOutputPath = result.jobDir || latestOutputPath;
    latestOutput.disabled = !latestOutputPath;
    latestOutput.textContent = latestOutputPath || "No output";
    updateArtifactPanel({
      thumbnailPath: result.thumbnail?.path,
      jobDir: result.jobDir,
      primaryProviderFailure: result.thumbnail?.primaryProviderFailure,
    });
    appendLog("Thumbnail retry finished", {
      thumbnailPath: result.thumbnail?.path,
      primaryProviderFailure: result.thumbnail?.primaryProviderFailure,
    });
    await renderJobs();
    await loadUploadPanel(selectedJobId);
  } catch (error) {
    jobState.textContent = "Thumbnail Retry Failed";
    appendLog("Thumbnail retry failed", error?.message || String(error));
  } finally {
    updateRecoveryActions();
  }
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
      selectedJobId = job.id;
      latestOutputPath = job.finalVideo || job.jobDir || "";
      latestOutput.disabled = !latestOutputPath;
      latestOutput.textContent = latestOutputPath || "No output";
      jobState.textContent = job.status || "Selected";
      updateArtifactPanel({ finalPath: job.finalVideo, jobDir: job.jobDir, thumbnailPath: job.thumbnailPath });
      updateRecoveryActions();
      await loadUploadPanel(job.id);
      await restoreConsoleHistory(job.id);
    });
    return item;
  }));
}

for (const target of ["chatgpt", "gemini", "googleFlow", "youtube", "notebooklm", "googleWorkspace"]) {
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

  document.querySelector(`#auth-change-${target}`)?.addEventListener("click", async () => {
    appendLog(`Changing ${target} account`);
    try {
      const result = await window.hermes.authChangeAccount(target);
      appendLog(`${target} account change`, result);
      if (target === "youtube") await handleYouTubeAuthResult(result);
      await renderAuthStatus();
    } catch (error) {
      appendLog(`${target} account change failed`, error?.message || String(error));
    }
  });

  document.querySelector(`#auth-clear-${target}`)?.addEventListener("click", async () => {
    const confirmed = window.confirm(`Clear saved ${target} session on this computer?`);
    if (!confirmed) return;
    appendLog(`Clearing ${target} session`);
    try {
      const result = await window.hermes.authClearSession(target);
      appendLog(`${target} session cleared`, result);
      await renderAuthStatus();
    } catch (error) {
      appendLog(`${target} session clear failed`, error?.message || String(error));
    }
  });
}

webwrightDiagnosticsEnabled?.addEventListener("change", async () => {
  const current = await window.hermes.configGet?.().catch(() => ({}));
  const next = {
    ...(current || {}),
    webwrightDiagnosticsEnabled: Boolean(webwrightDiagnosticsEnabled.checked),
  };
  await window.hermes.configSave?.(next);
  appendLog("Webwright diagnostics setting updated", {
    webwrightDiagnosticsEnabled: next.webwrightDiagnosticsEnabled,
  });
});

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
    selectedJobId = result.job?.id || "";
    latestOutputPath = result.assets?.jobDir || "";
    latestOutput.disabled = !latestOutputPath;
    latestOutput.textContent = latestOutputPath || "No output";
    jobState.textContent = "Preview Complete";
    appendLog("Job finished", result.finalVideo || result);
    updateRecoveryActions();
    await renderJobs();
    await loadUploadPanel(selectedJobId);
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
  if (event?.type === "youtube-upload-completed" || event?.type === "youtube-upload-failed") {
    loadUploadPanel(event.jobId || selectedJobId).catch((error) => appendLog("Upload panel refresh failed", error?.message || String(error)));
  }
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

updateRecoveryActions();
