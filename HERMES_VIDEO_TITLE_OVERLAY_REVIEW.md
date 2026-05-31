# Hermes Studio Video Top Title Overlay Review

본 검토서는 `2026-05-31-video-top-title-overlay-plan.md` 구현 계획서와 Hermes Studio 비디오 합성 엔진(`scripts/render-youtube-with-tts.mjs`), 옵션 스키마(`youtube-job-schema.mjs`), 그리고 FFmpeg/Sharp 미디어 합성 워크플로우를 교차 대조하여 식별한 성능 병목, 포맷 호환성 문제 및 개선 방향을 담은 의견서입니다.

---

## 1. 개요 (Executive Summary)

제안된 비디오 상단 제목 오버레이(Video Top Title Overlay) 계획서는 쇼츠와 롱폼 비디오의 시각적 완성도(Aesthetics)를 높이기 위해 상단 헤더 영역에 제목이나 훅 문구를 배치하고, 자막과의 간섭을 방지하도록 영역을 설계한 우수한 기획안입니다. 

* **강점**: 윈도우 한글 인코딩에 취약한 FFmpeg `drawtext` 필터를 피하고, Node.js `sharp` 라이브러리를 통해 투명 배경의 제목 레이어 PNG를 렌더링한 후 FFmpeg의 `overlay` 필터로 비디오 위에 얹는 접근 방식은 매우 안전하고 이식성이 높습니다.
* **보완 필요 영역**: 그러나 제안된 단계적 FFmpeg 실행안은 동일한 비디오를 **두 번 연속으로 트랜스코딩(Re-encoding)**하게 설계되어 있어 심각한 성능 저하와 렌더링 시간 지연을 유발합니다. 또한 Sharp가 내부적으로 사용하는 `librsvg` 파서의 Strict 규격 문제로 일부 그라데이션 및 색상 렌더링이 실패할 위험이 존재합니다.

---

## ## 2. 식별된 주요 문제점 및 잠재적 버그 (Identified Issues & Bugs)

### 2.1 롱폼 비디오 기본값(Disabled) 정규화 규칙 모호성
* **현상**: 계획서에서는 "Longform 기본: `titleOverlayEnabled: false`"를 UX 의사결정으로 규정하고 있습니다.
* **원인**: 그러나 `DEFAULT_YOUTUBE_JOB_OPTIONS`에 `titleOverlayEnabled: true`가 선언되어 있어, `youtube-job-schema.mjs`에서 `{ ...DEFAULT_YOUTUBE_JOB_OPTIONS, ...explicitOptions }`로 병합할 때 사용자가 명시적으로 `titleOverlayEnabled` 값을 주지 않은 롱폼 작업이라도 자동으로 `true`로 셋팅됩니다.
* **해결책**: `normalizeYouTubeJobRequest` 내에서 롱폼 비디오인 경우 사용자 명시적 지정 여부를 감지해 디폴트를 `false`로 세밀히 격리해 주어야 합니다.
  ```javascript
  // youtube-job-schema.mjs
  options.titleOverlayEnabled = options.videoFormat === "longform"
    ? (Object.prototype.hasOwnProperty.call(explicitOptions, "titleOverlayEnabled") ? Boolean(explicitOptions.titleOverlayEnabled) : false)
    : options.titleOverlayEnabled !== false;
  ```

### 2.2 FFmpeg 이중 트랜스코딩으로 인한 성능 병목 (중요)
* **현상**: 계획서 L381-399에서는 제목 오버레이가 있을 때 `merged-scenes-titled.mp4`를 `-c:v libx264`로 먼저 한 번 인코딩하고, 그 결과물을 입력으로 받아 자막(`subtitles`)을 태워 다시 한 번 `finalPath`로 2차 인코딩합니다.
* **결과**: 이 방식은 동일한 고화질 비디오(특히 10분 이상의 롱폼 비디오)를 연속으로 2회 완전 재압축하므로, **렌더링 시간이 약 2배로 증가**하고 비디오 화질(Quality)이 열화됩니다.
* **해결책**: FFmpeg의 `filter_complex`를 활용하여 제목 오버레이 적용(`overlay`)과 자막 번인(`subtitles`) 작업을 **단일 패스(Single-pass)로 결합하여 하나의 인코딩 명령**으로 수행해야 합니다.
  ```javascript
  // 단일 렌더링 파이프라인 최적화 (scripts/render-youtube-with-tts.mjs)
  let videoFilterArgs = [];
  if (createdTitleOverlay) {
    const escapedSrtPath = escapeFilterPath(srtPath);
    const forceStyle = subtitleForceStyle();
    // overlay 필터링 후 [v_title] 라벨을 subtitle 필터의 입력으로 이어받아 단일 출력 [v] 생성
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
    "-c:a", "copy", // 오디오는 코덱 복사로 초고속 처리
    "-movflags", "+faststart",
    finalPath,
  ]);
  ```
* **영향**: 이 최적화를 적용하면 `merged-scenes-titled.mp4` 중간 파일이 불필요해지므로, 계획서에 포함된 `check-title-overlay-render-contract.mjs` 검사 파일의 `assert.match(renderer, /merged-scenes-titled\.mp4/)` 항목도 단일 패스 콤퍼지션 검사로 변경되어야 합니다.

---

## 3. 포맷 호환성 및 SVG 렌더링 개선 사항 (SVG/Sharp Compatibility)

### 3.1 Sharp/librsvg의 `rgba(...)` 그라데이션 파싱 실패 위험
* **현상**: 계획서 L348의 SVG Defs 내에는 `<stop stop-color="rgba(0,0,0,.78)"/>` 형식으로 알파 채널 투명도가 선언되어 있습니다.
* **원인**: Node.js `sharp`가 사용하는 내부 SVG 렌더링 라이브러리인 `librsvg`는 운영체제 포팅 버전 및 라이브러리 빌드 사양에 따라 `stop-color` 내의 `rgba` 포맷을 해석하지 못하고 투명도를 누락하거나 오류(Solid Black 렌더링)를 뱉을 수 있습니다.
* **해결책**: W3C 표준 규격에 따라 `stop-color`에는 16진수 색상값(`#000000`)을 지정하고, 알파 채널 투명도는 `stop-opacity` 속성으로 분리 선언해야 100% 완벽한 크로스 플랫폼 호환성이 보장됩니다.
  ```xml
  <!-- 수정 전 -->
  <stop offset="0" stop-color="rgba(0,0,0,.78)"/><stop offset="1" stop-color="rgba(0,0,0,0)"/>
  
  <!-- 수정 후 (안전한 표준 방식) -->
  <stop offset="0" stop-color="#000000" stop-opacity="0.78"/><stop offset="1" stop-color="#000000" stop-opacity="0"/>
  ```

### 3.2 스타일 프리셋 데이터 모델 및 SVG rect fill 정규화
* **현상**: 프리셋 구조에 `background: "rgba(0,0,0,0.86)"`처럼 컬러 문자열에 투명도를 혼합하여 정의하였습니다.
* **개선책**: 그라데이션 투명도 분리 기조와 마찬가지로, 스타일 프리셋에 `backgroundOpacity` 필드를 정규화하여 선언하고, SVG rect 생성 시 `fill-opacity` 속성으로 매핑하면 데이터 핸들링이 한결 유연해지고 SVG 렌더링도 견고해집니다.
  ```javascript
  // 프리셋 데이터 모델 정규화 예시
  {
    id: "bold-black-accent",
    label: "Bold Black Accent",
    background: "#000000",
    backgroundOpacity: 0.86,
    primary: "#ffffff",
    accent: "#fde047",
    outline: "#000000",
  }
  ```
  ```javascript
  // SVG rect 적용
  `<rect x="0" y="${safeTop}" width="${TARGET_WIDTH}" height="${bandHeight}" fill="${preset.background}" fill-opacity="${preset.backgroundOpacity ?? 1.0}"/>`
  ```

---

## 4. 제목 줄 바꿈 알고리즘 고도화 (Title Wrapping Algorithm)

* **현상**: 계획서의 `wrapTitle`은 고정 글자 수(`maxChars`) 기준으로 텍스트를 무조건 쪼개는 단순 문자 슬라이싱 방식을 택하고 있습니다. 이 경우 `"바뀐"` 과 `"시장의"` 사이에서 어절이 깨져 가독성이 저해될 수 있습니다.
* **개선책**: 기존 자막 Wrapping 모듈(`wrapSubtitle`)과 동일한 기조를 유지하여 띄어쓰기(어절) 단위로 1차 분할을 시도하고, 어절 길이가 제한을 초과하는 특수 경우에만 문자 단위로 쪼개는 "Smart 어절 래핑" 로직을 도입하는 것이 프리셋의 타이포그래피 품질을 대폭 끌어올릴 수 있습니다.

---

## 5. 결론 (Conclusion)

본 비디오 상단 제목 오버레이 계획서는 매우 현실적이고 효과적인 썸네일/동영상 UX 개선책입니다. 특히 본 검토서에서 제안한 **FFmpeg 단일 패스(Single-pass) 필터 합성 최적화**를 적용할 경우, 고해상도 긴 비디오 렌더링 시 **기존 대비 인코딩 속도를 40%~50% 가까이 절감**할 수 있는 획기적인 퍼포먼스 향상이 기대됩니다. 아울러 Sharp의 SVG 그라데이션 파싱 위험을 해소하여 빌드 안정성도 완벽히 확보할 수 있습니다.

* **의견서 저장 위치**: `C:\Users\amd\hermes\HERMES_VIDEO_TITLE_OVERLAY_REVIEW.md` (UTF-8 인코딩)
