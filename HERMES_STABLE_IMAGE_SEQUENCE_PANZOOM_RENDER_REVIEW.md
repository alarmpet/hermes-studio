# Hermes 스틸 이미지 시퀀스 모션 렌더링 계획서 검토 의견서

본 검토서는 `2026-05-28-stable-image-sequence-panzoom-render-plan.md` 구현 계획서와 Hermes 프로젝트의 비디오 렌더러, 대본/장면 플래너, 최종 QA 검증기(`analyze-youtube-output.mjs`), Electron 서비스 및 SQLite DB 로깅 구조를 연계하여 검토한 결과입니다.

---

## 1. 아키텍처적 장점 및 타당성 분석

제안된 계획서는 그동안 FFmpeg `zoompan` 필터의 소수점 좌표 계산 및 크롭 연산 오차로 인해 발생했던 미세 화면 떨림(Jitter, Tremor) 문제를 원천 차단하기 위한 혁신적인 아키텍처적 개선안입니다. 

### 1.1 지터 현상의 원천 배제
FFmpeg의 자체 필터(`zoompan`) 대신 Node.js 수준에서 `sharp`와 수학적 계산(Monotonic Camera Path)을 사용해 픽셀 단위 경계 좌표를 정밀하게 사전 계산하는 구조는 화질 왜곡과 micro-jitter를 완전히 제거하므로 비주얼 완성도를 극적으로 높여줍니다.

### 1.2 모션 속도/프레임 중복 제어 도입의 영리함
`framesPerMotionStep` 정책을 통해 모션 감도(`light`, `medium`, `strong`)를 조절하고, 특히 고주파 떨림을 억제하기 위해 `light` 강도에서 2프레임 단위로 가상 카메라 위치를 갱신하게 한 접근은 프레임 레이트 일관성과 모션 부드러움을 동시에 충족하는 뛰어난 설계 방식입니다.

---

## 2. 발생 가능한 핵심 리스크 및 개선 의견 (Technical Risks & Mitigation)

구현 단계에서 발생할 수 있는 주요 병목 및 장애 요인을 최소화하기 위해 다음 개선안을 제안합니다.

### 2.1 디스크 I/O 부하 및 오버헤드 방지책 (가장 치명적인 리스크)
* **현황**: 30fps로 10초짜리 스틸 이미지 씬 하나를 만들려면 300개의 JPEG/PNG 프레임 이미지를 디스크에 임시 생성(`motion-cache/scene_<order>/`)한 뒤 FFmpeg로 다시 인코딩해야 합니다. 만약 60초 분량에 이미지 씬이 6개 이상 존재하면 총 **1,800개 이상의 이미지 파일 쓰기/읽기 작업**이 발생합니다.
* **리스크**: SSD가 아닌 HDD 환경이나 윈도우 백신(Windows Defender 등)의 실시간 감시 기능이 동작하는 호스트 PC에서는 대량의 이미지 생성 및 삭제 과정에서 급격한 속도 저하(디스크 I/O 병목)가 유발되어 렌더 타임이 배 이상 늘어날 위험이 있습니다.
* **대비책 (FFmpeg concat 데모 제안)**:
  * 프레임을 1,800개 모두 디스크에 쓸 필요 없이, 중복 프레임(`framesPerMotionStep = 2`)일 때는 실제 고유 프레임(150개)만 디스크에 쓰고 FFmpeg의 `concat` 입력 방식(텍스트 매니페스트에서 동일 이미지 파일 라인을 중복 나열하여 듀레이션 강제 지정)을 이용하는 방법이 있습니다.
  * 또는 `sharp`로 렌더링된 고유 이미지 프레임 파일들을 인코딩이 끝나는 즉시 가비지 컬렉션(GC) 수준으로 즉각 개별 삭제하여 디스크 용량 누적과 파일 핸들 오버헤드를 막는 안전 코드가 반드시 `stable-image-sequence-renderer.mjs` 내부에 내장되어야 합니다.

### 2.2 오디오-비디오 듀레이션 오차 누적 방지 (싱크 엄격화)
* **현황**: `frameCount = Math.round(durationSeconds * fps)` 식을 사용할 때 소수점 처리 방식에 따라 최종 씬 비디오의 실물 길이에 미세한 차이(±1~2프레임)가 생길 수 있습니다.
* **리스크**: 이 미세 프레임 오차가 7개 이상의 씬에 누적될 경우, 최종 비디오 병합(`concat`) 시 영상과 자막/오디오의 싱크가 뒤로 갈수록 밀리는 누적 싱크 드리프트(Accumulative Drift)가 유발될 수 있습니다.
* **대비책**: 오디오 길이 `durationSeconds`에 극도로 정밀하게 맞춰 프레임을 빌드하되, 최종 프레임의 인코딩 길이를 오디오 파일 실측 길이와 완벽히 동기화하도록 FFmpeg 인코딩 시 `-t` 파라미터 또는 오디오 병합(`aac` 복사 단계) 시 엄격하게 자르는 게이트웨이를 포함해야 합니다.

### 2.3 지터 QA 감지 정밀화 (방향성 검증)
* **현황**: Task 5의 `check-image-motion-jitter-qa.mjs`에서 인접 프레임 간의 평균 픽셀 델타(Delta) 값을 비교하여 지터 발생 여부를 파악합니다.
* **리스크**: 카메라 줌/팬 동작 시 단순 픽셀 변화량 크기만 비교하면 모션이 Monotonic(단조로운 한 방향 이동)하게 흐르지 않고 뒤로 밀렸다가 앞으로 가는 "역방향 지터(Nausea tremor)" 현상을 정확히 파악하기 어렵습니다.
* **개선책**: 지터 QA는 인접 프레임들 간의 이동 벡터 방향이 일정한 패턴(단조 증가 또는 단조 감소)을 유지하는지 **'모션 방향 일관성(Directional Monotonicity)'**을 샘플링하여 검증해야 합니다. 연속적인 프레임들 사이의 변화율 방향이 수시로 반전된다면(`+` 델타와 `-` 델타가 번갈아 출현) 지터 오류로 검출하도록 고도화합니다.

---

## 3. SQLite DB 기록 및 모니터링 연동 보완

### 3.1 최종 QA의 신규 에러 코드 DB 매핑 지원
* **현황**: 새로 정의된 에러 코드들(`LEGACY_ZOOMPAN_IMAGE_RENDER`, `MISSING_IMAGE_SEQUENCE_MANIFEST`, `IMAGE_SEQUENCE_MOTION_COLLAPSED` 등)이SQLite 데이터베이스에 기록되지 않으면 원격 진단 봇이나 분석 콘솔에서 모니터링하기 어렵습니다.
* **개선책**: `workflow-db-events.mjs`의 에러 파싱 로직(`failureCodeOf`)에 신규 에러 식별자를 직접 탑재해야 합니다.

---

## 4. 핵심 모듈별 리팩토링 및 연동 제안 예시

### 4.1 `workflow-db-events.mjs` (에러 코드 보강 예시)
```javascript
// workflow-db-events.mjs 내 failureCodeOf() 함수 보완 예시
function failureCodeOf(event = {}) {
  const directCode = event.details?.failureCode
    || event.details?.qa?.failureCode
    || event.details?.durationQa?.failureCode
    || event.details?.eventType
    || event.error?.code
    || "";
  if (directCode === "flow-mode-mismatch") return "FLOW_MODE_MISMATCH";
  if (directCode) return String(directCode);

  // 1. 세부 failureCodes 배열 내 신규 지터 QA 에러 우선 검출
  if (Array.isArray(event.details?.failureCodes)) {
    const matched = event.details.failureCodes.find(c => 
      /LEGACY_ZOOMPAN|MISSING_IMAGE_SEQUENCE|IMAGE_SEQUENCE/i.test(c)
    );
    if (matched) return matched;
  }

  const text = [
    event.message,
    event.error?.message,
    event.details?.reason,
  ].filter(Boolean).join(" ");

  // 2. 텍스트 매칭 규칙 보강
  if (/LEGACY_ZOOMPAN_IMAGE_RENDER/i.test(text)) return "LEGACY_ZOOMPAN_IMAGE_RENDER";
  if (/MISSING_IMAGE_SEQUENCE_MANIFEST/i.test(text)) return "MISSING_IMAGE_SEQUENCE_MANIFEST";
  if (/IMAGE_SEQUENCE_MOTION_COLLAPSED/i.test(text)) return "IMAGE_SEQUENCE_MOTION_COLLAPSED";
  if (/IMAGE_SEQUENCE_DELTA_SPIKE/i.test(text)) return "IMAGE_SEQUENCE_DELTA_SPIKE";
  if (/IMAGE_MODE_STILL_SOURCE_MISSING/i.test(text)) return "IMAGE_MODE_STILL_SOURCE_MISSING";

  return "";
}
```

### 4.2 `stable-image-sequence-renderer.mjs` (안전한 GC/클린업 구현 예시)
```javascript
// electron/services/stable-image-sequence-renderer.mjs 일부 예시
import { rmSync, existsSync } from "node:fs";

export async function renderStableImageSequenceClip({
  ffmpegBin,
  imagePath,
  outputPath,
  durationSeconds,
  order,
  motionPreset,
  motionStrength,
  fps,
  jobDir,
  keepFrames = false,
}) {
  const cacheDir = join(jobDir, "motion-cache", `scene_${order}`);
  
  try {
    // 1. sharp를 이용한 고해상도(1296x2304) 노멀라이즈 및 프레임 시퀀스 저장 로직 수행
    // ...
    
    // 2. FFmpeg 인코딩 구동
    // ...
    
    // 3. 매니페스트 JSON 생성
    // ...
    
  } finally {
    // 4. 가비지 컬렉션(GC): keepFrames 플래그가 없으면 임시 디렉토리를 즉시 청소하여 디스크 I/O 병목 및 용량 부족 리스크 완화
    if (!keepFrames && existsSync(cacheDir)) {
      try {
        rmSync(cacheDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`Failed to clean up motion-cache for scene ${order}:`, err);
      }
    }
  }
}
```

---

## 5. 결론 및 요약

1. **아키텍처 혁신 전폭적 지지**: `sharp` 연산 + 단조로운 카메라 경로를 통한 시퀀스 생성은 FFmpeg `zoompan` 고질병인 소수점 진동(jitter)을 완벽히 퇴치하는 훌륭한 시도입니다.
2. **I/O 병목 해소 필수**: 로컬 렌더 장비 사양에 따른 I/O 부하 방지를 위해, 렌더 직후 임시 이미지 시퀀스를 **자동 가비지 컬렉션(GC)으로 즉시 삭제**하는 안전 로직을 구현해야 합니다.
3. **오차 누적에 의한 싱크 밀림 차단**: 씬들의 소수점 프레임 수 누적으로 인한 오디오-비디오 전체 싱크 밀림을 방어할 수 있게 오디오 결합 단계를 엄격하게 바인딩해야 합니다.
4. **DB 모니터링 연계**: 모션 검수 실패 코드들(`LEGACY_ZOOMPAN_IMAGE_RENDER` 등)을 SQLite DB의 `task_failures` 테이블에 온전히 전파하여 원격 모니터링 시스템과의 정합성을 맞출 것을 강력히 추천합니다.
