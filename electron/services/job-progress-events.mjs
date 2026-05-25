export const JOB_PROGRESS_PHASES = [
  { id: "submitted", label: "작업 접수", percent: 5, message: "작업을 접수했습니다." },
  { id: "research", label: "Gemini 자료 수집", percent: 12, message: "Gemini에서 키워드 또는 URL 자료를 확인하는 중입니다." },
  { id: "draft", label: "대본 생성", percent: 24, message: "대본과 장면 구성을 생성하는 중입니다." },
  { id: "scene-planning", label: "장면 구성", percent: 34, message: "대본 문장에 맞춰 장면과 Flow 프롬프트를 구성하는 중입니다." },
  { id: "flow-submit", label: "Flow 생성 요청", percent: 45, message: "Google Flow에 장면 생성 요청을 넣는 중입니다." },
  { id: "flow-media", label: "Flow 영상 생성", percent: 62, message: "Google Flow에서 장면 영상을 생성하고 다운로드하는 중입니다." },
  { id: "render", label: "TTS/자막/최종 렌더", percent: 82, message: "음성, 자막, 최종 영상을 렌더링하는 중입니다." },
  { id: "thumbnail", label: "썸네일 생성", percent: 92, message: "제목과 대본 맥락을 반영한 썸네일을 생성하는 중입니다." },
  { id: "upload", label: "YouTube 업로드", percent: 96, message: "승인된 영상을 YouTube에 업로드하는 중입니다." },
  { id: "completed", label: "완료", percent: 100, message: "최종 영상 생성이 완료되었습니다." },
];

export function isRenderRunnerFailure(message = "") {
  return /Chromium\/Electron mode|Gpu Cache Creation failed|Unable to move the cache|disk_cache|ELECTRON_RUN_AS_NODE/i
    .test(String(message || ""));
}

export function renderRunnerActionRequired() {
  return {
    title: "최신 설치본 재실행 필요",
    message: "렌더 실행기가 Electron/Chromium 모드로 실행되었습니다. 앱을 완전히 종료한 뒤 최신 Hermes YouTube Studio.exe로 다시 실행하세요.",
  };
}

export function createFailureProgressEvent({ jobId = "", message = "", details = {} } = {}) {
  const renderRunnerFailure = isRenderRunnerFailure(message);
  return createJobProgressEvent({
    jobId,
    phase: renderRunnerFailure ? "render" : "submitted",
    status: renderRunnerFailure ? "action-required" : "failed",
    message: renderRunnerFailure
      ? "렌더 실행기가 Electron/Chromium 모드로 실행되어 최종 렌더가 중단되었습니다."
      : message || "작업이 실패했습니다.",
    details: { ...details, originalError: message },
    actionRequired: renderRunnerFailure ? renderRunnerActionRequired() : null,
  });
}

export function createJobProgressEvent({
  jobId = "",
  phase,
  status = "running",
  message,
  details = {},
  actionRequired = null,
}) {
  const phaseMeta = JOB_PROGRESS_PHASES.find((item) => item.id === phase);
  return {
    type: "job-progress",
    jobId,
    phase,
    status,
    label: phaseMeta?.label || phase,
    percent: phaseMeta?.percent || 0,
    message: message || phaseMeta?.message || phaseMeta?.label || phase,
    details,
    actionRequired,
    updatedAt: new Date().toISOString(),
  };
}

export function emitJobProgress(emit, event) {
  if (typeof emit !== "function") return;
  emit(createJobProgressEvent(event));
}
