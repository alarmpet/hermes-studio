# Hermes 비디오 산출물 QA, 대본 품질 및 화면 멈춤 해결 계획서 검토 의견서

본 검토서는 `2026-05-25-final-output-qa-script-quality-and-freeze-fix-plan.md` 구현 계획서와 Hermes 프로젝트의 렌더링 파이프라인, AI 대본 생성 플래너, 그리고 SQLite 데이터베이스 및 관련 스크립트들을 종합 분석한 결과입니다.

---

## 1. 계획서 내 기술적 제약 및 개선 필요 사항

제안된 계획서는 실제 최종 산출물 데이터(`render-report-v2.json`, `freezedetect` 로그 등)를 기반으로 비디오가 중간에 멈추는 현상(Freeze)의 정확한 원인을 진단하고, 대본 반복 및 Gemini 플레이스홀더 응답 필터링 등 실질적인 품질 향상 방안을 담고 있습니다. 다만, 실제 작동 환경의 제약으로 인해 아래의 설계 보완이 필요합니다.

### 1.1 렌더링 서브프로세스(`render-youtube-with-tts.mjs`)의 동적 자동화 실행 불가 제약 (치명적)
* **현황**: Phase 3에서는 오디오와 비디오의 매칭 비율이 어긋날 경우(`ratio > 1.20` 또는 차이가 1.5초 이상일 때) 단순 정지 화면 복사 대신 "장면을 분할하여 Flow 클립을 추가 생성"하거나 "보조 B-roll을 하나 더 생성"할 것을 제안하고 있습니다.
* **문제점**: 최종 렌더 스크립트인 `render-youtube-with-tts.mjs`는 메인 워크플로우 실행 스레드와 분리된 **별도의 독립적인 서브프로세스**로 실행됩니다.
  * 이 시점에는 이미 모든 플레이라이트(Playwright) 브라우저 제어와 구글 Flow 세션이 종료된 상태이며, 해당 스크립트는 브라우저 세션 자격 증명이나 로더에 대한 접근 권한을 전혀 갖고 있지 않습니다.
  * 따라서 렌더 스크립트 내부에서 동적으로 구글 Flow를 호출하여 비디오 클립을 추가 생성하거나 분할 다운로드하는 작업은 원천적으로 불가능합니다.
* **개선책**: 
  1. **사전 차단(Phase 1 & 2)**: 렌더 스크립트로 넘어가기 전, 장면 기획 단계(`script-planner.mjs`)에서 대본 음절 수 대비 장면 재생 시간의 예상 비율을 엄격히 검사하여 사전에 적합한 시간 분배 및 장면 수 확장을 완료해야 합니다.
  2. **에러 전파 및 재시도(Phase 3)**: 만약 렌더 스크립트 수준에서 비율 초과나 2초 이상의 프리즈가 검출될 경우, 스크립트는 자체적으로 생성을 시도하지 말고 구체적인 오류 코드 및 구조화된 JSON 데이터(`requiresRegeneration: true`)를 출력하고 종료해야 합니다. 그 후 상위 Orchestrator인 `youtube-job-runner.mjs`가 이를 받아서 특정 장면의 미디어 생성을 재수행하거나 분할하는 흐름으로 처리해야 합니다.

### 1.2 정적 검증(Static Check)이 아닌 실시간 동적 QA 게이트 도입 필요
* **현황**: Phase 1에서 `check-youtube-draft-quality.mjs`를 추가하여 대본 반복이나 플레이스홀더 여부를 검사하고 이를 `npm run check`에 연결할 것을 계획하고 있습니다.
* **문제점**: 단순히 코드가 커밋될 때 수행하는 정적 테스트나 파일 검사로는, **실제 운영 중에 AI가 실시간으로 만들어내는 비정상적인 응답(플레이스홀더, 중복 대본 등)**을 차단하고 복구할 수 없습니다.
* **개선책**: 대본 QA 검사 로직을 `youtube-workflow-stages.mjs` 또는 `youtube-workflow.mjs` 내의 `buildDraft` 실행부 직후에 **동적 게이트(Dynamic Gate)** 형태로 삽입해야 합니다.
  * Gemini 응답 수신 직후 이 QA 게이트를 태우고, 실패할 경우 즉시 예외를 발생시켜 상위 프로세스가 OpenRouter Fallback을 타거나 재생성 요청을 보내도록 실시간 런타임에 통합해야 합니다.

### 1.3 렌더 단계에서의 영상 루핑(Looping) 및 배속 조절(Slowdown) 완화 조건 추가
* **현황**: 영상 길이보다 음성이 길 때 무조건 에러를 내고 실패(`ratio > 1.35` 시 실패) 처리하도록 타이트하게 제한하고 있습니다.
* **문제점**: 구글 Flow에서 생성된 소스 영상이 8초인데 음성이 10초인 경우(차이 2초, ratio 1.25), 단 2초 차이 때문에 전체 생성 파이프라인을 실패 처리하고 재호출하는 것은 리소스와 시간 소모가 큽니다. B-roll 영상 특성상 약간의 멈춤이나 대기는 치명적이지 않을 수 있습니다.
* **개선책**: 
  * 하드 실패처리 비율(`ratio > 1.35`)에 도달하기 전 완화 조건(예: `1.10 < ratio <= 1.30` 구간)에서는, 마지막 프레임을 복사하는 대신 **영상을 미세하게 배속 조절(Slowing down)**하거나, **소스를 루핑(Looping / Forward-Backward bounce)**하여 렌더링하는 대체 기법을 적용함으로써 생성 성공률을 극대화해야 합니다.

---

## 2. 데이터베이스(SQLite) 및 시스템 모니터링 관점의 보완 사항

### 2.1 QA 실패 상세 결과의 SQLite DB 기록화
* **현황**: 최종 산출물 QA의 실패 요인(프리즈 발생 시간대, 대본 반복 유사도, 플레이스홀더 감지 건)이 단순히 에러 텍스트로만 리턴됩니다.
* **개선사항**: QA 검사 결과 발생한 경고(`qualityWarnings`)나 정지 위험 지표(`freezeRisk`), 재생성 요구 정보(`requiresRegeneration`)를 SQLite DB(`bot_data.db`)의 `task_failures` 테이블에 구조화된 JSON 데이터로 남겨야 합니다.
  * 이를 통해 텔레그램 `/diagnose` 명령을 내릴 때 단순 "실패"가 아니라, `"장면 5에서 대본 100% 중복율 감지 및 24.9초 프리즈 위험으로 인한 QA 차단"`이라는 정량화된 지표를 관리자가 실시간으로 확인하고 조치할 수 있게 됩니다.

---

## 3. 의견 요약 및 구현 제안 리팩토링 예시

### 보완된 동적 QA 게이트 및 렌더 가드 통합 구조 제안

1. **워크플로우 내부의 동적 QA 게이트 연계 (`youtube-workflow-stages.mjs`)**
```javascript
import { validateDraftQuality } from "./scripts/check-youtube-draft-quality.mjs";

export async function buildResearchDraft(job, context = {}) {
  try {
    const draft = await buildGeminiResearchDraft(job, context);
    
    // 런타임 동적 QA 검사 수행
    const qaResult = validateDraftQuality(draft);
    if (!qaResult.ok) {
      throw new Error(`QA Gate Rejected: ${qaResult.reason}`);
    }
    
    return draft;
  } catch (error) {
    if (context.allowOpenRouterFallback === false) throw error;
    // 실패 시 OpenRouter로 Fallback
    context.emit?.({ type: "workflow-warning", message: `Gemini draft failed QA: ${error.message}. Trying OpenRouter.` });
    const fallbackDraft = await buildDesktopYouTubeDraft(job, context);
    
    const qaFallbackResult = validateDraftQuality(fallbackDraft);
    if (!qaFallbackResult.ok) {
      throw new Error(`Fallback Draft also failed QA: ${qaFallbackResult.reason}`);
    }
    return fallbackDraft;
  }
}
```

2. **렌더 스크립트 내의 영상 보정(Loop/Slow) 및 가드 예시 (`render-youtube-with-tts.mjs`)**
```javascript
// renderSceneVideo 함수 수정안 예시
function renderSceneVideo({ rawVideo, audioPath, audioDuration, order }) {
  const videoDuration = getMediaDuration(rawVideo);
  const adjustedVideo = join(JOB_DIR, `scene_${order}_video_adjusted.mp4`);
  const finalScene = join(JOB_DIR, `scene_${order}_synced.mp4`);
  const ratio = audioDuration / videoDuration;

  if (ratio > 1.35) {
    // 35% 이상 차이 날 경우 복사 대기가 너무 길어지므로 렌더링을 차단하고 재생성 마크 부여
    throw new Error(`RENDER_QA_FAILURE: Scene ${order} audio is too long (${audioDuration}s) for video (${videoDuration}s). Ratio ${ratio.toFixed(2)} exceeds max limit 1.35.`);
  }

  // 완화 구간: 1.10 ~ 1.30 사이일 경우 배속 조정(Slowdown) 처리로 멈춤 현상 보정
  if (ratio > 1.10 && ratio <= 1.35) {
    const setpts = ratio.toFixed(6);
    run(ffmpegPath, [
      "-y",
      "-i", rawVideo,
      "-an",
      "-vf", `setpts=${setpts}*PTS`, // 비디오 속도를 오디오 길이에 맞춤 (슬로우 비디오)
      "-t", String(audioDuration),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "20",
      adjustedVideo,
    ]);
  } else {
    // 기존의 setpts / tpad / trim 분기 처리 적용
    ...
  }
  ...
}
```

---

## 4. 결론

1. **런타임 동적 QA 게이트 구현**: `check-youtube-draft-quality.mjs` 검사기를 단순 정적 테스트용이 아닌, **실제 대본 생성 모듈 내부의 실행 필터**로 삽입하여 불량 데이터가 다음 파이프라인(TTS, 구글 Flow)으로 흘러 들어가는 것을 원천 봉쇄해야 합니다.
2. **렌더 서브프로세스의 재생성 플래그화**: 렌더 스크립트에서는 영상 재생성을 직접 처리할 수 없으므로, 비율 초과 혹은 프리즈 검출 시 **에러 플래그와 상세 JSON 리포트**를 던지고 종료한 후, 이를 상위 프로세스에서 캐치하여 처리하도록 설계를 고도화해야 합니다.
3. **영속적 에러 로깅 활성화**: 감지된 렌더 경고나 QA 실패 내용을 SQLite DB에 정밀히 기록하여 텔레그램 진단 명령어 `/diagnose`를 통해 데스크톱 오류 현황을 투명하게 파악할 수 있도록 보완할 것을 강력히 권장합니다.
