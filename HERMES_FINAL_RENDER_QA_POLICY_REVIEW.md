# Hermes 최종 렌더 QA 정책 일원화 계획서 검토 의견서

본 검토서는 `2026-05-28-final-render-qa-policy-fix-plan.md` 구현 계획서와 Hermes 프로젝트의 비디오 렌더러, 대본/장면 플래너, 최종 QA 검증기(`analyze-youtube-output.mjs`), Electron 서비스 및 SQLite DB 로깅 구조를 종합 검토하여 작성한 기술 분석 및 개선 의견서입니다.

---

## 1. 계획서 내 핵심 문제점 및 디자인 검토

제안된 계획서는 Hermes Studio 작업 과정에서 비디오 렌더링에 성공했음에도 최종 검수 QA 단계에서 발생했던 `HARD_FREEZE_RISK` 오판 현상을 규명하고, 싱크 정책 엔진(`classifyDurationSyncPolicy`)을 재사용함으로써 정책 불일치(Mismatch) 문제를 원천 차단하는 훌륭한 아키텍처 개선안을 담고 있습니다. 이에 대해 코드 및 아키텍처 관점에서 다음 조치를 추가하거나 면밀히 준수할 것을 제안합니다.

### 1.1 `classifyDurationSyncPolicy()` 호출 시의 `outputMode` 전달 안정성 확보
* **현황**: `classifyDurationSyncPolicy()` 함수는 비디오 모드(`ratio <= 1.7`, `extraHoldSeconds <= 4`)와 이미지 모드(`ratio <= 3.0`, `extraHoldSeconds <= 30`)에 대해 각각 다른 싱크 임계치를 적용합니다.
* **검토 의견**: 최종 QA 스크립트인 `analyze-youtube-output.mjs`는 `render-report-v2.json`의 `scenes` 배열 데이터를 매핑하여 검수합니다. 기획서에서 제시한 `scene.sceneOutputMode || scene.sourceMode || scene.outputMode || ""` 순서의 폴백 체인은 매우 적절하며, 이를 통해 씬 속성 데이터를 안전하게 추출하여 정책 엔진에 온전히 전달되도록 설계해야 합니다.
* **예외 처리 권장**: `strategy === "still-image-fps-duplicate"`로 지정된 스틸 이미지 변환 씬의 경우 비디오 프레임 자체가 정지 자산으로부터 복제된 특수 형태이므로, 최종 QA의 단순 프레임 속도 검사에서 프리즈 현상으로 분류되지 않도록 `sceneOutputMode: "image"`인 경우는 `HARD_FREEZE_RISK` 검사 목록에서 완전히 제외하거나 경고 우선 모드로 분류해야 합니다.

### 1.2 리그레션 테스트 내 임시 디렉토리 라이프사이클 보장
* **현황**: Task 1에서 제안된 `check-final-output-soft-slowdown-qa.mjs`는 동적 픽스처 데이터를 로컬에 작성하여 테스트를 수행합니다.
* **검토 의견**: 파일 누락 위험을 극적으로 차단하는 훌륭한 기법이나, 실행 시마다 임시 폴더(`qa-soft-slowdown-fixture`)가 생성되므로 테스트 종료 후 잔여 임시 디렉토리가 시스템에 누적되지 않도록 `fs.rmSync(tempJobDir, { recursive: true, force: true })` 등을 실행하는 안전한 클린업 프로세스(cleanup stage)가 반드시 구현되어야 테스트 안정성을 높일 수 있습니다.

---

## 2. 사용자 인터페이스(UI) 및 관측성(Observability) 관점의 보완 사항

### 2.1 사용자 메시지 및 오류 식별성 고도화
* **현황**: 최종 QA 검수에서 실패하더라도 UI에서는 단순 렌더링 실패로 표시되어 사용자는 무엇 때문에 작업이 실패했는지 진단하기가 어렵습니다.
* **개선책**: `electron/services/job-progress-events.mjs`에서 `Final output QA failed:` 예외를 파싱할 때 렌더 에러와 별개로 다음처럼 명확하게 구분해야 합니다.
  * **렌더 실패 (FFmpeg / 모듈 Crash)**: "최종 비디오 생성에 실패했습니다. (프로세스 이상)"
  * **QA 차단 (품질 규격 불일치)**: `"최종 영상 파일은 생성됐지만 QA 검수에서 막혔습니다."`와 같은 구체적인 원인 피드백 제공.
  * `details` 필드에 `finalVideoExists: true`, `qaFailure: true`, `failureCodes` 배열을 명확하게 담아 프론트엔드 콘솔에서도 이를 기반으로 복구 안내를 띄울 수 있도록 설계합니다.

### 2.2 데이터베이스(SQLite) 기록 및 모니터링 연동 보완
* **현황**: `workflow-db-events.mjs` 내부의 `failureCodeOf()` 파싱 함수는 최종 QA 오류 코드(`HARD_FREEZE_RISK`, `TARGET_DURATION_DRIFT`, `VISUAL_REPETITION_RISK`)에 대한 직접 매핑 로직이 없습니다.
* **개선책**: 작업 결과 SQLite 데이터베이스(`bot_data.db`)의 `task_failures` 테이블에 고정된 에러 메시지만 쌓이지 않고 구조화된 에러 코드가 Prefix로 적재되도록 보강해야 합니다.
  * `event.details.failureCodes` 또는 `event.details.finalOutputQa.failureCodes`가 존재한다면 그 중 첫 번째 값을 `failureCode`로 지정하여 `[HARD_FREEZE_RISK] ...` 형태로 DB에 인덱싱될 수 있도록 연동합니다.
  * 이렇게 연계되어야 관리자가 텔레그램 원격 진단 명령어 `/diagnose <job_id>`를 호출했을 때 "비디오 렌더러는 돌았으나, 싱크 이상이나 비주얼 반복으로 인해 QA 검수에서 커트당했음"을 실시간으로 파악할 수 있습니다.

---

## 3. 구현 리팩토링 세부 안

본의 아니게 발생할 수 있는 구현 오류를 최소화하기 위해, 주요 연계 스크립트의 보완 예시를 아래와 같이 제안합니다.

### 3.1 `analyze-youtube-output.mjs` (QA 로직 리팩토링 예시)
```javascript
// scripts/analyze-youtube-output.mjs 수정 안 예시
import { classifyDurationSyncPolicy } from "./render-duration-policy.mjs";

// ... 이전 로직 생략

// 1. 하드 프리즈 필터 조건 개선
const hardFreezeScenes = reportScenes
  .map((scene) => {
    const videoDuration = Number(scene.videoDuration || 0);
    const audioDuration = Number(scene.audioDuration || 0);
    const ratio = videoDuration > 0 ? audioDuration / videoDuration : Number.POSITIVE_INFINITY;
    const extraHoldSeconds = Math.max(0, audioDuration - videoDuration);
    
    // sceneOutputMode를 유연하게 추출
    const outputMode = scene.sceneOutputMode || scene.sourceMode || scene.outputMode || "";
    
    // 중앙 정책 가져오기
    const policy = classifyDurationSyncPolicy({
      order: scene.order,
      videoDuration,
      audioDuration,
      outputMode,
    });

    return {
      order: scene.order,
      videoDuration,
      audioDuration,
      ratio: Number(ratio.toFixed(3)),
      strategy: scene.strategy || "",
      extraHoldSeconds: Number(extraHoldSeconds.toFixed(3)),
      sceneOutputMode: outputMode,
      policyStrategy: policy.strategy,
      policyFailureCode: policy.failureCode,
      policyRequiresRegeneration: policy.requiresRegeneration
    };
  })
  .filter((scene) => {
    // 2. slowdown-loop는 requiresRegeneration이 true인 경우에만 컷트
    // tpad 전략이거나, 명시적으로 고위험 프리즈거나, 정책상 재생성이 필수적인 경우 차단
    return (
      scene.strategy === "tpad" ||
      scene.policyFailureCode === "INVALID_MEDIA_DURATION" ||
      scene.policyRequiresRegeneration === true
    );
  });

if (hardFreezeScenes.length) {
  failureCodes.push("HARD_FREEZE_RISK");
  details.hardFreezeScenes = hardFreezeScenes;
}

// ... 이후 로직 생략
```

### 3.2 `job-progress-events.mjs` (사용자 이벤트 리팩토링 예시)
```javascript
// electron/services/job-progress-events.mjs 수정 안 예시
export function createFailureProgressEvent({ jobId = "", message = "", details = {} } = {}) {
  const renderRunnerFailure = isRenderRunnerFailure(message);
  const finalOutputQaFailure = /Final output QA failed/i.test(String(message || ""));
  
  let friendlyMessage = message || "작업이 실패했습니다.";
  if (renderRunnerFailure) {
    friendlyMessage = "렌더 실행기가 Electron/Chromium 모드로 실행되어 최종 렌더가 중단되었습니다.";
  } else if (finalOutputQaFailure) {
    const reasonCode = String(message).replace(/Final output QA failed:\s*/i, "");
    friendlyMessage = `최종 영상 파일은 생성됐지만 QA 검수에서 막혔습니다. (${reasonCode})`;
  }

  return createJobProgressEvent({
    jobId,
    phase: renderRunnerFailure || finalOutputQaFailure ? "render" : "submitted",
    status: renderRunnerFailure ? "action-required" : "failed",
    message: friendlyMessage,
    details: { 
      ...details, 
      originalError: message,
      finalVideoExists: finalOutputQaFailure,
      qaFailure: finalOutputQaFailure,
    },
    actionRequired: renderRunnerFailure ? renderRunnerActionRequired() : null,
  });
}
```

### 3.3 `workflow-db-events.mjs` (DB 로깅 연동 리팩토링 예시)
```javascript
// workflow-db-events.mjs 내 failureCodeOf() 함수 보완 예시
function failureCodeOf(event = {}) {
  // 1. 직접 구조화된 failureCode 필드가 있는 경우 최우선 추출
  const directCode = event.details?.failureCode
    || event.details?.qa?.failureCode
    || event.details?.durationQa?.failureCode
    || event.details?.eventType
    || event.error?.code
    || "";
  if (directCode === "flow-mode-mismatch") return "FLOW_MODE_MISMATCH";
  if (directCode) return String(directCode);

  // 2. 최종 QA 실패에 적재된 failureCodes 배열 파싱 추가
  if (Array.isArray(event.details?.failureCodes) && event.details.failureCodes.length > 0) {
    return event.details.failureCodes[0];
  }
  if (Array.isArray(event.details?.finalOutputQa?.failureCodes) && event.details.finalOutputQa.failureCodes.length > 0) {
    return event.details.finalOutputQa.failureCodes[0];
  }

  const text = [
    event.message,
    event.error?.message,
    event.details?.reason,
  ].filter(Boolean).join(" ");

  // 3. 대체 정규식 감지 강화
  if (/HARD_FREEZE_RISK/i.test(text)) return "HARD_FREEZE_RISK";
  if (/TARGET_DURATION_DRIFT/i.test(text)) return "TARGET_DURATION_DRIFT";
  if (/VISUAL_REPETITION_RISK/i.test(text)) return "VISUAL_REPETITION_RISK";
  if (/SOURCE_GROUNDING_MISMATCH/i.test(text)) return "SOURCE_GROUNDING_MISMATCH";
  if (/FLOW_PROMPT_ASPECT_MISMATCH|16:9.*9:16|aspect/i.test(text)) return "FLOW_PROMPT_ASPECT_MISMATCH";
  if (/HPSL_STRUCTURE_MISMATCH|Expected HPSL/i.test(text)) return "HPSL_STRUCTURE_MISMATCH";
  if (/output mode mismatch|flow-mode-mismatch/i.test(text)) return "FLOW_MODE_MISMATCH";
  if (/duration.*too short/i.test(text)) return "DRAFT_DURATION_TOO_SHORT";
  if (/duration.*too long/i.test(text)) return "DRAFT_DURATION_TOO_LONG";
  return "";
}
```

### 3.4 `check-final-output-soft-slowdown-qa.mjs` (임시 디렉토리 정리 강화 예시)
```javascript
// scripts/check-final-output-soft-slowdown-qa.mjs 내 테스트 실행 후 정리 로직 추가 예시
import { rmSync } from "node:fs";

try {
  // ... 테스트 실행 및 Assert 구문
} finally {
  // 테스트 종료 후 임시 디렉토리를 깨끗하게 정리하여 호스트 시스템 찌꺼기 누적 방지
  if (tempJobDir && existsSync(tempJobDir)) {
    rmSync(tempJobDir, { recursive: true, force: true });
  }
}
```

---

## 4. 결론 및 제안 요약

1. **정책 단일화 아키텍처 완벽 지지**: `classifyDurationSyncPolicy()`를 최종 QA에 재사용하는 핵심 설계는 완전히 타당하며, 이미지 모션 복제 씬(`still-image-fps-duplicate`) 등 특화 씬들에 오판이 나지 않도록 유연하게 연동되어야 합니다.
2. **테스트 완성도 향상**: `check-final-output-soft-slowdown-qa.mjs` 리그레션 테스트 실행 후 생성된 임시 폴더를 안전하게 삭제(rmSync)하여 빌드/테스트 환경의 무결성을 유지할 것을 강력히 권장합니다.
3. **사용자 경험(UX) 개선 및 DB 연동 구축**: 최종 비디오 생성 성공 후 QA에서 막힌 경우와 인코더가 크래시된 경우를 에러 레벨에서 정확히 구분해 주는 한국어 사용자 피드백을 구현하고, 실패 유형(`HARD_FREEZE_RISK` 등)을 SQLite DB의 `task_failures` 테이블에 구조화하여 적재함으로써, 텔레그램 명령 및 통합 모니터링 환경의 진단 정밀도를 제고해야 합니다.
