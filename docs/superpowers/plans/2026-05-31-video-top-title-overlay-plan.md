# Video Top Title Overlay (with Auto-Text Resolution) Implementation Plan

Hermes Studio가 최종 영상 상단에 영상 제목 또는 사용자가 지정한 훅 문구를 보기 좋게 렌더링한다. 쇼츠는 세로 상단 헤더형 제목을 기본 활성화하고, 롱폼/가로 영상은 선택형으로 제공한다. 사용자가 제목 문구를 비워두면 생성된 대본 제목, HPSL 훅/포인트, 키워드 등을 활용해 가장 정제된 제목 문구를 자동 분석(Auto-Text Resolution)하여 노출한다.

---

## 1. UX 및 아키텍처 의사결정 (UX & Architecture Decisions)

### 1.1 기본값 정책
* **Shorts 기본**: `titleOverlayEnabled: true`
* **Longform 기본**: `titleOverlayEnabled: false`
* **위치**: 상단 고정 (Shorts는 safeTop: 84px, 가로는 safeTop: 40px 기본)
* **텍스트 결정**: 사용자가 직접 수동 입력하면 그 문구(`manual`)를 최우선으로 사용하고, 비워두면 정교한 우선순위 규칙에 따라 대본에서 추출한 자동 제목(`auto`)을 노출한다.
* **줄 수**: 최대 2줄로 제한하고 넘어가면 자르며 말줄임표(…) 처리한다.
* **자막과의 간섭 방지**: 제목은 상단, 기존 자막은 중하단 영역을 유지하여 시각적 충돌을 방지한다.

### 1.2 렌더링 파이프라인 최적화 (Single-pass FFmpeg)
기존 계획안은 비디오에 제목 오버레이 PNG를 합성하는 1차 인코딩 패스(`merged-scenes-titled.mp4`)를 거치고, 그 위에 자막을 굽는 2차 인코딩 패스를 순차 실행하게 되어 있어 비디오 인코딩 시간이 2배로 증가하고 화질 열화가 발생했습니다.
* **해결**: FFmpeg의 `filter_complex`를 활용하여 제목 오버레이 합성(`overlay`)과 자막 번인(`subtitles`)을 **단일 패스(Single-pass)로 묶어 인코딩 프로세스를 1회로 단축**하고 렌더링 성능을 40~50% 극대화한다.

### 1.3 그라데이션 및 색상 호환성 보장 (Sharp & SVG)
`sharp`가 사용하는 내부 SVG 파서(`librsvg`)는 `rgba(...)` 색상 코드를 비표준 그라데이션 값으로 판정하여 투명도를 무시하거나 렌더링 오류를 낼 위험이 큽니다.
* **해결**: SVG 그라데이션 선언 시 Hex 코드와 `stop-opacity`를 명시적으로 분리 선언하고, 프리셋의 배경 역시 Hex 코드와 `backgroundOpacity`로 구분하여 100% 견고한 SVG 이미지를 생산한다.

---

## 2. 데이터 규약 (Data Contract)

`DEFAULT_YOUTUBE_JOB_OPTIONS`에 아래 옵션을 추가한다.

```js
titleOverlayEnabled: true,
titleOverlayMode: "auto",      // "auto" | "manual"
titleOverlayText: "",
titleOverlayStyleId: "bold-black-accent",
titleOverlayMaxLines: 2,
titleOverlaySafeTop: 84,
```

### 정규화 규칙
1. `videoFormat === "longform"`이고 사용자가 명시적으로 활성화하지 않은 경우, `titleOverlayEnabled` 기본값은 `false`로 적용된다.
2. `titleOverlayText`에 값이 채워져 있으면 `titleOverlayMode`는 자동으로 `"manual"`로 승격된다.
3. `titleOverlaySafeTop` 범위는 Shorts(9:16)는 `0..160`, 가로(16:9)는 `0..90`으로 한계를 규정한다.

---

## 3. 구현 단계별 가이드 (Implementation Steps)

### Task 1: 제목 오버레이 스타일 프리셋 추가
* **[NEW]** [title-overlay-presets.mjs](file:///C:/Users/amd/hermes/electron/services/title-overlay-presets.mjs) 파일 생성.
```js
export const TITLE_OVERLAY_PRESETS = [
  {
    id: "bold-black-accent",
    label: "Bold Black Accent",
    background: "#000000",
    backgroundOpacity: 0.86,
    primary: "#ffffff",
    accent: "#fde047",
    outline: "#000000",
  },
  {
    id: "white-editorial",
    label: "White Editorial",
    background: "#ffffff",
    backgroundOpacity: 1.0,
    primary: "#111827",
    accent: "#f97316",
    outline: "rgba(255,255,255,0.75)",
  },
  {
    id: "black-green-hook",
    label: "Black Green Hook",
    background: "#000000",
    backgroundOpacity: 0.9,
    primary: "#ffffff",
    accent: "#22c55e",
    outline: "#000000",
  },
  {
    id: "minimal-shadow",
    label: "Minimal Shadow",
    background: "linear-gradient",
    backgroundOpacity: 0,
    primary: "#ffffff",
    accent: "#ffffff",
    outline: "#000000",
  },
];

export function getTitleOverlayPreset(id = "bold-black-accent") {
  return TITLE_OVERLAY_PRESETS.find((item) => item.id === id) || TITLE_OVERLAY_PRESETS[0];
}
```

### Task 2: 자동 제목 텍스트 해결사(Auto-Text Resolver) 개발
* **[NEW]** [title-overlay-text-resolver.mjs](file:///C:/Users/amd/hermes/electron/services/title-overlay-text-resolver.mjs) 파일 생성.
* LLM을 직접 호출하지 않고 대본 기획 단계의 기 생성 데이터 및 메타데이터를 결정론적 폴백 체인으로 신속 처리한다.
```js
const MAX_AUTO_TITLE_CHARS = 34;

export function resolveTitleOverlayText({ job = {}, draft = {}, sourceValue = "" } = {}) {
  const options = job.options || {};
  const manualText = cleanTitle(options.titleOverlayText || "");
  if (options.titleOverlayMode === "manual" && manualText) {
    return { text: manualText.slice(0, 80), source: "manual" };
  }

  const candidates = [
    ["draft-title", draft.title],
    ["hpsl-hook", draft.hpsl?.hook?.narration],
    ["hpsl-point", draft.hpsl?.point?.narration],
    ["script-first-sentence", firstSentence(draft.script)],
    ["source-value", sourceValue || job.sourceValue],
  ];

  for (const [source, value] of candidates) {
    const text = shortenAutoTitle(cleanTitle(value));
    if (text) return { text, source };
  }

  return { text: "오늘의 핵심 이야기", source: "default" };
}

function firstSentence(text = "") {
  return String(text).split(/(?<=[.!?。！？]|[.?!]\s|다\.)/u)[0] || "";
}

// 특수문자 및 불필요 괄호 제거
function cleanTitle(value = "") {
  return String(value)
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[{}\[\]<>]/g, "")
    .replace(/["'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function shortenAutoTitle(value = "") {
  const cleaned = cleanTitle(value);
  if (!cleaned) return "";
  if (cleaned.length <= MAX_AUTO_TITLE_CHARS) return cleaned;
  const withoutEnding = cleaned
    .replace(/(입니다|습니다|했죠|하죠|합니다|됩니다|이에요|예요)[.!?。！？]?$/u, "")
    .trim();
  const target = withoutEnding || cleaned;
  return `${target.slice(0, MAX_AUTO_TITLE_CHARS - 1).trim()}…`;
}
```

### Task 3: 옵션 스키마 및 자동 해결 흐름 통합
* **[MODIFY]** [youtube-job-schema.mjs](file:///C:/Users/amd/hermes/youtube-job-schema.mjs)
  * `DEFAULT_YOUTUBE_JOB_OPTIONS`에 `titleOverlayMode`, `titleOverlayEnabled` 등 옵션을 탑재하고 정규화 로직을 이식한다.
```javascript
  options.titleOverlayEnabled = options.videoFormat === "longform"
    ? (Object.prototype.hasOwnProperty.call(explicitOptions, "titleOverlayEnabled") ? Boolean(explicitOptions.titleOverlayEnabled) : false)
    : options.titleOverlayEnabled !== false;
  options.titleOverlayMode = String(options.titleOverlayMode || (options.titleOverlayText ? "manual" : "auto")).toLowerCase();
  if (!["auto", "manual"].includes(options.titleOverlayMode)) {
    throw new Error(`Unknown titleOverlayMode: ${options.titleOverlayMode}`);
  }
  if (options.titleOverlayText && options.titleOverlayMode === "auto") {
    options.titleOverlayMode = "manual";
  }
  options.titleOverlayText = String(options.titleOverlayText || "").replace(/\s+/g, " ").trim().slice(0, 80);
  options.titleOverlayStyleId = String(options.titleOverlayStyleId || "bold-black-accent");
  options.titleOverlayMaxLines = Math.max(1, Math.min(2, Math.round(Number(options.titleOverlayMaxLines || 2))));
  options.titleOverlaySafeTop = Math.max(0, Math.min(options.aspectRatio === "16:9" ? 90 : 160, Number(options.titleOverlaySafeTop ?? 84)));
```
* **[MODIFY]** [youtube-job-service.mjs](file:///C:/Users/amd/hermes/electron/services/youtube-job-service.mjs)
  * UI에서 넘어온 `titleOverlayEnabled`, `titleOverlayMode`, `titleOverlayText` 등을 바인딩한다.
* **[MODIFY]** [youtube-workflow.mjs](file:///C:/Users/amd/hermes/youtube-workflow.mjs)
  * 대본 생성이 끝난 직후 `resolveTitleOverlayText`를 구동하여 자동 해결된 제목 문구 및 소스 메타데이터를 `renderOptions`와 `metadata` 구조에 반영한다.

### Task 4: UI 오버레이 설정 조작 기능 및 실시간 프리뷰 구현
* **[MODIFY]** [index.html](file:///C:/Users/amd/hermes/electron/renderer/index.html)
  * 자막 패널 상단에 오버레이 토글, 스타일 선택 콤보박스, 커스텀 제목 입력란 및 설명 문구를 배치한다.
* **[MODIFY]** [app.js](file:///C:/Users/amd/hermes/electron/renderer/app.js)
  * 입력 변화 감지 리스너를 연동하여 실시간 미리보기 텍스트를 업데이트하며, 비어있을 때는 `"Auto: generated title"`로 가이드라인을 그린다.
* **[MODIFY]** [styles.css](file:///C:/Users/amd/hermes/electron/renderer/styles.css)
  * 미리보기 영역의 프리셋 스타일 클래스(`[data-style="..."]`)를 입힌다.

### Task 5: Sharp 이미지 합성 및 단일 패스(Single-pass) FFmpeg 연동
* **[MODIFY]** [render-youtube-with-tts.mjs](file:///C:/Users/amd/hermes/scripts/render-youtube-with-tts.mjs)
  * `createTitleOverlayImage` 함수를 통해 투명 배경 위에 스타일 밴드(또는 Minimal 그라데이션)와 제목을 얹은 PNG 레이어를 빌드한다.
  * SVG 그라데이션의 경우 strict 파서 호환을 위해 `stop-color`와 `stop-opacity`를 명확히 쪼갠다.
  * 어절 단위로 스마트한 줄바꿈을 시도하는 Wrapping 알고리즘을 탑재한다.
```javascript
// 어절 중심의 스마트 래핑 구현
function wrapTitle(text, maxChars, maxLines) {
  const words = String(text || "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (Array.from(next).length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  if (lines.some(line => Array.from(line).length > maxChars * 1.5)) {
    const chars = Array.from(text);
    const charLines = [];
    for (let i = 0; i < chars.length && charLines.length < maxLines; i += maxChars) {
      charLines.push(chars.slice(i, i + maxChars).join("").trim());
    }
    return charLines.filter(Boolean);
  }
  return lines.slice(0, maxLines).filter(Boolean);
}
```
* **[MODIFY]** FFmpeg 합성 분기를 아래처럼 단일 패스 복합 필터(Single-pass Complex Filter)로 교정하여 이중 렌더링 낭비를 사수한다.
```javascript
let videoFilterArgs = [];
if (createdTitleOverlay) {
  const escapedSrtPath = escapeFilterPath(srtPath);
  const forceStyle = subtitleForceStyle();
  const filterGraph = `[0:v][1:v]overlay=0:0[v_title];[v_title]subtitles='${escapedSrtPath}':force_style='${forceStyle}'[v]`;
  videoFilterArgs = [
    "-i", mergedPath,
    "-i", createdTitleOverlay,
    "-filter_complex", filterGraph,
    "-map", "[v]",
    "-map", "0:a?",
  ];
} else {
  const subtitleFilter = `subtitles='${escapeFilterPath(srtPath)}':force_style='${subtitleForceStyle()}'`;
  videoFilterArgs = [
    "-i", mergedPath,
    "-vf", subtitleFilter,
  ];
}

run(ffmpegPath, [
  "-y",
  ...videoFilterArgs,
  "-c:v", "libx264",
  "-preset", "veryfast",
  "-crf", "20",
  "-c:a", "copy",
  "-movflags", "+faststart",
  finalPath,
]);
```

### Task 6: 자가 검증 수트(Contracts) 보완 및 통합 테스트
* **[NEW]** [check-title-overlay-auto-text.mjs](file:///C:/Users/amd/hermes/scripts/check-title-overlay-auto-text.mjs) 생성 (Task 1의 테스트 수트).
* **[NEW]** [check-title-overlay-render-contract.mjs](file:///C:/Users/amd/hermes/scripts/check-title-overlay-render-contract.mjs) 생성.
  * 단일 복합 필터그래프(`/overlay=0:0.*subtitles|subtitles.*overlay=0:0/`)를 통해 이중 인코딩 없이 단일 패스 렌더링이 이루어지고 있는지 확인하는 단언문을 추가한다.
* **[MODIFY]** `scripts/check-youtube-job-schema.mjs`, `check-studio-v2-ux.mjs`, `check-render-pipeline.mjs` 검증 항목 추가 보강.

---

## 4. 최종 인수 조건 (Acceptance Criteria)

1. `npm.cmd run check`가 오류 없이 성공해야 한다.
2. 수동 제목이 비어있을 때는 대본 기획 결과에 기반하여 `Auto: generated title`로 자동 추출되어 비디오 상단에 합성된다.
3. 영상 렌더링에 이중 인코딩 과정이 존재하지 않으며, 단 1회의 FFmpeg 트랜스코딩으로 제목 오버레이와 자막이 한번에 도출된다.
4. `render-report-v2.json` 및 `title-overlay.json` 메타데이터에 실제 합성된 제목과 그 근원(source)이 누락 없이 기록된다.
