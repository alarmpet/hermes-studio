export const JOB_PROGRESS_PHASES = [
  { id: "submitted", label: "작업 접수", percent: 5, message: "작업을 접수했습니다." },
  { id: "source-research", label: "자료 확인", percent: 12, message: "입력 자료를 확인하는 중입니다." },
  { id: "script-draft", label: "대본 생성", percent: 24, message: "대본 초안을 생성하는 중입니다." },
  { id: "scene-planning", label: "장면 구성", percent: 34, message: "대본을 장면 단위로 나누는 중입니다." },
  { id: "flow-media", label: "Google Flow 영상 생성", percent: 56, message: "Google Flow에서 장면 영상을 생성하는 중입니다." },
  { id: "render", label: "TTS/자막/최종 렌더", percent: 82, message: "음성, 자막, 최종 영상을 렌더링하는 중입니다." },
  { id: "thumbnail", label: "썸네일 생성", percent: 92, message: "영상 맥락을 반영한 썸네일을 준비하는 중입니다." },
  { id: "completed", label: "완료", percent: 100, message: "최종 영상 생성이 완료되었습니다." },
];

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
