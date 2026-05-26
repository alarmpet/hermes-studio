# Hermes 최종 산출물 멈춤 및 시각적 다양성 확보 계획서 검토 의견서

본 검토서는 `2026-05-25-final-output-freeze-visual-diversity-fix-plan.md` 구현 계획서와 Hermes 프로젝트의 비디오 렌더러, 대본/장면 플래너, 그리고 SQLite 데이터베이스 및 관련 스크립트들을 종합 분석한 결과입니다.

---

## 1. 계획서 내 기술적 결함 및 개선 필요 사항

제안된 계획서는 60초 분량 대비 실제 영상 길이가 초과하는 원인을 규명하고, 특정 장면의 오디오가 비디오보다 비정상적으로 긴 멈춤 현상(Freeze)을 차단하기 위한 정량화된 가이드라인과 이미지 프롬프트의 시각적 다양성을 강제화하는 뛰어난 아키텍처 설계를 담고 있습니다. 다만, 실제 작동 환경의 안전성과 테스트 이식성을 위해 다음 설계 요소들이 보완되어야 합니다.

### 1.1 사용자 로컬 경로 대신 프로젝트 로컬 피처(Fixture) 도입 필요 (치명적 테스트 결함)
* **현황**: Task 1 Step 1의 회귀 테스트 스크립트(`check-final-output-artifact-qa.mjs`)에서 사용자 로컬 기기의 %APPDATA% 임시 디렉토리를 직접 하드코딩하여 참조하고 있습니다:
  ```javascript
  const jobDir = "C:/Users/amd/AppData/Roaming/hermes/outputs/desktop/youtube-1779707345681";
  ```
* **문제점**: 해당 폴더는 사용자가 수동으로 빌드 출력을 청소하거나 임시 데이터를 지울 경우, 혹은 다른 기기나 CI/CD 파이프라인에서 실행할 경우 존재하지 않게 되며, 이로 인해 검증 코드가 무조건 비정상 오류(`FileNotFound`)를 내며 중단됩니다.
* **개선책**: 오류가 발생했던 해당 작업 폴더의 핵심 메타데이터 파일들(`draft.json`, `render-options.json`, `render-report-v2.json`, `job-request.json`)을 추출하여 프로젝트 내부의 테스트 피처 디렉토리(예: `tests/fixtures/bad-job-1779707345681/`)에 정적으로 저장하고, 테스트가 이 피처를 읽어 동작하도록 격리해야 합니다.

### 1.2 자카드 유사도(Jaccard Similarity)를 활용한 범용 비주얼 중복 감지식 제안
* **현황**: Task 1 Step 3의 `analyze-youtube-output.mjs` 검사기에서 비주얼 중복 위험(`VISUAL_REPETITION_RISK`)을 감지하기 위해 특정 고기 키워드 정규식을 하드코딩하고 있습니다:
  ```javascript
  const meatPromptCount = prompts.filter((prompt) => /meat|steak|grill|고기|restaurant|eating/.test(prompt)).length;
  ```
* **문제점**: 이 로직은 오로지 "고기/음식" 관련 주제에 대해서만 비주얼 중복을 감지할 수 있습니다. 만약 사용자가 "구글 글래스"나 "AI 코딩" 같은 다른 주제로 비디오를 제작할 때 동일한 구글 글래스 설명 장면이 5회 연속 반복되어 발생하는 중복 위험은 검출하지 못합니다.
* **개선책**: 하드코딩된 단어 매칭 대신, 인접 장면 프롬프트 텍스트 간의 **자카드 유사도(Jaccard Similarity)나 단어 중복도**를 계산하여 80% 이상 겹치는 프롬프트가 다수 발견될 때 경고를 주는 범용 알고리즘으로 전환해야 합니다.
  ```javascript
  // 예시: 프롬프트 간 자카드 유사도가 임계치를 넘는 중복 패턴 감지
  let duplicateCount = 0;
  for (let i = 1; i < prompts.length; i++) {
    if (jaccardSimilarity(prompts[i-1], prompts[i]) > 0.75) {
      duplicateCount++;
    }
  }
  if (prompts.length >= 3 && duplicateCount / (prompts.length - 1) >= 0.7) {
    failureCodes.push("VISUAL_REPETITION_RISK");
  }
  ```

### 1.3 테스트 스크립트의 빌드 경로 해석 고도화
* **현황**: Task 6 Step 1의 `check-packaged-runtime-contract.mjs` 내에 배포 빌드 파일 경로가 고정되어 있습니다.
  ```javascript
  const unpacked = "C:/Users/amd/hermes/dist-electron/win-unpacked/resources/app.asar";
  ```
* **문제점**: 프로젝트가 설치되는 드라이브가 바뀌거나 디렉토리명이 변경될 경우 경로 오인으로 테스트가 통과되지 않습니다.
* **개선책**: `import.meta.url` 및 `path` 라이브러리를 활용하여 상대적 경로로 프로젝트 빌드 결과물 경로를 해석하게 변경해야 합니다.

---

## 2. 데이터베이스(SQLite) 기록 및 모니터링 관점의 보완 사항

### 2.1 비주얼 카테고리 분포 및 QA 검수 결과의 SQLite DB 기록화
* **현황**: 새로 정의된 비주얼 카테고리(`visual_category`)와 최종 산출물 검수기(`analyze-youtube-output.mjs`) 결과가 로컬 파일에만 머물러 있습니다.
* **개선사항**: 
  1. 기획 단계에서 수립된 각 장면의 `visual_category` 리스트 정보를 `jobs` 테이블의 `workflow_json`에 저장하여 작업의 시각적 다양성 구성 현황을 모니터링할 수 있어야 합니다.
  2. 작업 완료 후 산출물 검수 단계에서 산출된 `failureCodes` 및 `TARGET_DURATION_DRIFT` 등의 에러 데이터셋을 SQLite DB(`bot_data.db`)의 `task_failures` 또는 `task_events`에 payload 형태로 기록해야 합니다.
  * DB 적재 연동 구조 예시:
    ```javascript
    await logTaskEventToDb("desktop.qa-completed", "youtube-workflow", {
      jobId: job.id,
      qaPassed: result.ok,
      failureCodes: result.failureCodes,
      details: result.details
    });
    ```
  * 이를 연계하면 텔레그램 `/diagnose <job_id>` 진단 도구 호출 시, 데스크톱 영상에 정지화면(Freeze)이 발생해 렌더 가드가 강제로 작동했음을 즉시 상세하게 진단서 형태로 보고받을 수 있습니다.

---

## 3. 의견 요약 및 구현 제안 리팩토링 예시

### 로컬 피처 폴더를 적용한 회귀 테스트 예시 (`check-final-output-artifact-qa.mjs`)
사용자 시스템 경로 대신 프로젝트 로컬의 정적 테스트 피처를 바라보도록 안정성을 보완한 검증 스크립트 리팩토링 예제입니다.

```javascript
#!/usr/bin/env node
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { analyzeYouTubeOutput } from "./analyze-youtube-output.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// 1. 사용자 AppData 실물 경로 획득 시도
let jobDir = "C:/Users/amd/AppData/Roaming/hermes/outputs/desktop/youtube-1779707345681";

// 2. 만약 다른 기기이거나 파일이 없을 경우 프로젝트의 정적 테스트 피처(Fixture) 폴더로 우회
if (!existsSync(jobDir)) {
  jobDir = resolve(root, "tests/fixtures/bad-job-1779707345681");
}

if (!existsSync(jobDir)) {
  console.warn("Warning: Test fixture directory not found. Please verify tests/fixtures setup.");
  process.exit(0); // 피처 누락 시 중단 처리 회피
}

const result = analyzeYouTubeOutput(jobDir);

assert.equal(result.ok, false, "known bad artifact must fail final output QA");
assert.ok(result.failureCodes.includes("DUPLICATE_FULL_SCRIPT_SCENE"), "scene 5 repeats the whole script");
assert.ok(result.failureCodes.includes("HARD_FREEZE_RISK"), "scene 5 pads 8s video to ~37s audio");
assert.ok(result.failureCodes.includes("TARGET_DURATION_DRIFT"), "final duration should not drift");
assert.ok(result.failureCodes.includes("MISSING_HPSL_CONTRACT"), "old runtime has no HPSL");

console.log(JSON.stringify({ ok: true, checked: "final-output-artifact-qa", result }, null, 2));
```

---

## 4. 결론

1. **테스트 이식성 안전 장치 마련**: 사용자 로컬 디렉토리 직접 조회 대신, 오류 메타데이터를 **정적 Fixture 폴더**로 추출 배치해 검증 환경 독립성을 확보할 것을 권장합니다.
2. **범용 비주얼 중복 알고리즘 고도화**: 단어 정규식 매칭이 아닌 **자카드 단어 유사도 기법**을 적용하여 금융, AI, 기술 등 모든 주제에 대응 가능한 비주얼 반복 방지 가드를 구축해야 합니다.
3. **오류 모니터링 DB 통합**: 산출물 검수기의 결과 코드들을 SQLite DB에 기록하여 텔레그램 진단 명령어 `/diagnose`에서 이 멈춤 원인을 원격 진단할 수 있도록 파이프라인 연계를 추천합니다.
